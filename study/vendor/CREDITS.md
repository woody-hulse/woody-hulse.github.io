# Vendored third-party libraries

These files are vendored (not loaded from a CDN) so the flashcard study app
has zero runtime dependency on external hosts and keeps working offline /
if a CDN goes down. Fetched with `curl` on 2026-08-11.

## jszip.min.js

- Version: 3.10.1
- Source: https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
- Upstream project: https://github.com/Stuk/jszip
- License: MIT (dual-licensed MIT / GPLv3+; used here under the MIT terms)
- Purpose: unzip `.apkg` files (which are plain zip archives) entirely in
  the browser.

## sql-wasm.js + sql-wasm.wasm

- Version: 1.14.1
- Source:
  - https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.js
  - https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm
- Upstream project: https://github.com/sql-js/sql.js
- License: MIT (sql.js itself). sql.js compiles the SQLite amalgamation to
  WebAssembly via Emscripten; SQLite itself is public domain.
- Purpose: read the SQLite3 database embedded in an Anki `.apkg` package
  (`collection.anki21` / `collection.anki2`) directly in the browser via
  WASM, with no server-side processing.
- Note: `sql-wasm.js` is the UMD/asm-style loader; it `fetch()`es
  `sql-wasm.wasm` at runtime. Both files must be served from the same
  directory (`study/vendor/`), and `initSqlJs` is called with a
  `locateFile` callback pointing at that directory — see
  `study/js/anki-import.js`.

Both libraries are permissively licensed (MIT) and safe to redistribute
as part of this repository.
