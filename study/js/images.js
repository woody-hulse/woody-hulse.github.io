// images.js — client-side image helpers: read a File (or raw bytes) into a
// downsized/recompressed data: URI so card images stay reasonably small in
// localStorage. Plain global functions, no side effects beyond the DOM
// canvas/Image elements used transiently to decode/re-encode.

var IMAGE_MAX_DIM = 900;
var IMAGE_QUALITY = 0.82;

function readFileAsDataUri(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('Could not read file.')); };
    reader.readAsDataURL(file);
  });
}

function _loadImageElement(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Could not decode image.')); };
    img.src = src;
  });
}

// Downscales (if needed) and re-encodes any image data: URI as a compressed
// JPEG data: URI, so pasted/imported images don't blow up localStorage.
// Note: this drops alpha transparency (flattened onto white) — an accepted
// tradeoff for keeping stored card images small.
async function compressImageDataUri(dataUri, maxDim, quality) {
  maxDim = maxDim || IMAGE_MAX_DIM;
  quality = quality || IMAGE_QUALITY;

  const img = await _loadImageElement(dataUri);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) return dataUri;

  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch (e) {
    // canvas can be tainted for cross-origin sources; fall back to the
    // original rather than losing the image entirely
    return dataUri;
  }
}

async function fileToCompressedDataUri(file, maxDim, quality) {
  const raw = await readFileAsDataUri(file);
  return compressImageDataUri(raw, maxDim, quality);
}

// Uint8Array -> data: URI (used for media pulled out of an Anki .apkg zip).
function bytesToDataUri(bytes, mimeType) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64 = btoa(binary);
  return 'data:' + (mimeType || 'application/octet-stream') + ';base64,' + base64;
}

var IMAGE_MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml'
};

function guessImageMimeType(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || '');
  const ext = match ? match[1].toLowerCase() : '';
  return IMAGE_MIME_BY_EXT[ext] || null;
}
