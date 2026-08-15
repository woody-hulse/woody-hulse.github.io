# Firebase setup — Hool's Carbs

Cloud sign-in (Google) is already wired into the app but stays dormant until
you complete this checklist. Until then the app works exactly as it does
today (local-only, no accounts).

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
2. Give it any name (e.g. "hools-carbs"), finish the wizard (Google
   Analytics is optional — not needed here).

## 2. Register a web app

1. In the project, click the gear icon next to "Project Overview" →
   **Project settings**.
2. Under the **General** tab, scroll to "Your apps" and click the `</>`
   (web) icon to register a new web app.
3. Give it a nickname (e.g. "study"). You do **not** need Firebase Hosting —
   this site deploys elsewhere.
4. It'll show you a `firebaseConfig` object with six fields: `apiKey`,
   `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

## 3. Paste the config in

Open `study/js/firebase-config.js` and replace all six `"REPLACE_ME"`
values with the ones from step 2. Save — that's the only file you need to
edit. As soon as real values are in, the app switches from the local
username flow to requiring Google sign-in.

## 4. Enable Google sign-in

1. In the Firebase console, go to **Build → Authentication**.
2. Click **Get started** if you haven't used Authentication yet.
3. Open the **Sign-in method** tab, click **Google** in the provider list,
   toggle it **Enable**, pick a support email, and **Save**.

## 5. Authorize your domains

Still in **Authentication → Settings → Authorized domains**:

- `localhost` is included by default — good for local testing.
- Add whatever domain you deploy this site to (e.g.
  `woody-hulse.github.io`). Without this, Google sign-in will fail with an
  `auth/unauthorized-domain` error on the deployed site.

## 6. Create the Firestore database

Cloud-synced storage is implemented (see `js/cloud-store.js`) but needs a
Firestore database to write to.

1. In the Firebase console, go to **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode** (locked by default — we ship explicit security
   rules in the next step; do NOT use test mode, which is world-open and
   expires).
4. Pick a location (any region close to you; this can't be changed later).

## 7. Publish the security rules

The repo ships `study/firestore.rules`, which restricts every user's data to
that authenticated user (no user can read or write another's data).

Either:

- **Console:** open **Build → Firestore Database → Rules**, replace the
  contents with `study/firestore.rules`, and click **Publish**; or
- **CLI:** with the Firebase CLI installed and `firestore.rules` referenced in
  your `firebase.json`, run `firebase deploy --only firestore:rules`.

## Done

Reload the page. The auth screen shows a "Sign in with Google" button instead
of the username field. Signing in persists across reloads (Firebase keeps the
session in the browser) until you use the "Sign out" button.

Once Firestore is enabled and the rules are published, your carbs, daecks,
naists, pig/star progress, review log, and last-studied daeck all sync to the
cloud under your account and follow you across browsers and devices. The first
time you sign in, any decks/cards you already had locally in that browser are
automatically migrated up to your account (only if your cloud store is empty —
it never clobbers existing cloud data).

## Sign-in flow / macOS Safari note (for maintainers)

Google sign-in uses **popup-first on every browser** (`signInWithPopup` with
an explicit `browserPopupRedirectResolver`), and the app enters directly from
the popup's returned credential rather than waiting on `onAuthStateChanged` in
the opener. A full-page redirect is used **only** if the popup can't open at
all (`auth/popup-blocked` / `auth/operation-not-supported-in-this-environment`).

Why not redirect-first on macOS Safari? Because `authDomain`
(`stody-39e62.firebaseapp.com`) is a different site from the app origin
(`woodyhulse.com`). `signInWithRedirect` stores state on `firebaseapp.com` and
returns to `woodyhulse.com`; desktop Safari's ITP drops that cross-site state,
so the redirect round-trip silently fails to complete. The popup completes the
whole exchange in a first-party window and hands the credential straight back,
which is the path that works on **both** iOS and macOS Safari. (An earlier
"redirect-first for macOS Safari" heuristic was removed for this reason — do
not reintroduce it.)

The **real** same-site fix (optional, only if popups are ever undesirable) is
to serve the auth handler from the app's own domain: add `woodyhulse.com` as a
Firebase Hosting custom domain and set `authDomain: "woodyhulse.com"` in
`firebase-config.js`, so there's no cross-site hop at all. Not required with
the popup-first approach.

Authorized domains (Firebase Auth → Settings) and the Google OAuth web client's
Authorized JavaScript origins are a **separate** concern from the code; if
sign-in works in any one browser on a given origin, those are already correct
for that origin (they're not browser-specific).

## Data model (how it's stored)

Everything lives under a single per-user subtree:

```
users/{uid}/store/{key}   →   { data: "<json string>", updatedAt: <timestamp> }
```

`{key}` is the same storage key the app already used locally
(`study_cards_v1`, `study_decks_v1`, `study_naists_v1`, `study_pigs_v1`,
`study_review_log_v1`, `study_last_deck_v1`, `study_settings_v1`,
`study_username_v1`). Each document's `data` field is the exact JSON blob that
would otherwise sit in `localStorage`. This 1:1 mapping is what let the whole
app keep working with zero data-access changes — it just reads/writes through a
Firestore-backed cache instead of `localStorage` when you're signed in.

**Scaling note:** a Firestore document is capped at ~1 MB. Card images are
compressed on import, so the `study_cards_v1` blob is very unlikely to hit
that, but a user who amasses a huge image-occlusion collection eventually
could. If that ever happens, the upgrade path is to split cards into a
`users/{uid}/cards/{cardId}` subcollection (one doc per card) — the
`cloud-store.js` backend abstraction is the only file that would change.

## What still requires YOUR Firebase config

The code is complete and the local-only path is unchanged and fully working.
The cloud path stays dormant until `study/js/firebase-config.js` has real
values (steps 1–3) **and** Firestore + rules are set up (steps 6–7). Until
then `window.CloudAuth.isConfigured` / `window.CloudStore.isConfigured` are
`false` and the app runs exactly as before (localStorage, no network). Cloud
sync can only be verified end-to-end once those console steps are done.
