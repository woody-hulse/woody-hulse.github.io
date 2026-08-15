// storage.js — async, swappable-backend key/value store. All public functions
// return Promises so a cloud-backed provider can satisfy the exact same
// signatures without callers changing.
//
// Backend: by default every read/write goes to localStorage (today's
// behaviour, no network). A cloud provider (js/cloud-store.js) can swap in a
// Firestore-backed, load-into-cache + write-through backend at sign-in via the
// window.StudyStorage hook published at the bottom of this file. The rest of
// the app never touches the backend directly — it just calls getCards() etc.

const STUDY_CARDS_KEY = 'study_cards_v1';
const STUDY_DECKS_KEY = 'study_decks_v1';
const STUDY_NAISTS_KEY = 'study_naists_v1';
const STUDY_SETTINGS_KEY = 'study_settings_v1';
const STUDY_PIGS_KEY = 'study_pigs_v1';
const STUDY_USERNAME_KEY = 'study_username_v1';
const STUDY_REVIEW_LOG_KEY = 'study_review_log_v1';
const STUDY_LAST_DECK_KEY = 'study_last_deck_v1';

// sessionCardLimit: 0 means "no limit" (Anki-style per-session review cap).
// backgroundPreset/accentPreset name a themed token pair (see styles.css
// :root[data-bg]/[data-accent]); 'custom' backgroundPreset uses the stored
// (compressed) backgroundImage data URI instead of a preset.
const DEFAULT_SETTINGS = {
  sessionCardLimit: 0,
  backgroundPreset: 'paper',
  accentPreset: 'raspberry',
  backgroundImage: null
};
const DEFAULT_PIG_STATE = { totalPigs: 1, starCount: 0 };
const REVIEW_LOG_MAX_ENTRIES = 5000;

// ---- pluggable backend (string get/set/remove, synchronous) --------------
// The default backend is a thin pass-through to localStorage, so with nothing
// installed storage.js behaves byte-for-byte as it always has.
const _localBackend = {
  getItem: function (key) { return localStorage.getItem(key); },
  setItem: function (key, value) { localStorage.setItem(key, value); },
  removeItem: function (key) { localStorage.removeItem(key); }
};

let _backend = _localBackend;

function readJSON(key, fallback) {
  try {
    const raw = _backend.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  _backend.setItem(key, JSON.stringify(value));
}

async function getDecks() {
  const decks = readJSON(STUDY_DECKS_KEY, []);
  const list = Array.isArray(decks) ? decks : [];
  const defaultIndex = list.findIndex(function (d) { return d.id === DEFAULT_DECK_ID; });
  if (defaultIndex === -1) {
    list.unshift({ id: DEFAULT_DECK_ID, name: 'Gaineral', createdAt: Date.now() });
    writeJSON(STUDY_DECKS_KEY, list);
  } else if (list[defaultIndex].name === 'General') {
    // rename an already-persisted pre-rename default deck in place
    list[defaultIndex] = Object.assign({}, list[defaultIndex], { name: 'Gaineral' });
    writeJSON(STUDY_DECKS_KEY, list);
  }
  return list;
}

async function saveDecks(decks) {
  writeJSON(STUDY_DECKS_KEY, decks);
  return decks;
}

async function addDeck(name, naistId) {
  const decks = await getDecks();
  const deck = createDeck(name, naistId);
  decks.push(deck);
  await saveDecks(decks);
  return deck;
}

// Generic deck-record patch, mirroring updateCard's shape. renameDeck and
// moveDeckToNaist are both thin wrappers around this.
async function updateDeck(id, patch) {
  const decks = await getDecks();
  const index = decks.findIndex(function (d) { return d.id === id; });
  if (index === -1) return null;
  decks[index] = Object.assign({}, decks[index], patch);
  await saveDecks(decks);
  return decks[index];
}

async function renameDeck(id, name) {
  return updateDeck(id, { name: name });
}

// Moves a deck into `naistId` (or to the top level when naistId is
// null/undefined). Purely organizational — never touches scheduling data.
async function moveDeckToNaist(deckId, naistId) {
  return updateDeck(deckId, { naistId: naistId || null });
}

async function deleteDeck(id) {
  if (id === DEFAULT_DECK_ID) return; // the Gaineral deck can't be deleted
  const decks = await getDecks();
  await saveDecks(decks.filter(function (d) { return d.id !== id; }));
  const cards = await getCards();
  const kept = cards.filter(function (c) { return c.deckId !== id; });
  await saveCards(kept);
}

// ---------------- naists (folder-like deck/naist containers) ----------------
// Naists are purely organizational: {id, name, parentNaistId}. They never
// affect SRS scheduling, which stays entirely deck-scoped. Follows the exact
// same JSON-blob-in-localStorage pattern as decks above.

async function getNaists() {
  const naists = readJSON(STUDY_NAISTS_KEY, []);
  return Array.isArray(naists) ? naists : [];
}

async function saveNaists(naists) {
  writeJSON(STUDY_NAISTS_KEY, naists);
  return naists;
}

async function addNaist(name, parentNaistId) {
  const naists = await getNaists();
  const naist = createNaist(name, parentNaistId);
  naists.push(naist);
  await saveNaists(naists);
  return naist;
}

async function renameNaist(id, name) {
  const naists = await getNaists();
  const index = naists.findIndex(function (n) { return n.id === id; });
  if (index === -1) return null;
  naists[index] = Object.assign({}, naists[index], { name: name });
  await saveNaists(naists);
  return naists[index];
}

// Returns true if `candidateAncestorId` is `naistId` itself or one of its
// ancestors — i.e. reparenting `naistId` under `candidateAncestorId` would
// create a cycle. Used by moveNaist below.
function _naistIsAncestor(naists, naistId, candidateAncestorId) {
  let current = candidateAncestorId;
  while (current) {
    if (current === naistId) return true;
    const n = naists.find(function (x) { return x.id === current; });
    current = n ? n.parentNaistId : null;
  }
  return false;
}

// Reparents an existing naist. Not currently wired into any UI (v1 scope
// cut — see task notes), but exercised by the sanity script and available
// for a future drag-and-drop-style reorganize feature. Refuses to create a
// cycle (a naist can't become its own ancestor).
async function moveNaist(id, newParentNaistId) {
  if (newParentNaistId === id) return null;
  const naists = await getNaists();
  if (newParentNaistId && _naistIsAncestor(naists, id, newParentNaistId)) return null;
  const index = naists.findIndex(function (n) { return n.id === id; });
  if (index === -1) return null;
  naists[index] = Object.assign({}, naists[index], { parentNaistId: newParentNaistId || null });
  await saveNaists(naists);
  return naists[index];
}

// Deleting a naist never deletes decks or orphans a whole subtree: every
// deck and child naist directly inside the deleted naist is relocated up to
// ITS parent (i.e. one level up from the deleted naist), exactly like
// deleting a folder in a filesystem "move contents up" style. To delete an
// entire branch including its decks, delete the decks first.
async function deleteNaist(id) {
  const naists = await getNaists();
  const target = naists.find(function (n) { return n.id === id; });
  if (!target) return;
  const parentId = target.parentNaistId || null;

  const relocatedNaists = naists
    .filter(function (n) { return n.id !== id; })
    .map(function (n) { return n.parentNaistId === id ? Object.assign({}, n, { parentNaistId: parentId }) : n; });
  await saveNaists(relocatedNaists);

  const decks = await getDecks();
  const relocatedDecks = decks.map(function (d) {
    return d.naistId === id ? Object.assign({}, d, { naistId: parentId }) : d;
  });
  await saveDecks(relocatedDecks);
}

async function getCards() {
  const cards = readJSON(STUDY_CARDS_KEY, []);
  const list = Array.isArray(cards) ? cards : [];
  // Migration: cards created before decks existed have no deckId — assign them
  // to the default deck in place so every card always has a valid deckId.
  let migrated = false;
  list.forEach(function (c) {
    if (!c.deckId) { c.deckId = DEFAULT_DECK_ID; migrated = true; }
    if (!c.type) { c.type = 'basic'; migrated = true; }
  });
  if (migrated) writeJSON(STUDY_CARDS_KEY, list);
  return list;
}

async function saveCards(cards) {
  writeJSON(STUDY_CARDS_KEY, cards);
  return cards;
}

async function addCard(front, back, deckId, frontImage, backImage) {
  const cards = await getCards();
  const card = createCard(front, back, deckId, undefined, frontImage, backImage);
  cards.push(card);
  await saveCards(cards);
  return card;
}

async function addCards(cardsArray, deckId) {
  const cards = await getCards();
  const newCards = cardsArray.map(function (c) {
    // Preserve image-occlusion fields on round-trip (e.g. re-importing a
    // previously-exported JSON file) without affecting plain Anki-style
    // imports, which never set c.type and so always land as 'basic'.
    const extra = c.type === 'occlusion' ? { type: 'occlusion', image: c.image, regions: c.regions } : undefined;
    return createCard(c.front, c.back, c.deckId || deckId, undefined, c.frontImage, c.backImage, extra);
  });
  const merged = cards.concat(newCards);
  await saveCards(merged);
  return newCards;
}

// Image-occlusion cards don't go through addCard's front/back-text shape —
// they're built directly from an image + a set of rectangular mask regions.
async function addOcclusionCard(image, regions, deckId) {
  const cards = await getCards();
  const card = createCard('[Image occlusion]', '', deckId, undefined, null, null, {
    type: 'occlusion',
    image: image,
    regions: regions
  });
  cards.push(card);
  await saveCards(cards);
  return card;
}

async function updateCard(id, patch) {
  const cards = await getCards();
  const index = cards.findIndex(function (c) { return c.id === id; });
  if (index === -1) return null;
  const updated = Object.assign({}, cards[index], patch);
  cards[index] = updated;
  await saveCards(cards);
  return updated;
}

async function deleteCard(id) {
  const cards = await getCards();
  const filtered = cards.filter(function (c) { return c.id !== id; });
  await saveCards(filtered);
}

async function getSettings() {
  const stored = readJSON(STUDY_SETTINGS_KEY, {});
  return Object.assign({}, DEFAULT_SETTINGS, stored);
}

async function saveSettings(settings) {
  writeJSON(STUDY_SETTINGS_KEY, settings);
}

async function getPigState() {
  const stored = readJSON(STUDY_PIGS_KEY, null);
  if (!stored || typeof stored !== 'object') return Object.assign({}, DEFAULT_PIG_STATE);
  // Merge onto defaults (not a wholesale fallback) so state saved before a
  // field like starCount existed still comes back with it present.
  return Object.assign({}, DEFAULT_PIG_STATE, stored);
}

async function savePigState(state) {
  writeJSON(STUDY_PIGS_KEY, state);
}

async function getUsername() {
  const name = _backend.getItem(STUDY_USERNAME_KEY);
  return name === null || name === undefined ? null : name;
}

async function setUsername(name) {
  _backend.setItem(STUDY_USERNAME_KEY, name);
}

// The deck the Stody tab resumes automatically when opened directly from
// the tab bar (rather than via a deck row's explicit "Stody" button).
// Updated every time a real study/cram session actually starts.
async function getLastStudiedDeckId() {
  const id = _backend.getItem(STUDY_LAST_DECK_KEY);
  return id === null || id === undefined || id === '' ? null : id;
}

async function setLastStudiedDeckId(deckId) {
  if (!deckId) return;
  _backend.setItem(STUDY_LAST_DECK_KEY, deckId);
}

// ---------------- review log (for the Stats view) ----------------
// Each entry: { id, cardId, deckId, rating, timestamp }. Only "real" study
// reviews are logged — cram-mode reviews never call this, by design, so
// they can't skew retention/streak stats.

async function getReviewLog() {
  const log = readJSON(STUDY_REVIEW_LOG_KEY, []);
  return Array.isArray(log) ? log : [];
}

async function logReview(entry) {
  const log = await getReviewLog();
  log.push(entry);
  const trimmed = log.length > REVIEW_LOG_MAX_ENTRIES
    ? log.slice(log.length - REVIEW_LOG_MAX_ENTRIES)
    : log;
  writeJSON(STUDY_REVIEW_LOG_KEY, trimmed);
  return entry;
}

// Used by "undo last rating" so an undone review doesn't linger in stats.
async function deleteReviewLogEntry(id) {
  const log = await getReviewLog();
  const filtered = log.filter(function (e) { return e.id !== id; });
  writeJSON(STUDY_REVIEW_LOG_KEY, filtered);
}

// ---- backend-swap hook (consumed by js/cloud-store.js) -------------------
// Published on window so the Firestore provider (a separate ES module) can
// install itself without this file importing it — keeping the two
// independently swappable, exactly like the auth.js/firebase-config.js split.
window.StudyStorage = {
  // Logical name -> storage key, so the cloud provider knows precisely which
  // keys to load/migrate/sync (single source of truth).
  KEYS: {
    cards: STUDY_CARDS_KEY,
    decks: STUDY_DECKS_KEY,
    naists: STUDY_NAISTS_KEY,
    settings: STUDY_SETTINGS_KEY,
    pigs: STUDY_PIGS_KEY,
    username: STUDY_USERNAME_KEY,
    reviewLog: STUDY_REVIEW_LOG_KEY,
    lastDeck: STUDY_LAST_DECK_KEY
  },
  // Read a raw value straight from localStorage regardless of the active
  // backend — used by the cloud provider to migrate pre-existing local data.
  localGet: function (key) { return _localBackend.getItem(key); },
  // Install a custom backend (must implement getItem/setItem/removeItem).
  useBackend: function (backend) { _backend = backend || _localBackend; },
  // Revert to the default localStorage backend (used on sign-out).
  useLocalBackend: function () { _backend = _localBackend; }
};
