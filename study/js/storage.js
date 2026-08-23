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
// accentPreset names a themed token pair (see styles.css :root[data-accent]).
// backgroundPreset is limited to authored pixel grass textures; old saved
// cosmetic/image background ids normalize back to canonical grass.
// theme: 'light' | 'dark' | 'system' — system leaves data-theme unset so the
// existing prefers-color-scheme token block wins.
const DEFAULT_SETTINGS = {
  sessionCardLimit: 0,
  backgroundPreset: 'grass',
  accentPreset: 'raspberry',
  backgroundImage: null,
  theme: 'system',
  funSpellings: false,
  focusMode: false,
  encouragement: false,
  tagVocab: []
};
const GRASS_BACKGROUND_PRESETS = ['grass', 'grass-meadow', 'grass-noise'];
const DEFAULT_PIG_STATE = { totalPigs: 1, starCount: 0 };
const ANIMAL_SPECIES = ['chickens', 'sheep', 'ducks', 'retrievers', 'pigs', 'fish', 'bison', 'horse', 'squid', 'giraffe', 'cat', 'lizard'];
const FLOWER_TYPES = window.StudyFlowers ? window.StudyFlowers.ids() : ['clover', 'zinnias', 'amaranth', 'cosmos', 'dahlias', 'lupine'];
const LEGACY_FLOWER_TYPE_MAP = {
  marigold: 'amaranth',
  bluebell: 'cosmos',
  poppy: 'dahlias',
  sunflower: 'lupine',
  moonflower: 'lupine'
};
const DEFAULT_ECONOMY = {
  bucks: 0,
  animals: { chickens: 0, sheep: 0, ducks: 0, retrievers: 0, pigs: 0, fish: 0, bison: 0, horse: 0, squid: 0, giraffe: 0, cat: 0, lizard: 0 },
  unlockedAnimals: [],
  unlockedBackgrounds: [],
  animalPlacements: {},
  animalNames: {},
  animalHappiness: {},
  rewardLedger: { paid: {} },
  pens: [],
  troughs: [],
  coops: [],
  flowers: [],
  passiveIncome: {
    version: 1,
    lastAccruedAt: 0,
    carry: 0,
    totalEarned: 0,
    lastClaimedAt: 0,
    lastClaimedAmount: 0
  },
  economyV2: true
};
const STUDY_ECONOMY_KEY = 'study_economy_v1';
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

async function flushStudyStorage() {
  try {
    if (_backend && typeof _backend.flush === 'function') {
      await _backend.flush();
      return;
    }
    if (window.CloudStore && typeof window.CloudStore.flush === 'function') {
      await window.CloudStore.flush();
    }
  } catch (e) {
    console.error('StudyStorage.flush failed', e);
  }
}

async function getDecks() {
  const decks = readJSON(STUDY_DECKS_KEY, []);
  const list = Array.isArray(decks) ? decks : [];
  const defaultIndex = list.findIndex(function (d) { return d.id === DEFAULT_DECK_ID; });
  let migrated = false;
  if (defaultIndex === -1) {
    list.unshift({ id: DEFAULT_DECK_ID, name: 'General', createdAt: Date.now() });
    migrated = true;
  } else if (list[defaultIndex].name === 'Gaineral') {
    list[defaultIndex] = Object.assign({}, list[defaultIndex], { name: 'General' });
    migrated = true;
  }
  if (migrated) {
    writeJSON(STUDY_DECKS_KEY, list);
    await flushStudyStorage();
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
    if (!Array.isArray(c.tags)) { c.tags = []; migrated = true; }
  });
  if (migrated) {
    writeJSON(STUDY_CARDS_KEY, list);
    await flushStudyStorage();
  }
  return list;
}

async function saveCards(cards) {
  writeJSON(STUDY_CARDS_KEY, cards);
  return cards;
}

async function addCard(front, back, deckId, frontImage, backImage, tags) {
  const cards = await getCards();
  const card = createCard(front, back, deckId, undefined, frontImage, backImage, { tags: tags });
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
    const extra = { tags: Array.isArray(c.tags) ? c.tags : [] };
    if (c.type === 'occlusion') {
      extra.type = 'occlusion';
      extra.image = c.image;
      extra.regions = c.regions;
    }
    return createCard(c.front, c.back, c.deckId || deckId, undefined, c.frontImage, c.backImage, extra);
  });
  const merged = cards.concat(newCards);
  await saveCards(merged);
  return newCards;
}

// Image-occlusion cards don't go through addCard's front/back-text shape —
// they're built directly from an image + a set of rectangular mask regions.
async function addOcclusionCard(image, regions, deckId, tags) {
  const cards = await getCards();
  const card = createCard('[Image occlusion]', '', deckId, undefined, null, null, {
    type: 'occlusion',
    image: image,
    regions: regions,
    tags: tags
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
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored && typeof stored === 'object' ? stored : {});
  delete settings.sellAnimals;
  if (!Array.isArray(settings.tagVocab)) settings.tagVocab = [];
  if (GRASS_BACKGROUND_PRESETS.indexOf(settings.backgroundPreset) === -1) {
    settings.backgroundPreset = 'grass';
  }
  settings.backgroundImage = null;
  return settings;
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

function _normalizeAnimals(raw) {
  const animals = {};
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach(function (s) {
      if (ANIMAL_SPECIES.indexOf(s) === -1) return;
      const n = raw[s];
      if (typeof n === 'number' && isFinite(n) && n > 0) animals[s] = Math.floor(n);
    });
  }
  ANIMAL_SPECIES.forEach(function (s) {
    if (!Object.prototype.hasOwnProperty.call(animals, s)) animals[s] = 0;
  });
  return animals;
}

function _normalizeUnlockedAnimals(raw, animals) {
  const out = [];
  const seen = {};
  const list = Array.isArray(raw) ? raw : [];
  ANIMAL_SPECIES.forEach(function (s) {
    if ((animals && animals[s] > 0) || list.indexOf(s) !== -1) {
      out.push(s);
      seen[s] = true;
    }
  });
  list.forEach(function (s) {
    if (ANIMAL_SPECIES.indexOf(s) !== -1 && !seen[s]) out.push(s);
  });
  return out;
}

function _normalizePlacements(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(function (key) {
    const p = raw[key];
    if (!p || typeof p !== 'object') return;
    const leftVw = Number(p.leftVw);
    const topVh = Number(p.topVh);
    const heightVw = Number(p.heightVw);
    if (!Number.isFinite(leftVw) || !Number.isFinite(topVh)) return;
    out[key] = {
      leftVw: leftVw,
      topVh: topVh,
      flip: !!p.flip
    };
    if (Number.isFinite(heightVw)) out[key].heightVw = heightVw;
  });
  return out;
}

function _normalizeAnimalNames(raw, animals) {
  const out = {};
  const counts = animals || {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(function (key) {
    const parts = key.split('-');
    const species = parts[0];
    const index = Number(parts[1]);
    const value = String(raw[key] || '').trim();
    if (ANIMAL_SPECIES.indexOf(species) === -1 && !Object.prototype.hasOwnProperty.call(counts, species)) return;
    if (!Number.isInteger(index) || index < 1 || index > (counts[species] || 0)) return;
    if (!value) return;
    out[key] = value.slice(0, 36);
  });
  return out;
}

function _normalizeAnimalHappiness(raw, animals) {
  const out = {};
  const counts = animals || {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(function (key) {
    const parts = key.split('-');
    const species = parts[0];
    const index = Number(parts[1]);
    const value = Number(raw[key]);
    if (ANIMAL_SPECIES.indexOf(species) === -1 && !Object.prototype.hasOwnProperty.call(counts, species)) return;
    if (!Number.isInteger(index) || index < 1 || index > (counts[species] || 0)) return;
    if (!Number.isFinite(value) || value <= 0) return;
    out[key] = Math.max(0, Math.min(100, Math.round(value * 10) / 10));
  });
  return out;
}

function _normalizeRewardLedger(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const paidSource = source.paid && typeof source.paid === 'object' && !Array.isArray(source.paid) ? source.paid : source;
  const paid = {};
  Object.keys(paidSource || {}).forEach(function (key) {
    const clean = String(key || '').trim();
    if (clean && paidSource[key]) paid[clean.slice(0, 160)] = true;
  });
  return { paid: paid };
}

function _normalizePens(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (p) {
    return p && typeof p === 'object' && p.id &&
      Number.isFinite(Number(p.leftVw)) && Number.isFinite(Number(p.topVh)) &&
      Number.isFinite(Number(p.widthVw)) && Number.isFinite(Number(p.heightVh));
  }).map(function (p) {
    return {
      id: p.id,
      leftVw: Number(p.leftVw),
      topVh: Number(p.topVh),
      widthVw: Number(p.widthVw),
      heightVh: Number(p.heightVh),
      paid: typeof p.paid === 'number' && isFinite(p.paid) ? p.paid : 0
    };
  });
}

function _normalizeTroughs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (tr) {
    return tr && typeof tr === 'object' && tr.id &&
      Number.isFinite(Number(tr.leftVw)) && Number.isFinite(Number(tr.topVh));
  }).map(function (tr) {
    const heightVw = Number(tr.heightVw);
    return {
      id: tr.id,
      leftVw: Number(tr.leftVw),
      topVh: Number(tr.topVh),
      heightVw: Number.isFinite(heightVw) ? heightVw : 1.55,
      paid: typeof tr.paid === 'number' && isFinite(tr.paid) ? tr.paid : 0
    };
  });
}

function _normalizeCoops(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (coop) {
    return coop && typeof coop === 'object' && coop.id &&
      Number.isFinite(Number(coop.leftVw)) && Number.isFinite(Number(coop.topVh));
  }).map(function (coop) {
    const heightVw = Number(coop.heightVw);
    return {
      id: coop.id,
      leftVw: Number(coop.leftVw),
      topVh: Number(coop.topVh),
      heightVw: Number.isFinite(heightVw) ? heightVw : 2.35,
      paid: typeof coop.paid === 'number' && isFinite(coop.paid) ? coop.paid : 0,
      eggValue: _normalizeMoney(coop.eggValue),
      eggCarry: Math.max(0, Number(coop.eggCarry) || 0),
      totalEggValue: _normalizeMoney(coop.totalEggValue),
      lastEggAt: _normalizeTimestamp(coop.lastEggAt)
    };
  });
}

function _normalizeFlowers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (fl) {
    return fl && typeof fl === 'object' && fl.id &&
      FLOWER_TYPES.indexOf(LEGACY_FLOWER_TYPE_MAP[fl.type] || fl.type) !== -1 &&
      Number.isFinite(Number(fl.leftVw)) && Number.isFinite(Number(fl.topVh));
  }).map(function (fl) {
    const type = LEGACY_FLOWER_TYPE_MAP[fl.type] || fl.type;
    const catalogSize = window.StudyFlowers && window.StudyFlowers.sizeFor
      ? window.StudyFlowers.sizeFor(type)
      : null;
    return {
      id: fl.id,
      type: type,
      leftVw: Number(fl.leftVw),
      topVh: Number(fl.topVh),
      heightVw: (catalogSize && catalogSize.heightVw) || 1.9,
      paid: typeof fl.paid === 'number' && isFinite(fl.paid) ? fl.paid : 0
    };
  });
}

function _normalizeTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function _normalizeMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function _normalizePassiveIncome(raw, legacy) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    version: 1,
    lastAccruedAt: _normalizeTimestamp(source.lastAccruedAt || legacy && legacy.passiveLastAt),
    carry: Math.max(0, Number(source.carry) || 0),
    totalEarned: _normalizeMoney(source.totalEarned || legacy && legacy.passiveEarnedTotal),
    lastClaimedAt: _normalizeTimestamp(source.lastClaimedAt),
    lastClaimedAmount: _normalizeMoney(source.lastClaimedAmount)
  };
}

function _emptyEconomyV2() {
  return {
    bucks: 0,
    animals: _normalizeAnimals(null),
    unlockedAnimals: [],
    unlockedBackgrounds: [],
    animalPlacements: {},
    animalNames: {},
    animalHappiness: {},
    rewardLedger: { paid: {} },
    pens: [],
    troughs: [],
    coops: [],
    flowers: [],
    passiveIncome: _normalizePassiveIncome(null),
    economyV2: true
  };
}

// Old study_pigs_v1 "pig every N cards" gifts must not become store animals.
// Wipe only a one-time import of that counter: pigs-only, no other species,
// no pens/troughs/grass, and pig count still matches (or is below) the
// legacy totalPigs blob. Mixed herds or any real farm purchase are kept
// and stamped economyV2 so this never runs again.
function _isLegacyPigOnlyEconomy(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.economyV2) return false;
  const a = raw.animals || {};
  const others = ANIMAL_SPECIES.filter(function (s) { return s !== 'pigs'; });
  for (let i = 0; i < others.length; i++) {
    if ((a[others[i]] || 0) > 0) return false;
  }
  if (Array.isArray(raw.pens) && raw.pens.length) return false;
  if (Array.isArray(raw.troughs) && raw.troughs.length) return false;
  if (Array.isArray(raw.flowers) && raw.flowers.length) return false;
  const unlocked = Array.isArray(raw.unlockedBackgrounds) ? raw.unlockedBackgrounds : [];
  if (unlocked.indexOf('grass') !== -1) return false;
  const pigCount = (typeof a.pigs === 'number' && a.pigs > 0) ? Math.floor(a.pigs) : 0;
  if (pigCount <= 0) return false;
  const pigsBlob = readJSON(STUDY_PIGS_KEY, null);
  if (!pigsBlob || typeof pigsBlob !== 'object' || typeof pigsBlob.totalPigs !== 'number') return false;
  return pigCount <= Math.floor(pigsBlob.totalPigs);
}

function _normalizeEconomy(stored) {
  const raw = stored && typeof stored === 'object' ? stored : {};
  if (_isLegacyPigOnlyEconomy(raw)) return _emptyEconomyV2();
  const base = Object.assign({}, DEFAULT_ECONOMY, raw);
  base.bucks = typeof base.bucks === 'number' && isFinite(base.bucks) ? Math.round(base.bucks * 100) / 100 : 0;
  base.animals = _normalizeAnimals(base.animals);
  base.unlockedAnimals = _normalizeUnlockedAnimals(base.unlockedAnimals, base.animals);
  const unlocked = Array.isArray(base.unlockedBackgrounds) ? base.unlockedBackgrounds : [];
  base.unlockedBackgrounds = unlocked.filter(function (id) { return GRASS_BACKGROUND_PRESETS.indexOf(id) !== -1; });
  base.animalPlacements = _normalizePlacements(base.animalPlacements);
  base.animalNames = _normalizeAnimalNames(base.animalNames, base.animals);
  base.animalHappiness = _normalizeAnimalHappiness(base.animalHappiness, base.animals);
  base.rewardLedger = _normalizeRewardLedger(base.rewardLedger);
  base.pens = _normalizePens(base.pens);
  base.troughs = _normalizeTroughs(base.troughs);
  base.coops = _normalizeCoops(base.coops);
  base.flowers = _normalizeFlowers(base.flowers);
  base.passiveIncome = _normalizePassiveIncome(base.passiveIncome, base);
  delete base.passiveLastAt;
  delete base.passiveEarnedTotal;
  base.economyV2 = true;
  return base;
}

async function getEconomy() {
  const stored = readJSON(STUDY_ECONOMY_KEY, null);
  const hasStored = !!(stored && typeof stored === 'object');
  const next = _normalizeEconomy(hasStored ? stored : { economyV2: true });
  if (!hasStored || !stored.economyV2 || !Array.isArray(stored.flowers) || !Array.isArray(stored.coops) || !Array.isArray(stored.unlockedAnimals) || !stored.animalNames || typeof stored.animalNames !== 'object' || Array.isArray(stored.animalNames) || !stored.animalHappiness || typeof stored.animalHappiness !== 'object' || Array.isArray(stored.animalHappiness) || !stored.rewardLedger || typeof stored.rewardLedger !== 'object' || Array.isArray(stored.rewardLedger) || !stored.passiveIncome || typeof stored.passiveIncome !== 'object' || Array.isArray(stored.passiveIncome)) {
    writeJSON(STUDY_ECONOMY_KEY, next);
    await flushStudyStorage();
  }
  return next;
}

async function saveEconomy(state) {
  const next = _normalizeEconomy(state);
  writeJSON(STUDY_ECONOMY_KEY, next);
  return next;
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
    economy: STUDY_ECONOMY_KEY,
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
  useLocalBackend: function () { _backend = _localBackend; },
  // Settle any async backend writes. localStorage mode is already synchronous.
  flush: flushStudyStorage
};

window.flushStudyStorage = flushStudyStorage;
