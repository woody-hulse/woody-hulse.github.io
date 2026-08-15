// auth.js — bridges the Firebase (v9+ modular, ES-module-only) Auth SDK into
// a plain global object, `window.CloudAuth`, that the rest of this app
// (plain `<script>` globals, no bundler, no `import`/`export`) can consume.
//
// =========================================================================
// CONTRACT — window.CloudAuth
// =========================================================================
// This is the stable interface. Anything consuming Google auth (app.js today,
// a future Firestore-backed storage layer tomorrow) should only ever touch
// this object, never Firebase APIs directly.
//
//   window.CloudAuth = {
//     // true iff study/js/firebase-config.js has real (non-placeholder)
//     // values AND the Firebase SDK initialized without error. When false,
//     // every other method below is a harmless no-op/stub (see per-method
//     // notes) — callers do not need to branch on isConfigured before
//     // calling them, only before deciding whether to SHOW cloud-auth UI.
//     isConfigured: boolean,
//
//     // Synchronous snapshot of the signed-in user, or null if signed out
//     // (or unconfigured). Shape:
//     //   { uid: string, displayName: string|null, email: string|null,
//     //     photoURL: string|null }
//     // `uid` is the stable, unique Firebase user id — use it as the
//     // per-user scoping key for any cloud-persisted data (Firestore doc
//     // paths etc).
//     getCurrentUser: () => ({uid, displayName, email, photoURL}) | null,
//
//     // Opens the Google sign-in popup. Resolves with the same user shape
//     // as getCurrentUser() on success. Rejects (throws) on failure or if
//     // the user closes/cancels the popup — callers should wrap in
//     // try/catch and show their own message; this function does not swallow
//     // errors. Rejects if !isConfigured (should not be called in that case;
//     // hide/disable the Google button instead).
//     signInWithGoogle: async () => ({uid, displayName, email, photoURL}),
//
//     // Signs the current user out. Resolves with no value. No-op if
//     // !isConfigured or already signed out.
//     signOutUser: async () => void,
//
//     // Subscribes to auth state changes. `callback` is invoked once
//     // immediately with the current state (mirrors Firebase's own
//     // onAuthStateChanged) and again on every sign-in/sign-out, always
//     // with either a user object (see getCurrentUser shape) or null.
//     // When !isConfigured, callback is invoked exactly once, asynchronously,
//     // with null, and never again. Returns an unsubscribe function.
//     onAuthStateChanged: (callback: (user|null) => void) => (() => void)
//   }
//
// READINESS / SCRIPT-ORDERING NOTE FOR CONSUMERS:
// This file is loaded via `<script type="module">`, which the HTML spec
// defers by default: it runs after the document has finished parsing but
// BEFORE the `DOMContentLoaded` event fires. This module also has a genuine
// top-level `await` (the `await setup();` line at the very bottom, at the
// module's top level — NOT inside a nested function/IIFE, which matters:
// only an await lexically at module top level delays the module per spec).
// Per spec, a top-level await delays the module's "script has finished
// running" signal — and therefore delays `DOMContentLoaded` itself — until
// this file's setup (including the dynamic Firebase SDK import, when
// configured) has fully completed, success or failure. In practice: any code
// that waits for `DOMContentLoaded` (as study/js/app.js's `init()` does) is
// GUARANTEED `window.CloudAuth` already exists and is fully populated by the
// time it runs — no manual waiting needed.
//
// As defense-in-depth (and for any future code that might run earlier than
// DOMContentLoaded), this file also dispatches a `cloudauth-ready` CustomEvent
// on `window` the moment `window.CloudAuth` is set, with `event.detail` equal
// to the same CloudAuth object. Code that cannot rely on DOMContentLoaded
// ordering can instead do:
//   if (window.CloudAuth) { /* already ready */ }
//   else window.addEventListener('cloudauth-ready', function (e) { ... }, { once: true });
// =========================================================================

async function setup() {
  const PLACEHOLDER = 'REPLACE_ME';

  function isRealConfig(cfg) {
    if (!cfg) return false;
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    return fields.every(function (f) { return cfg[f] && cfg[f] !== PLACEHOLDER; });
  }

  function mapUser(fbUser) {
    if (!fbUser) return null;
    return {
      uid: fbUser.uid,
      displayName: fbUser.displayName || null,
      email: fbUser.email || null,
      photoURL: fbUser.photoURL || null
    };
  }

  // Stub used both when unconfigured and when Firebase setup throws (e.g.
  // bad config values, offline CDN fetch) — same shape either way, so
  // callers never have to distinguish "never configured" from "configured
  // but failed to init". Both silently behave like "no cloud auth available".
  function makeStub() {
    return {
      isConfigured: false,
      getCurrentUser: function () { return null; },
      signInWithGoogle: async function () {
        throw new Error('CloudAuth: not configured, cannot sign in with Google.');
      },
      signOutUser: async function () {},
      onAuthStateChanged: function (callback) {
        Promise.resolve().then(function () { callback(null); });
        return function unsubscribe() {};
      }
    };
  }

  const cfg = window.FIREBASE_CONFIG;

  let cloudAuth;

  if (!isRealConfig(cfg)) {
    cloudAuth = makeStub();
  } else {
    try {
      const FIREBASE_SDK_VERSION = '12.17.1';
      const [{ initializeApp }, authMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-auth.js')
      ]);
      const {
        getAuth,
        GoogleAuthProvider,
        signInWithPopup,
        signOut,
        onAuthStateChanged: fbOnAuthStateChanged
      } = authMod;

      const app = initializeApp(cfg);
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      cloudAuth = {
        isConfigured: true,
        getCurrentUser: function () {
          return mapUser(auth.currentUser);
        },
        signInWithGoogle: async function () {
          const result = await signInWithPopup(auth, provider);
          return mapUser(result.user);
        },
        signOutUser: async function () {
          await signOut(auth);
        },
        onAuthStateChanged: function (callback) {
          return fbOnAuthStateChanged(auth, function (fbUser) {
            callback(mapUser(fbUser));
          });
        }
      };
    } catch (err) {
      console.error('CloudAuth: Firebase initialization failed, falling back to local-only auth.', err);
      cloudAuth = makeStub();
    }
  }

  window.CloudAuth = cloudAuth;
  window.dispatchEvent(new CustomEvent('cloudauth-ready', { detail: cloudAuth }));
}

// Genuine top-level await (see the READINESS comment above) — this is what
// makes the HTML spec delay DOMContentLoaded until setup() has finished.
await setup();
