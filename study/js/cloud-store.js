// cloud-store.js — Firestore-backed persistence provider for "Hool's Carbs".
//
// =========================================================================
// WHAT THIS IS
// =========================================================================
// storage.js is a swappable-backend key/value store. By default its backend
// is localStorage (exactly today's behaviour). This file provides an
// ALTERNATIVE backend that reads/writes the same keys from Cloud Firestore,
// scoped to a signed-in user's uid — so a user's carbs/daecks/naists/pig
// state/review log/etc. follow them across browsers and devices.
//
// It plugs in via the tiny hook storage.js publishes on `window.StudyStorage`
// (see storage.js). No app.js data-access call sites change: they keep calling
// getCards()/saveDecks()/getPigState()/… and those transparently hit whichever
// backend is currently installed.
//
// =========================================================================
// MODEL: load-into-cache + write-through
// =========================================================================
// The app reads the WHOLE of each collection (getCards → all cards, etc.) and
// writes the whole collection back (saveCards(allCards)). So the cloud backend
// keeps an in-memory cache of each key's JSON string, loaded once at sign-in.
//   - Reads are synchronous from the cache (matches storage.js's sync getItem).
//   - Writes update the cache synchronously (so read-after-write is always
//     correct) and are persisted to Firestore in the background (write-through,
//     micro-task-coalesced so a burst of saves in one tick is one network
//     write of the final value). Persistence errors are logged, never thrown —
//     the cache remains the source of truth for the session.
//
// =========================================================================
// FIRESTORE DATA SHAPE
// =========================================================================
//   users/{uid}/store/{key}   →   { data: "<json string>", updatedAt: <ts> }
//
// where {key} is the same storage key storage.js already uses
// ('study_cards_v1', 'study_decks_v1', 'study_naists_v1', 'study_pigs_v1',
// 'study_review_log_v1', 'study_last_deck_v1', 'study_settings_v1',
// 'study_username_v1'). One document per collection; `data` is the exact JSON
// string that would otherwise live in localStorage. This 1:1 mapping keeps the
// backend trivial and keeps every existing storage.js function working
// unchanged. (Note: a Firestore document is capped at ~1 MB, so an enormous
// image-heavy `study_cards_v1` blob could eventually exceed that; see
// FIREBASE_SETUP.md for the per-card-subcollection upgrade path if you ever
// hit it. Images are compressed on import, so this is unlikely in practice.)
//
// Security: study/firestore.rules restricts every users/{uid}/** document to
// request.auth.uid == uid, so no user can read or write another's data.
//
// Like auth.js this is an ES module with a genuine top-level await, so the
// page's DOMContentLoaded (and therefore app.js init()) is delayed until
// window.CloudStore is fully defined.

async function setupCloudStore() {
  const PLACEHOLDER = 'REPLACE_ME';

  function isRealConfig(cfg) {
    if (!cfg) return false;
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    return fields.every(function (f) { return cfg[f] && cfg[f] !== PLACEHOLDER; });
  }

  // The storage keys we sync. Sourced from storage.js's published map when
  // present (single source of truth); falls back to the literal strings so
  // this file is still self-consistent if loaded in isolation.
  function syncKeys() {
    const s = window.StudyStorage;
    if (s && s.KEYS) return Object.values(s.KEYS);
    return [
      'study_cards_v1', 'study_decks_v1', 'study_naists_v1', 'study_settings_v1',
      'study_pigs_v1', 'study_username_v1', 'study_review_log_v1', 'study_last_deck_v1'
    ];
  }

  // Inert stub — used when Firebase isn't configured (or its SDK fails to
  // load). activate() resolves false so callers know the cloud path is
  // unavailable and the app simply stays on the localStorage backend.
  function makeStub() {
    return {
      isConfigured: false,
      isActive: function () { return false; },
      getCurrentUid: function () { return null; },
      activate: async function () { return false; },
      deactivate: async function () {},
      flush: async function () {}
    };
  }

  const cfg = window.FIREBASE_CONFIG;

  if (!isRealConfig(cfg)) {
    window.CloudStore = makeStub();
    window.dispatchEvent(new CustomEvent('cloudstore-ready', { detail: window.CloudStore }));
    return;
  }

  let firestore;
  try {
    const FIREBASE_SDK_VERSION = '12.17.1';
    const [appMod, fsMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-firestore.js')
    ]);

    const { initializeApp, getApps, getApp } = appMod;
    // Reuse the default app auth.js already created (initializing it twice
    // throws). If auth.js somehow hasn't run, create it here.
    const app = getApps().length ? getApp() : initializeApp(cfg);

    firestore = {
      db: fsMod.getFirestore(app),
      doc: fsMod.doc,
      collection: fsMod.collection,
      // getDocsFromServer (not getDocs) so the initial load only succeeds if we
      // can actually REACH Firestore. Plain getDocs returns an empty
      // cache-backed snapshot when offline / when the database doesn't exist
      // yet, which would silently install the cloud backend and then lose every
      // write on reload. Forcing a server read makes those cases throw, so
      // activate() cleanly falls back to local storage instead.
      getDocsFromServer: fsMod.getDocsFromServer,
      setDoc: fsMod.setDoc,
      deleteDoc: fsMod.deleteDoc,
      writeBatch: fsMod.writeBatch,
      serverTimestamp: fsMod.serverTimestamp
    };
  } catch (err) {
    console.error('CloudStore: Firestore SDK failed to load; staying on local storage.', err);
    window.CloudStore = makeStub();
    window.dispatchEvent(new CustomEvent('cloudstore-ready', { detail: window.CloudStore }));
    return;
  }

  // ---- per-session state ----
  let currentUid = null;
  let active = false;
  let cache = {};                    // key -> JSON string (mirrors localStorage values)
  const dirty = new Set();           // keys with a coalesced write pending
  const outstanding = new Set();     // in-flight write promises (for flush())

  function docRef(key) {
    return firestore.doc(firestore.db, 'users', currentUid, 'store', key);
  }

  // Micro-task-coalesced write-through: multiple setItem() calls in the same
  // tick collapse into one Firestore write of the final cached value per key.
  function scheduleWrite(key) {
    if (dirty.has(key)) return;
    dirty.add(key);
    const p = Promise.resolve().then(async function () {
      dirty.delete(key);
      if (!active) return; // signed out mid-flight — abandon
      try {
        if (key in cache) {
          await firestore.setDoc(docRef(key), {
            data: cache[key],
            updatedAt: firestore.serverTimestamp()
          });
        } else {
          await firestore.deleteDoc(docRef(key));
        }
      } catch (e) {
        console.error('CloudStore: write failed for "' + key + '"', e);
      }
    });
    outstanding.add(p);
    p.finally(function () { outstanding.delete(p); });
  }

  // The backend object storage.js will call. Same shape as its localStorage
  // backend: synchronous string get/set/remove.
  const cloudBackend = {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    },
    setItem: function (key, value) {
      cache[key] = value;
      scheduleWrite(key);
    },
    removeItem: function (key) {
      delete cache[key];
      scheduleWrite(key);
    }
  };

  async function loadCache() {
    cache = {};
    // Server read (throws if Firestore is unreachable / not yet created) — see
    // the getDocsFromServer note above.
    const snap = await firestore.getDocsFromServer(firestore.collection(firestore.db, 'users', currentUid, 'store'));
    snap.forEach(function (d) {
      const v = d.data();
      if (v && typeof v.data === 'string') cache[d.id] = v.data;
    });
  }

  // On first sign-in for a uid whose cloud store is empty, lift any existing
  // localStorage data up to Firestore so the user doesn't lose their local
  // work. Idempotent: only runs when the cloud side has none of the core
  // keys, so once data exists in Firestore this is skipped forever. Never
  // overwrites existing cloud data with local data.
  async function migrateLocalIfCloudEmpty() {
    const keys = syncKeys();
    const cloudEmpty = keys.every(function (k) { return !(k in cache); });
    if (!cloudEmpty) return false;

    const localGet = (window.StudyStorage && window.StudyStorage.localGet)
      ? window.StudyStorage.localGet
      : function (k) { return localStorage.getItem(k); };

    const batch = firestore.writeBatch(firestore.db);
    let migratedAny = false;
    keys.forEach(function (k) {
      const localVal = localGet(k);
      if (localVal !== null && localVal !== undefined) {
        cache[k] = localVal; // seed cache immediately so this session sees it
        batch.set(docRef(k), { data: localVal, updatedAt: firestore.serverTimestamp() });
        migratedAny = true;
      }
    });

    if (migratedAny) {
      try {
        await batch.commit();
      } catch (e) {
        // Non-fatal: the cache already holds the migrated values so the
        // session works; persistence will be re-attempted on the next write.
        console.error('CloudStore: initial local→cloud migration failed to persist (session still usable).', e);
      }
    }
    return migratedAny;
  }

  window.CloudStore = {
    isConfigured: true,

    isActive: function () { return active; },
    getCurrentUid: function () { return currentUid; },

    // Load this user's data into the cache, run the one-time local→cloud
    // migration if needed, and install the cloud backend so every subsequent
    // storage.js read/write hits Firestore. MUST be awaited before the app
    // renders. Idempotent for an already-active uid.
    activate: async function (uid) {
      if (!uid) return false;
      if (active && currentUid === uid) return true;
      currentUid = uid;
      try {
        await loadCache();
        await migrateLocalIfCloudEmpty();
      } catch (e) {
        // Firestore unreachable/denied/not-yet-created: don't leave the app
        // stuck. Fall back to the local backend for this session so the user
        // can still work (just without sync); the next sign-in will retry.
        console.error('CloudStore: could not load cloud data; using local storage for this session.', e);
        currentUid = null;
        cache = {};
        window.StudyStorage.useLocalBackend();
        active = false;
        return false;
      }
      window.StudyStorage.useBackend(cloudBackend);
      active = true;
      return true;
    },

    // Flush pending writes and revert storage.js to the localStorage backend
    // (used on sign-out). After this the app behaves exactly as the local-only
    // flow again.
    deactivate: async function () {
      await this.flush();
      window.StudyStorage.useLocalBackend();
      active = false;
      currentUid = null;
      cache = {};
    },

    // Resolves once every outstanding write-through has settled.
    flush: async function () {
      await Promise.allSettled(Array.from(outstanding));
    }
  };

  // Best-effort persistence of any in-flight writes if the tab is being
  // hidden/closed mid-burst.
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && active) {
      window.CloudStore.flush();
    }
  });

  window.dispatchEvent(new CustomEvent('cloudstore-ready', { detail: window.CloudStore }));
}

// Genuine top-level await (mirrors auth.js) so DOMContentLoaded — and thus
// app.js init() — waits until window.CloudStore exists.
await setupCloudStore();
