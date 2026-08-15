// anki-import.js
//
// Client-side importer for Anki .apkg decks and plain-text/CSV flashcard
// exports. Plain script (no ES module syntax) so it can be loaded with a
// normal <script> tag before whatever UI code calls into it.
//
// Depends on (load these BEFORE this file):
//   study/vendor/jszip.min.js   -> defines global `JSZip`
//   study/vendor/sql-wasm.js    -> defines global `initSqlJs`
//   study/js/images.js          -> defines `bytesToDataUri`, `compressImageDataUri`, `guessImageMimeType`
//
// Public API:
//   importAnkiFile(file)   -> Promise<{front, back, frontImage?, backImage?}[]>  (dispatches by extension)
//   importAnkiPackage(file)-> Promise<{front, back, frontImage?, backImage?}[]>  (.apkg)
//   importPlainText(file)  -> Promise<{front, back}[]>   (.txt / .csv)
//
// -----------------------------------------------------------------------

// Path (relative to the page loading this script) where sql-wasm.wasm and
// sql-wasm.js live, so sql.js's loader can fetch the .wasm binary. Adjust
// this if study/js/anki-import.js is ever moved relative to study/vendor/.
var ANKI_IMPORT_VENDOR_PATH = "vendor/";

// Cached sql.js SQL module (initSqlJs() is somewhat expensive and only
// needs to run once per page load).
var _sqlJsModulePromise = null;

function _getSqlJs() {
  if (!_sqlJsModulePromise) {
    if (typeof initSqlJs !== "function") {
      throw new Error(
        "sql.js is not loaded. Include study/vendor/sql-wasm.js via a <script> tag before anki-import.js."
      );
    }
    _sqlJsModulePromise = initSqlJs({
      locateFile: function (fileName) {
        return ANKI_IMPORT_VENDOR_PATH + fileName;
      },
    });
  }
  return _sqlJsModulePromise;
}

// Strip HTML tags down to plain text. Deliberately simple: collapses <br>
// and block-level tags to newlines/spaces first so text doesn't get mashed
// together, then removes remaining tags and decodes a handful of common
// HTML entities. Not a full HTML parser by design (see task scope).
function _stripHtml(html) {
  if (html == null) return "";
  var s = String(html);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li)>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.trim();
}

// Finds the first <img src="..."> reference in a raw (unstripped) HTML
// field, if any. Only the first image per field is imported (v1 scope).
function _extractFirstImageSrc(html) {
  if (html == null) return null;
  var match = /<img[^>]+src=["']([^"']+)["']/i.exec(String(html));
  return match ? match[1] : null;
}

// -----------------------------------------------------------------------
// .apkg import
// -----------------------------------------------------------------------

// Read a File/Blob into an ArrayBuffer, browser-portable (FileReader based,
// works even where File.prototype.arrayBuffer isn't available).
function _readFileAsArrayBuffer(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(new Error("Could not read file."));
    };
    reader.readAsArrayBuffer(file);
  });
}

// Parses an Anki .apkg (a zip containing a SQLite collection) entirely in
// the browser and returns a best-effort [{front, back}] array.
//
// Anki .apkg format:
//   - It's a plain zip archive.
//   - Newer Anki (2.1.x with the "V2" scheduler / newer sync protocol)
//     stores the collection as `collection.anki21` (SQLite3 DB). Some
//     packages ship `collection.anki21b` (zstd-compressed newer format,
//     not supported here) instead/alongside.
//   - Older Anki versions (and some exports) use `collection.anki2`.
//   - `notes` table has a `flds` column: all field values for that note,
//     joined with the 0x1F (unit separator) character, in the order
//     defined by the note type. Note-type/field-name metadata lives in a
//     `notetypes`/`fields` table (schema v18+) or as a JSON blob in
//     `col.models` (older schema) -- we intentionally don't resolve which
//     field is "Front" vs "Back" by name; we just take the first two
//     fields positionally, which is correct for the stock Basic note type
//     and a reasonable v1 approximation for everything else.
//   - Media files are stored as numerically-named files (0, 1, 2, ...)
//     with a `media` JSON file mapping index -> original filename. We use
//     this to pull in the first <img> referenced in each field: resolved
//     to its zip entry, read as bytes, and re-encoded as a downsized JPEG
//     data: URI (via images.js) so it can be stored as `frontImage`/
//     `backImage` alongside the plain-text `front`/`back`. Audio
//     ([sound:...]) and any image beyond the first per field are not
//     imported (v1 scope) — see Known limitations in the report.
async function importAnkiPackage(file) {
  var buffer;
  try {
    buffer = await _readFileAsArrayBuffer(file);
  } catch (e) {
    throw new Error("Could not read the .apkg file: " + e.message);
  }

  if (typeof JSZip === "undefined") {
    throw new Error(
      "JSZip is not loaded. Include study/vendor/jszip.min.js via a <script> tag before anki-import.js."
    );
  }

  var zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    throw new Error(
      "This doesn't look like a valid .apkg file (couldn't open it as a zip archive)."
    );
  }

  var collectionEntry =
    zip.file("collection.anki21") || zip.file("collection.anki2");

  if (!collectionEntry) {
    if (zip.file("collection.anki21b")) {
      throw new Error(
        "This .apkg uses Anki's newer compressed collection format (collection.anki21b), which isn't supported yet. Try re-exporting from Anki with a legacy/older export option."
      );
    }
    throw new Error(
      "No collection.anki21 or collection.anki2 database found inside this .apkg -- it may be corrupt or not a real Anki package."
    );
  }

  var dbBuffer;
  try {
    dbBuffer = await collectionEntry.async("uint8array");
  } catch (e) {
    throw new Error("Could not extract the collection database from the .apkg.");
  }

  var SQL;
  try {
    SQL = await _getSqlJs();
  } catch (e) {
    throw new Error("Could not initialize the SQLite engine: " + e.message);
  }

  // Media map: original filename -> zip entry name (a stringified index,
  // e.g. "0", "1", ...). Not every .apkg has media; that's fine, images
  // are a best-effort addition on top of the front/back text.
  var mediaMap = {};
  var mediaEntry = zip.file("media");
  if (mediaEntry) {
    try {
      var mediaJson = JSON.parse(await mediaEntry.async("string"));
      Object.keys(mediaJson).forEach(function (idx) {
        mediaMap[mediaJson[idx]] = idx;
      });
    } catch (e) {
      // corrupt/missing media manifest — proceed without images
    }
  }

  var db;
  var cards;
  var imageRefs = []; // { card, field, src } — resolved to data: URIs below
  try {
    db = new SQL.Database(dbBuffer);
    var result = db.exec("SELECT flds FROM notes");
    cards = [];
    if (result && result.length > 0) {
      var rows = result[0].values; // array of [flds] rows
      for (var i = 0; i < rows.length; i++) {
        var flds = rows[i][0];
        if (typeof flds !== "string") continue;
        var fields = flds.split("\x1f");
        var frontRaw = fields[0] || "";
        var backRaw = fields.length > 1 ? fields[1] : "";
        var front = _stripHtml(frontRaw);
        var back = _stripHtml(backRaw);
        if (!front && !back) continue; // skip genuinely empty notes

        var card = { front: front, back: back };

        var frontImgSrc = _extractFirstImageSrc(frontRaw);
        var backImgSrc = _extractFirstImageSrc(backRaw);
        if (frontImgSrc && mediaMap[frontImgSrc] !== undefined) {
          imageRefs.push({ card: card, field: "frontImage", src: frontImgSrc });
        }
        if (backImgSrc && mediaMap[backImgSrc] !== undefined) {
          imageRefs.push({ card: card, field: "backImage", src: backImgSrc });
        }

        cards.push(card);
      }
    }
  } catch (e) {
    throw new Error(
      "The collection database inside this .apkg couldn't be read (it may be corrupt or use an unsupported schema): " +
        e.message
    );
  } finally {
    if (db) {
      try {
        db.close();
      } catch (e) {
        /* ignore */
      }
    }
  }

  if (cards.length === 0) {
    throw new Error("No notes were found in this .apkg (the deck may be empty).");
  }

  // Resolve referenced media images to compressed data: URIs, in parallel.
  // A single failed/unreadable image just leaves that card without one —
  // it never blocks the rest of the import.
  if (imageRefs.length > 0) {
    var haveImageHelpers =
      typeof bytesToDataUri === "function" && typeof compressImageDataUri === "function";
    if (haveImageHelpers) {
      var mediaDataUriCache = {}; // zip entry index -> Promise<dataUri|null>
      var resolveOne = function (idx, filename) {
        if (!(idx in mediaDataUriCache)) {
          mediaDataUriCache[idx] = (async function () {
            var entry = zip.file(idx);
            if (!entry) return null;
            try {
              var bytes = await entry.async("uint8array");
              var mime =
                (typeof guessImageMimeType === "function" && guessImageMimeType(filename)) ||
                "image/jpeg";
              var rawDataUri = bytesToDataUri(bytes, mime);
              try {
                return await compressImageDataUri(rawDataUri);
              } catch (e) {
                return rawDataUri; // still usable even if recompression failed
              }
            } catch (e) {
              return null;
            }
          })();
        }
        return mediaDataUriCache[idx];
      };

      await Promise.all(
        imageRefs.map(async function (ref) {
          var idx = mediaMap[ref.src];
          var dataUri = await resolveOne(idx, ref.src);
          if (dataUri) ref.card[ref.field] = dataUri;
        })
      );
    }
  }

  return cards;
}

// -----------------------------------------------------------------------
// Plain text / CSV import
// -----------------------------------------------------------------------

// Splits one line into fields on the first unquoted tab or comma.
// Handles basic double-quote wrapping ("field, with comma") and doubled
// quotes ("") as an escaped quote -- not a full RFC 4180 parser, but
// enough for typical Anki/Quizlet-style plain-text exports.
function _splitLine(line, delimiter) {
  var fields = [];
  var current = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"' && current === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function _detectDelimiter(sampleLines) {
  var tabCount = 0;
  var commaCount = 0;
  for (var i = 0; i < sampleLines.length; i++) {
    if (sampleLines[i].indexOf("\t") !== -1) tabCount++;
    if (sampleLines[i].indexOf(",") !== -1) commaCount++;
  }
  return tabCount >= commaCount ? "\t" : ",";
}

function _readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(new Error("Could not read file."));
    };
    reader.readAsText(file);
  });
}

// Parses a .txt/.csv flashcard export (tab- or comma-separated, one card
// per line: front<delim>back) into [{front, back}]. Blank lines are
// skipped. Delimiter is auto-detected per file (tab preferred, since
// that's Anki's plain-text export default; falls back to comma).
async function importPlainText(file) {
  var text;
  try {
    text = await _readFileAsText(file);
  } catch (e) {
    throw new Error("Could not read the text file: " + e.message);
  }

  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  var rawLines = text.split(/\r\n|\r|\n/);
  var lines = [];
  for (var i = 0; i < rawLines.length; i++) {
    var line = rawLines[i];
    if (line.trim() === "") continue;
    // Anki plain-text exports may include comment/metadata lines starting
    // with '#' (e.g. "#separator:tab"); skip those.
    if (line[0] === "#") continue;
    lines.push(line);
  }

  if (lines.length === 0) {
    throw new Error("This file doesn't contain any non-empty lines to import.");
  }

  var delimiter = _detectDelimiter(lines.slice(0, 10));

  var cards = [];
  for (var j = 0; j < lines.length; j++) {
    var fields = _splitLine(lines[j], delimiter);
    var front = (fields[0] || "").trim();
    var back = (fields.length > 1 ? fields[1] : "").trim();
    if (!front && !back) continue;
    cards.push({ front: front, back: back });
  }

  if (cards.length === 0) {
    throw new Error("No valid front/back pairs could be parsed from this file.");
  }

  return cards;
}

// -----------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------

function _getExtension(filename) {
  var match = /\.([a-zA-Z0-9]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

// Top-level entry point: detects the import format from the file's
// extension and dispatches to importAnkiPackage() or importPlainText().
// Always resolves with a non-empty [{front, back}] array, or rejects with
// an Error whose .message is safe to show directly to the user.
async function importAnkiFile(file) {
  if (!file) {
    throw new Error("No file was provided.");
  }

  var ext = _getExtension(file.name);

  if (ext === "apkg") {
    return importAnkiPackage(file);
  }
  if (ext === "txt" || ext === "csv" || ext === "tsv") {
    return importPlainText(file);
  }

  throw new Error(
    'Unsupported file type ".' +
      (ext || "?") +
      '". Please choose an Anki .apkg file, or a .txt/.csv/.tsv plain-text export.'
  );
}
