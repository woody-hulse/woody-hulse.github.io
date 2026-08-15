// firebase-config.js — Firebase project credentials for "Hool's Carbs" cloud
// sync/auth. This is the ONLY file the site owner needs to hand-edit to
// activate real Google sign-in + (later) Firestore-backed storage.
//
// HOW TO GET REAL VALUES:
//   1. Go to https://console.firebase.google.com and create (or open) a
//      Firebase project.
//   2. Click the gear icon next to "Project Overview" -> "Project settings".
//   3. Under the "General" tab, scroll to "Your apps". If there's no web
//      app yet, click the "</>" (web) icon to register one (no Hosting
//      setup needed — this app deploys as a plain static site elsewhere).
//   4. In "SDK setup and configuration", pick "Config" — it shows a
//      `firebaseConfig` object with exactly the six fields below. Copy
//      those values in verbatim (replace every "REPLACE_ME").
//
// This file is loaded as `<script type="module">` (see index.html), so
// `FIREBASE_CONFIG` is module-scoped, not an implicit global — it is
// explicitly published onto `window` below so plain classic scripts (and
// js/auth.js, which reads window.FIREBASE_CONFIG rather than importing this
// file, to keep the two files independently swappable) can see it too.
//
// Until real values are pasted in, every field stays "REPLACE_ME". js/auth.js
// detects that placeholder and skips cloud auth entirely — the app keeps
// working exactly as it does today (local-only, no build step required, no
// network calls to Firebase). Nothing else needs to change to activate
// cloud auth later: just replace the six strings below.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAcmO_xh11w4U5d1GQF1dK4kXaLKjPzlaM",
  authDomain: "stody-39e62.firebaseapp.com",
  projectId: "stody-39e62",
  storageBucket: "stody-39e62.firebasestorage.app",
  messagingSenderId: "990600879709",
  appId: "1:990600879709:web:a690b69ea7df85be4877b4"
};

window.FIREBASE_CONFIG = FIREBASE_CONFIG;
