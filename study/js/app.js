// app.js — ties storage.js, srs.js, stats.js, anki-import.js, and pigs.js
// together: tabs, the unified Naists browser, the Stody session flow, the
// Edit Daeck card CRUD UI, stats, and the pig encouragement interludes.
//
// IA: four tabs — Stody (the active study session, unchanged internally,
// defaults to resuming the last-studied deck), Naists (the landing/default
// tab: browse naists/decks, create/rename/delete/move, create-deck-with-
// import, export), Edit Daeck (add-card area + this deck's card list + deck
// management, scoped to whichever deck is currently "open for editing"),
// Staets. A deck row in Naists has explicit "Stody"/"Cram"/"Edit"
// buttons that jump to the Stody/Edit tabs scoped to that specific deck via
// switchTab(tab, opts).

(function () {
  // Fixed, not user-configurable — a bigbert break happens every 10 carbs.
  var BIGBERT_INTERVAL = 10;

  let currentUsername = null;
  let pigState = { totalPigs: 1, starCount: 0 };

  // Guards the cloud sign-in entry path. A single authenticated user can be
  // reported from three overlapping sources (the signInWithGoogle() return
  // value on popup success, the getCurrentUser() snapshot after a redirect,
  // and the onAuthStateChanged callback) — this flag makes entering the app
  // idempotent so those never race into a double-enter.
  let _cloudEntering = false;

  let addFrontImageDataUri = null;
  let addBackImageDataUri = null;

  // The naist (folder-like deck container) the Naists tab is currently
  // browsing into. null = top level.
  let browseNaistId = null;

  // The deck currently open in the Edit Daeck tab, or null if none has been
  // chosen yet this session. Module-level state (not a URL/tab param) so
  // clicking the "Edit Daeck" tab button directly still has something
  // sensible to fall back to.
  let editDeckId = null;

  // Naist a deck created via the "+ New daeck" overlay should land in —
  // captured from browseNaistId at the moment the overlay opens.
  let pendingNewDeckNaistId = null;

  // Naists the browser currently has expanded inline (Finder list-view
  // style disclosure). Kept in memory across re-renders, keyed by naist id,
  // so drilling in/out or moving things never loses which folders are open.
  let expandedNaistIds = new Set();

  // The row currently being dragged: { kind: 'deck'|'naist', id }. null when
  // nothing is being dragged. Consulted by every drop target's dragover/drop.
  let dragItem = null;

  // While a naist is being dragged, the set of target ids it must NOT be
  // dropped into (itself + every descendant — that would make a cycle), so
  // dragover can refuse to highlight invalid targets synchronously. Computed
  // once at dragstart from lastRenderedNaists. null while dragging a deck.
  let dragForbidden = null;

  // The naist list from the most recent Naists render, kept so a synchronous
  // dragstart can compute a naist's descendants without an async load.
  let lastRenderedNaists = [];

  const session = {
    activeDeckId: null,
    activeDeckName: '',
    cram: false,
    queue: [],
    currentCard: null,
    reviewedCount: 0,
    cardsSinceLastPig: 0,
    // Single-level "undo last rating" support. Set right after a rating is
    // applied; cleared on undo or when a new rating overwrites it. Not
    // cleared by simply advancing to the next card, so undo still works
    // after you've moved on and noticed the mistake.
    lastAction: null
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    setSpinnerImage(els.spinnerImg);
    bindAuthScreen();
    bindKeyboardShortcuts();

    // window.CloudAuth is set up by js/auth.js, a deferred ES module that
    // uses a top-level await — per the HTML spec that delays this page's
    // DOMContentLoaded event (which is what triggers init()) until it
    // finishes, so window.CloudAuth is normally already present by this
    // point. waitForCloudAuth() is a defensive fallback only (bounded, so a
    // fresh page load never hangs even if that ordering guarantee is ever
    // broken by a future change to the script tags).
    // "Checking session" gate: show the loading overlay and keep BOTH auth
    // forms hidden (see index.html — #auth-screen and both forms start hidden)
    // until we know the real answer. This prevents the first-paint flash of
    // the wrong form (e.g. the local "Who ainters?" username box briefly
    // showing before Google, or the Google button flashing before a restored
    // session enters the app).
    showLoading();
    try {
      await waitForCloudAuth();

      if (window.CloudAuth && window.CloudAuth.isConfigured) {
        await setupCloudAuthScreen();
      } else {
        // Cloud auth not configured (js/firebase-config.js is still the
        // REPLACE_ME placeholder) — exactly today's local-only flow.
        currentUsername = await getUsername();
        if (currentUsername) {
          await enterApp();
        } else {
          els.authCloudForm.hidden = true;
          els.authLocalForm.hidden = false;
          els.authScreen.hidden = false;
        }
      }
    } catch (err) {
      console.error('init failed; showing an auth screen as a fallback.', err);
      const configured = window.CloudAuth && window.CloudAuth.isConfigured;
      els.authLocalForm.hidden = configured;
      els.authCloudForm.hidden = !configured;
      els.authScreen.hidden = false;
    } finally {
      hideLoading();
    }
  }

  // Resolves once window.CloudAuth exists. In the overwhelmingly common case
  // it already does (see the comment in init() above); the 'cloudauth-ready'
  // event and 2s timeout are just a safety net so this can never hang.
  function waitForCloudAuth() {
    if (window.CloudAuth) return Promise.resolve();
    return new Promise(function (resolve) {
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        resolve();
      }
      window.addEventListener('cloudauth-ready', done, { once: true });
      setTimeout(done, 2000);
    });
  }

  function cacheEls() {
    els.authScreen = document.getElementById('auth-screen');
    els.usernameInput = document.getElementById('username-input');
    els.usernameSubmit = document.getElementById('username-submit');
    els.authLocalForm = document.getElementById('auth-local-form');
    els.authCloudForm = document.getElementById('auth-cloud-form');
    els.googleSigninBtn = document.getElementById('google-signin-btn');
    els.authCloudError = document.getElementById('auth-cloud-error');

    els.app = document.getElementById('app');
    els.userGreeting = document.getElementById('user-greeting');
    els.pigCountDisplay = document.getElementById('pig-count-display');
    els.starCountDisplay = document.getElementById('star-count-display');
    els.starCountValue = document.getElementById('star-count-value');
    els.tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
    els.views = {
      naists: document.getElementById('view-naists'),
      study: document.getElementById('view-study'),
      edit: document.getElementById('view-edit'),
      stats: document.getElementById('view-stats'),
      pigs: document.getElementById('view-pigs')
    };
    els.settingsBtn = document.getElementById('settings-btn');

    // ---- text-prompt overlay (custom window.prompt replacement) ----
    els.textPromptOverlay = document.getElementById('text-prompt-overlay');
    els.textPromptTitle = document.getElementById('text-prompt-title');
    els.textPromptInput = document.getElementById('text-prompt-input');
    els.textPromptCancel = document.getElementById('text-prompt-cancel');
    els.textPromptConfirm = document.getElementById('text-prompt-confirm');

    // ---- settings overlay ----
    els.settingsOverlay = document.getElementById('settings-overlay');
    els.settingsNicknameValue = document.getElementById('settings-nickname-value');
    els.settingsNicknameBtn = document.getElementById('settings-nickname-btn');
    els.settingsAccentSwatches = document.getElementById('settings-accent-swatches');
    els.settingsBgSwatches = document.getElementById('settings-bg-swatches');
    els.settingsBgImageInput = document.getElementById('settings-bg-image-input');
    els.settingsBgImageBtn = document.getElementById('settings-bg-image-btn');
    els.settingsBgImageClear = document.getElementById('settings-bg-image-clear');
    els.settingsBgStatus = document.getElementById('settings-bg-status');
    els.settingsSignoutSection = document.getElementById('settings-signout-section');
    els.settingsSignoutBtn = document.getElementById('settings-signout-btn');
    els.settingsCloseBtn = document.getElementById('settings-close-btn');
    els.settingsThemeRow = document.getElementById('settings-theme-row');

    // ---- Naists tab ----
    els.naistsBreadcrumb = document.getElementById('naists-breadcrumb');
    els.naistsSearch = document.getElementById('naists-search');
    els.naistsList = document.getElementById('naists-list');
    els.newNaistBtn = document.getElementById('new-naist-btn');
    els.newDeckBtn = document.getElementById('new-deck-btn');
    els.importDeckBtn = document.getElementById('import-deck-btn');
    els.importDeckInput = document.getElementById('import-deck-input');

    // ---- New-deck overlay ----
    els.newDeckOverlay = document.getElementById('new-deck-overlay');
    els.newDeckNameInput = document.getElementById('new-deck-name-input');
    els.newDeckStatus = document.getElementById('new-deck-status');
    els.newDeckEmptyBtn = document.getElementById('new-deck-empty-btn');
    els.newDeckAnkiBtn = document.getElementById('new-deck-anki-btn');
    els.newDeckAnkiInput = document.getElementById('new-deck-anki-input');
    els.newDeckCancelBtn = document.getElementById('new-deck-cancel-btn');

    // ---- Stody tab ----
    els.studyNoDeckState = document.getElementById('study-no-deck-state');
    els.studyNoDeckGotoBtn = document.getElementById('study-no-deck-goto-btn');
    els.studySession = document.getElementById('study-session');
    els.backToDecksBtn = document.getElementById('back-to-decks-btn');
    els.sessionProgress = document.getElementById('session-progress');
    els.cramModeBadge = document.getElementById('cram-mode-badge');
    els.undoRatingBtn = document.getElementById('undo-rating-btn');
    els.emptyState = document.getElementById('empty-state');
    els.emptyStateText = els.emptyState.querySelector('p');
    els.emptyBackBtn = document.getElementById('empty-back-btn');
    els.studyCard = document.getElementById('study-card');
    els.cardFront = document.getElementById('card-front');
    els.cardFrontText = document.getElementById('card-front-text');
    els.cardFrontImage = document.getElementById('card-front-image');
    els.cardOcclusionWrap = document.getElementById('card-occlusion-wrap');
    els.cardBack = document.getElementById('card-back');
    els.cardBackText = document.getElementById('card-back-text');
    els.cardBackImage = document.getElementById('card-back-image');
    els.showAnswerBtn = document.getElementById('show-answer-btn');
    els.ratingButtons = document.getElementById('rating-buttons');

    // ---- Edit Daeck tab ----
    els.editNoDeckState = document.getElementById('edit-no-deck-state');
    els.editNoDeckGotoBtn = document.getElementById('edit-no-deck-goto-btn');
    els.editDeckPanel = document.getElementById('edit-deck-panel');
    els.editDeckBreadcrumb = document.getElementById('edit-deck-breadcrumb');
    els.editDeckTitle = document.getElementById('edit-deck-title');
    els.editDeckCounts = document.getElementById('edit-deck-counts');
    els.editDeckRenameBtn = document.getElementById('edit-deck-rename-btn');
    els.editDeckDeleteBtn = document.getElementById('edit-deck-delete-btn');

    els.addFront = document.getElementById('add-front');
    els.addBack = document.getElementById('add-back');
    els.addFrontImageInput = document.getElementById('add-front-image');
    els.addFrontImagePreview = document.getElementById('add-front-image-preview');
    els.addFrontImageRemove = document.getElementById('add-front-image-remove');
    els.addBackImageInput = document.getElementById('add-back-image');
    els.addBackImagePreview = document.getElementById('add-back-image-preview');
    els.addBackImageRemove = document.getElementById('add-back-image-remove');
    els.addCardBtn = document.getElementById('add-card-btn');

    els.editDeckSearch = document.getElementById('edit-deck-search');
    els.editDeckCardList = document.getElementById('edit-deck-card-list');

    // ---- Stats tab ----
    els.statsTiles = document.getElementById('stats-tiles');
    els.statsActivityChart = document.getElementById('stats-activity-chart');
    els.statsForecastChart = document.getElementById('stats-forecast-chart');
    els.statsDeckBreakdown = document.getElementById('stats-deck-breakdown');

    els.pigField = document.getElementById('pig-field');

    els.pigOverlay = document.getElementById('pig-encouragement-overlay');
    els.pigOverlayImg = document.getElementById('pig-encouragement-img');
    els.pigOverlayText = document.getElementById('pig-encouragement-text');
    els.pigOverlayContinue = document.getElementById('pig-encouragement-continue');
    els.pigStarBadge = document.getElementById('pig-star-badge');

    els.shortcutsBtn = document.getElementById('shortcuts-btn');
    els.shortcutsOverlay = document.getElementById('shortcuts-overlay');
    els.shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');

    els.loadingOverlay = document.getElementById('loading-overlay');
    els.spinnerImg = document.getElementById('spinner-img');
  }

  // ---------------- loading overlay ----------------

  let _loadingDepth = 0;
  function showLoading() {
    _loadingDepth++;
    els.loadingOverlay.hidden = false;
  }
  function hideLoading() {
    _loadingDepth = Math.max(0, _loadingDepth - 1);
    if (_loadingDepth === 0) els.loadingOverlay.hidden = true;
  }
  async function withLoading(fn) {
    showLoading();
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const elapsed = Date.now() - start;
      const minMs = 350;
      if (elapsed < minMs) await new Promise(function (r) { setTimeout(r, minMs - elapsed); });
      hideLoading();
    }
  }

  // ---------------- auth ----------------

  function bindAuthScreen() {
    els.usernameSubmit.addEventListener('click', submitUsername);
    els.usernameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitUsername();
    });
  }

  async function submitUsername() {
    const name = els.usernameInput.value.trim();
    if (!name) {
      els.usernameInput.focus();
      return;
    }
    await withLoading(async function () {
      await setUsername(name);
      currentUsername = name;
      await enterApp();
    });
  }

  // ---------------- cloud auth (Google sign-in via window.CloudAuth) ----------------
  // Only ever wired up when window.CloudAuth.isConfigured is true (see init()
  // above) — the plain local-username flow above this is left completely
  // untouched for the unconfigured case.

  // Turns a Firebase auth error into a friendly, specific sentence. Falls
  // back to the raw code/message so a failure is NEVER invisible.
  function describeAuthError(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/operation-not-allowed':
        return "Google sign-in isn't enabled for this project yet.";
      case 'auth/unauthorized-domain':
        return "This domain isn't authorized in Firebase Auth settings.";
      case 'auth/popup-blocked':
        return 'Your browser blocked the sign-in popup — allow popups (we\'ll also try a redirect).';
      case 'auth/popup-closed-by-user':
        return 'You closed the sign-in window before finishing. Give it another go.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in attempt is already in progress.';
      case 'auth/network-request-failed':
        return 'Network error reaching Firebase — check your connection and retry.';
      default:
        return err && (err.code || err.message)
          ? 'Sign-in failed: ' + (err.code || err.message)
          : 'Sign-in failed. Please try again.';
    }
  }

  function showAuthError(message) {
    if (!els.authCloudError) return;
    els.authCloudError.textContent = message;
    els.authCloudError.hidden = false;
  }

  function clearAuthError() {
    if (!els.authCloudError) return;
    els.authCloudError.textContent = '';
    els.authCloudError.hidden = true;
  }

  // Activates the Firestore-backed storage for `uid`, but never lets a slow or
  // hung Firestore call block entry into the app. If activate() doesn't settle
  // within `ms`, we stop waiting and proceed on local storage; if it later
  // resolves it simply installs the cloud backend and sync resumes. This is
  // the safety net that guarantees a successful sign-in always reaches the app
  // even when Firestore is unreachable or misconfigured.
  async function activateCloudStoreWithTimeout(uid, ms) {
    if (!(window.CloudStore && window.CloudStore.isConfigured)) return;
    let timer;
    const timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve('__timeout__'); }, ms);
    });
    try {
      const outcome = await Promise.race([
        window.CloudStore.activate(uid).then(
          function () { return '__ok__'; },
          function (err) { console.error('CloudStore.activate failed; using local storage.', err); return '__failed__'; }
        ),
        timeout
      ]);
      if (outcome === '__timeout__') {
        console.error('CloudStore.activate timed out; proceeding on local storage.');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // Single, idempotent path into the app for an authenticated cloud user.
  // Called from every source that can report a signed-in user (popup return
  // value, post-redirect getCurrentUser snapshot, onAuthStateChanged) — the
  // _cloudEntering guard and the els.app.hidden check make concurrent/repeat
  // calls harmless. If anything throws, we return the user to the auth screen
  // with a visible message instead of leaving them on a half-entered/hung page.
  async function enterAppForUser(user) {
    if (!user) return;
    // Already inside the app: just keep the greeting fresh (e.g. a token
    // refresh re-firing onAuthStateChanged) and bail.
    if (!els.app.hidden) {
      els.userGreeting.textContent = 'Hi, ' + (user.displayName || user.email || 'friend');
      return;
    }
    if (_cloudEntering) return;
    _cloudEntering = true;
    try {
      await withLoading(async function () {
        // Load THIS user's Firestore-backed data (and run the one-time
        // local→cloud migration) BEFORE the app reads any of it — but never
        // let it hang the sign-in (see activateCloudStoreWithTimeout).
        await activateCloudStoreWithTimeout(user.uid, 8000);
        // The app identity is the user's chosen nickname (persisted per-user
        // and cloud-synced), NEVER the Google display name. May be null on a
        // first-ever sign-in — we prompt for it just below.
        currentUsername = await getUsername();
        if (els.app.hidden) await enterApp();
      });
      // First sign-in (or any user without a saved nickname): ask for one via
      // the in-app "Your nameb:" popup. Non-blocking to sign-in — dismissing
      // just leaves them as "friend" until they set one in Saettings.
      if (!currentUsername) await promptForNickname(true);
    } catch (err) {
      console.error('Entering app after sign-in failed:', err);
      // Don't strand the user on a blank/half-entered page — put them back on
      // the auth screen with an explanation so the button never looks dead.
      showAuthScreen();
      showAuthError(describeAuthError(err));
    } finally {
      _cloudEntering = false;
    }
  }

  // Marks that the one-time initial-session check has finished. Until it has,
  // the onAuthStateChanged listener must not reveal the auth screen (the init
  // gate owns that decision), so a transient null before the redirect/persisted
  // session resolves can never flash the sign-in button.
  let _initialAuthSettled = false;

  async function setupCloudAuthScreen() {
    els.googleSigninBtn.addEventListener('click', async function () {
      els.googleSigninBtn.disabled = true;
      clearAuthError();
      try {
        // Resolves with a user on popup success, or null when the flow handed
        // off to a full-page redirect (navigation is underway — getRedirectResult()
        // finishes it on the next load). On popup success we enter the app
        // directly from this return value rather than waiting on the listener,
        // which is exactly the path desktop Safari's popup can fail to deliver.
        const user = await CloudAuth.signInWithGoogle();
        if (user) await enterAppForUser(user);
      } catch (err) {
        console.error('Google sign-in failed:', err);
        showAuthError(describeAuthError(err));
      } finally {
        els.googleSigninBtn.disabled = false;
      }
    });

    // DEFINITIVE initial state: auth.js has already awaited getRedirectResult
    // and getInitialUser resolves from the first onAuthStateChanged (bounded,
    // with a currentUser fallback so it can't hang). We block the auth UI on
    // this so Safari never flashes the sign-in button before a restored or
    // just-redirected session enters the app.
    let initialUser = null;
    try {
      initialUser = await CloudAuth.getInitialUser();
    } catch (e) {
      console.error('CloudAuth.getInitialUser failed; falling back to currentUser.', e);
      initialUser = (CloudAuth.getCurrentUser && CloudAuth.getCurrentUser()) || null;
    }
    _initialAuthSettled = true;

    if (initialUser) {
      await enterAppForUser(initialUser);
    } else {
      // Genuinely signed out — NOW reveal the Google form (never before).
      els.authLocalForm.hidden = true;
      els.authCloudForm.hidden = false;
      els.authScreen.hidden = false;
      const redirectErr = window.CloudAuth.getRedirectError && window.CloudAuth.getRedirectError();
      if (redirectErr) showAuthError(describeAuthError(redirectErr));
    }

    // Ongoing subscription for future sign-in/sign-out. Its immediate re-fire
    // with the current state is harmless: a present user just refreshes the
    // greeting (enterAppForUser no-ops when already in), and a null before the
    // initial check settles is ignored.
    CloudAuth.onAuthStateChanged(async function (user) {
      if (user) {
        await enterAppForUser(user);
      } else {
        if (!_initialAuthSettled) return;
        // A spurious null while a user is actually present (can happen mid
        // token refresh) must NOT bounce us to the auth screen.
        if (window.CloudAuth.getCurrentUser && window.CloudAuth.getCurrentUser()) return;
        currentUsername = null;
        // Flush pending cloud writes and revert storage to local-only so the
        // signed-out app can never read/write the previous user's data.
        if (window.CloudStore && window.CloudStore.isConfigured) {
          await window.CloudStore.deactivate();
        }
        showAuthScreen();
      }
    });
  }

  function showAuthScreen() {
    els.app.hidden = true;
    // Show the form that matches the current mode so a sign-out (or a failed
    // entry) never reveals the wrong one.
    const configured = window.CloudAuth && window.CloudAuth.isConfigured;
    els.authLocalForm.hidden = configured;
    els.authCloudForm.hidden = !configured;
    els.authScreen.hidden = false;
  }

  async function enterApp() {
    els.authScreen.hidden = true;
    els.app.hidden = false;

    pigState = await getPigState();
    await applyAppearanceFromSettings();

    els.userGreeting.textContent = currentUsername ? 'Hi, ' + currentUsername : '';
    updatePigCountDisplay();
    updateStarCountDisplay();

    bindTabs();
    bindNaistsView();
    bindNewDeckOverlay();
    bindStudyTab();
    bindEditView();
    bindPigOverlay();
    bindShortcutsOverlay();
    bindSettingsOverlay();
    bindTextPrompt();

    await withLoading(async function () {
      await initScatteredPigs(els.pigField, pigState.totalPigs);
      await renderNaistsBrowser();
    });
  }

  function updatePigCountDisplay() {
    els.pigCountDisplay.textContent = pigState.totalPigs + (pigState.totalPigs === 1 ? ' bigbert' : ' bigberts');
  }

  function updateStarCountDisplay() {
    const count = pigState.starCount || 0;
    els.starCountValue.textContent = count;
    els.starCountDisplay.hidden = count === 0;
  }

  // ---------------- appearance (background + foreground themes) ----------------
  // Preset ids match the :root[data-bg]/[data-accent] token blocks in
  // styles.css. `swatch` is the preview color in Settings; `swatchImage`
  // (optional) shows a photo instead. Actual theming is done by the CSS
  // token blocks (so light/dark pairs keep following the chosen appearance:
  // System uses prefers-color-scheme; Light/Dark set data-theme and override).

  const BACKGROUND_PRESETS = [
    { id: 'paper', name: 'Paper', swatch: '#faf6f7' },
    { id: 'slate', name: 'Slate', swatch: '#e6ebf0' },
    { id: 'dusk', name: 'Dusk', swatch: '#ece5f6' },
    { id: 'pig', name: 'Pig', swatch: '#fbe0ee' },
    { id: 'grass', name: 'Grass', swatch: '#bfe08e', swatchImage: 'resources/grass.jpg' }
  ];

  const ACCENT_PRESETS = [
    { id: 'raspberry', name: 'Berry', swatch: '#d6337a' },
    { id: 'blueberry', name: 'Blue', swatch: '#3b6fd4' },
    { id: 'matcha', name: 'Matcha', swatch: '#2f9e63' },
    { id: 'tangerine', name: 'Tang', swatch: '#e07d2a' },
    { id: 'grape', name: 'Grape', swatch: '#8b46c8' }
  ];

  // Applies the chosen background + accent + light/dark appearance to
  // <html>/<body>. Preset tokens are driven by data-attributes (CSS does the
  // light/dark work via prefers-color-scheme, or via data-theme when the user
  // pinned Light/Dark in Settings); a custom uploaded image is applied as an
  // inline, cover-fit (never stretched) background so its aspect ratio is
  // preserved.
  function applyAppearance(settings) {
    const s = settings || {};
    const theme = (s.theme === 'light' || s.theme === 'dark') ? s.theme : 'system';
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const accent = s.accentPreset || 'raspberry';
    document.documentElement.dataset.accent = accent;

    const bg = s.backgroundPreset || 'paper';
    if (bg === 'custom' && s.backgroundImage) {
      document.documentElement.dataset.bg = 'custom';
      document.body.style.backgroundImage = 'url("' + s.backgroundImage + '")';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.documentElement.dataset.bg = bg;
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
    }
  }

  async function applyAppearanceFromSettings() {
    try {
      applyAppearance(await getSettings());
    } catch (e) {
      applyAppearance(null);
    }
  }

  // ---------------- nickname ("Your nameb:") ----------------

  // Shows the "Your nameb:" popup and, on a non-empty confirm, persists it as
  // the per-user nickname (localStorage `study_username_v1`, cloud-synced when
  // signed in) and refreshes the greeting. `required` only tunes copy — the
  // user can still dismiss (they just stay "friend" until they set one).
  async function promptForNickname(required) {
    const name = await openTextPrompt({
      title: 'Your nameb:',
      placeholder: 'What should we call you?',
      value: currentUsername || '',
      confirmText: required ? 'Gobing' : 'Save',
      requireNonEmpty: true
    });
    if (name && name.trim()) {
      currentUsername = name.trim();
      await setUsername(currentUsername);
      els.userGreeting.textContent = 'Hi, ' + currentUsername;
      if (els.settingsNicknameValue) els.settingsNicknameValue.textContent = currentUsername;
    }
    return currentUsername;
  }

  // ---------------- generic text-prompt overlay (window.prompt replacement) ----------------

  var _textPromptResolve = null;

  function bindTextPrompt() {
    if (els.textPromptOverlay.dataset.bound) return;
    els.textPromptOverlay.dataset.bound = '1';

    els.textPromptConfirm.addEventListener('click', _resolveTextPrompt);
    els.textPromptCancel.addEventListener('click', function () { _closeTextPrompt(null); });
    els.textPromptInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _resolveTextPrompt(); }
      else if (e.key === 'Escape') { e.preventDefault(); _closeTextPrompt(null); }
    });
    els.textPromptInput.addEventListener('input', _syncTextPromptConfirm);
    // Click on the dim backdrop (but not the card) cancels.
    els.textPromptOverlay.addEventListener('mousedown', function (e) {
      if (e.target === els.textPromptOverlay) _closeTextPrompt(null);
    });
  }

  function _syncTextPromptConfirm() {
    if (els.textPromptConfirm.dataset.requireNonEmpty === '1') {
      els.textPromptConfirm.disabled = !els.textPromptInput.value.trim();
    }
  }

  function _resolveTextPrompt() {
    const val = els.textPromptInput.value;
    if (els.textPromptConfirm.dataset.requireNonEmpty === '1' && !val.trim()) return;
    _closeTextPrompt(val);
  }

  function _closeTextPrompt(result) {
    els.textPromptOverlay.hidden = true;
    const resolve = _textPromptResolve;
    _textPromptResolve = null;
    if (resolve) resolve(result === null || result === undefined ? null : result);
  }

  // Opens the in-app prompt; resolves with the entered string, or null if
  // cancelled/dismissed. Only one prompt is shown at a time.
  function openTextPrompt(opts) {
    opts = opts || {};
    bindTextPrompt();
    if (_textPromptResolve) _closeTextPrompt(null);
    els.textPromptTitle.textContent = opts.title || 'Naemb';
    els.textPromptInput.value = opts.value || '';
    els.textPromptInput.placeholder = opts.placeholder || '';
    els.textPromptConfirm.textContent = opts.confirmText || 'OK';
    els.textPromptConfirm.dataset.requireNonEmpty = opts.requireNonEmpty ? '1' : '';
    _syncTextPromptConfirm();
    els.textPromptOverlay.hidden = false;
    setTimeout(function () { els.textPromptInput.focus(); els.textPromptInput.select(); }, 30);
    return new Promise(function (resolve) { _textPromptResolve = resolve; });
  }

  // ---------------- settings overlay ----------------

  function bindSettingsOverlay() {
    els.settingsBtn.addEventListener('click', openSettings);
    els.settingsCloseBtn.addEventListener('click', closeSettings);
    els.settingsOverlay.addEventListener('mousedown', function (e) {
      if (e.target === els.settingsOverlay) closeSettings();
    });

    els.settingsNicknameBtn.addEventListener('click', function () { promptForNickname(false); });

    els.settingsSignoutBtn.addEventListener('click', async function () {
      closeSettings();
      await withLoading(async function () {
        await CloudAuth.signOutUser();
        // showAuthScreen() runs from the onAuthStateChanged(null) callback.
      });
    });

    els.settingsBgImageBtn.addEventListener('click', function () { els.settingsBgImageInput.click(); });
    els.settingsBgImageInput.addEventListener('change', onCustomBgImageChosen);
    els.settingsBgImageClear.addEventListener('click', async function () {
      const s = await getSettings();
      s.backgroundPreset = 'paper';
      s.backgroundImage = null;
      await saveSettings(s);
      applyAppearance(s);
      await renderSettings();
    });

    els.settingsThemeRow.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-theme-choice]');
      if (!btn) return;
      const choice = btn.getAttribute('data-theme-choice');
      if (choice !== 'light' && choice !== 'dark' && choice !== 'system') return;
      const s = await getSettings();
      s.theme = choice;
      await saveSettings(s);
      applyAppearance(s);
      await renderSettings();
    });
  }

  async function openSettings() {
    await renderSettings();
    els.settingsOverlay.hidden = false;
  }

  function closeSettings() {
    els.settingsOverlay.hidden = true;
  }

  async function renderSettings() {
    const settings = await getSettings();

    els.settingsNicknameValue.textContent = currentUsername || 'friend';

    // Sign out only makes sense (and is only wired) with cloud auth on.
    els.settingsSignoutSection.hidden = !(window.CloudAuth && window.CloudAuth.isConfigured);

    const theme = (settings.theme === 'light' || settings.theme === 'dark') ? settings.theme : 'system';
    Array.prototype.forEach.call(els.settingsThemeRow.querySelectorAll('[data-theme-choice]'), function (btn) {
      const on = btn.getAttribute('data-theme-choice') === theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    _renderSwatches(els.settingsAccentSwatches, ACCENT_PRESETS, settings.accentPreset || 'raspberry', async function (id) {
      const s = await getSettings();
      s.accentPreset = id;
      await saveSettings(s);
      applyAppearance(s);
      await renderSettings();
    });

    const activeBg = (settings.backgroundPreset === 'custom') ? 'custom' : (settings.backgroundPreset || 'paper');
    _renderSwatches(els.settingsBgSwatches, BACKGROUND_PRESETS, activeBg, async function (id) {
      const s = await getSettings();
      s.backgroundPreset = id;
      await saveSettings(s);
      applyAppearance(s);
      await renderSettings();
    });

    const hasCustom = settings.backgroundPreset === 'custom' && !!settings.backgroundImage;
    els.settingsBgImageClear.hidden = !hasCustom;
    els.settingsBgStatus.textContent = hasCustom ? 'Using a custom imaebg.' : '';
    els.settingsBgStatus.classList.remove('error');
  }

  function _renderSwatches(container, presets, activeId, onPick) {
    container.innerHTML = '';
    presets.forEach(function (preset) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch' + (preset.id === activeId ? ' active' : '');
      if (preset.swatchImage) {
        btn.style.backgroundColor = preset.swatch;
        btn.style.backgroundImage = 'url("' + preset.swatchImage + '")';
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
        btn.style.backgroundRepeat = 'no-repeat';
      } else {
        btn.style.background = preset.swatch;
      }
      btn.title = preset.name;
      btn.setAttribute('aria-label', preset.name);
      const label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = preset.name;
      btn.appendChild(label);
      btn.addEventListener('click', function () { onPick(preset.id); });
      container.appendChild(btn);
    });
  }

  async function onCustomBgImageChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    els.settingsBgStatus.classList.remove('error');
    els.settingsBgStatus.textContent = 'Prosessing imaebg…';
    try {
      // Compress hard: page backgrounds don't need card-level fidelity, and a
      // big data URI can blow the localStorage/Firestore-doc quota.
      const dataUri = await fileToCompressedDataUri(file, 1280, 0.68);
      const s = await getSettings();
      s.backgroundPreset = 'custom';
      s.backgroundImage = dataUri;
      try {
        await saveSettings(s);
      } catch (quotaErr) {
        // Retry once at a smaller size before giving up.
        const smaller = await fileToCompressedDataUri(file, 800, 0.6);
        s.backgroundImage = smaller;
        await saveSettings(s);
      }
      applyAppearance(s);
      await renderSettings();
    } catch (err) {
      console.error('Custom background failed:', err);
      els.settingsBgStatus.classList.add('error');
      els.settingsBgStatus.textContent = 'That imaebg was too big or unreadable — try a smaller one.';
    }
  }

  // ---------------- tabs ----------------

  function bindTabs() {
    els.tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });
  }

  // `opts.deckId` (Stody/Edit only) forces that specific deck, bypassing the
  // Stody tab's "resume last-studied deck" default and the Edit tab's
  // "show whatever's currently open" default — used by a deck row's
  // explicit Stody/Cram/Edit buttons. A plain tab-bar click never passes
  // opts, so it always falls through to those defaults.
  function switchTab(tab, opts) {
    opts = opts || {};
    els.tabBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    Object.keys(els.views).forEach(function (name) {
      els.views[name].classList.toggle('active', name === tab);
    });

    if (tab === 'naists') renderNaistsBrowser();
    if (tab === 'study') {
      if (opts.deckId) {
        startDeckSession(opts.deckId, opts.deckName, opts.cram ? { cram: true } : undefined);
      } else {
        showStudyTab();
      }
    }
    if (tab === 'edit') {
      if (opts.deckId) {
        openEditDeck(opts.deckId);
      } else {
        renderEditTab();
      }
    }
    if (tab === 'stats') renderStatsView();
  }

  // ---------------- naist helpers (shared: Naists browser + Edit Daeck breadcrumb) ----------------

  function naistById(naists, id) {
    if (!id) return null;
    return naists.find(function (n) { return n.id === id; }) || null;
  }

  // Ancestor chain from the top level down to (and including) `naistId`.
  function naistPath(naists, naistId) {
    const path = [];
    let current = naistById(naists, naistId);
    while (current) {
      path.unshift(current);
      current = naistById(naists, current.parentNaistId);
    }
    return path;
  }

  function naistPathLabel(naists, naistId) {
    return naistPath(naists, naistId).map(function (n) { return n.name; }).join(' / ');
  }

  function deckDisplayLabel(deck, naists) {
    const pathLabel = naistPathLabel(naists, deck.naistId);
    return pathLabel ? pathLabel + ' / ' + deck.name : deck.name;
  }

  // Every naist nested anywhere inside `rootId` (not including itself), at
  // any depth.
  function collectDescendantNaistIds(naists, rootId) {
    const ids = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      naists.forEach(function (n) {
        if (n.parentNaistId === id) { ids.push(n.id); stack.push(n.id); }
      });
    }
    return ids;
  }

  // A due-count rollup for a naist row: every card due right now across
  // every deck nested anywhere inside this naist (its own decks plus every
  // descendant naist's decks), so a user can tell where their work is
  // without drilling in. Also returns a total-deck count for the row's
  // secondary line.
  function computeNaistRollup(naist, naists, decks, cards, now) {
    const naistIdSet = {};
    naistIdSet[naist.id] = true;
    collectDescendantNaistIds(naists, naist.id).forEach(function (id) { naistIdSet[id] = true; });

    const deckIdSet = {};
    let deckCount = 0;
    decks.forEach(function (d) {
      if (naistIdSet[d.naistId]) { deckIdSet[d.id] = true; deckCount++; }
    });

    let due = 0;
    cards.forEach(function (c) {
      if (deckIdSet[c.deckId] && isDue(c, now)) due++;
    });

    return { due: due, deckCount: deckCount };
  }

  // A small, cute bird-nest glyph (inline SVG, not an emoji) that visually
  // distinguishes a naist row from a deck row at a glance. Drawn in the same
  // clean line style as the tab-nav icons: a woven bowl with two eggs.
  const _SVG_NS = 'http://www.w3.org/2000/svg';

  function _svgEl(tag, attrs) {
    const el = document.createElementNS(_SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function buildNaistIcon() {
    const svg = _svgEl('svg', { viewBox: '0 0 24 24', class: 'naist-icon', 'aria-hidden': 'true' });
    svg.appendChild(_svgEl('path', { d: 'M3 13c0 3.5 4 6 9 6s9-2.5 9-6' }));
    svg.appendChild(_svgEl('path', { d: 'M3 13c1.5-1.3 3-1.3 4.5 0M16.5 13c1.5-1.3 3-1.3 4.5 0' }));
    svg.appendChild(_svgEl('ellipse', { cx: '10', cy: '13.1', rx: '1.6', ry: '1.9' }));
    svg.appendChild(_svgEl('ellipse', { cx: '14', cy: '13.4', rx: '1.6', ry: '1.9' }));
    return svg;
  }

  // Builds a compact icon-only Delete button (trash-can glyph) used
  // everywhere a textual "Delete" button used to live. Accessible via
  // title + aria-label since it carries no visible text.
  const _TRASH_PATH = 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6';

  // Indents a nested browse row while keeping it inside the centered column:
  // the left margin is subtracted from the row's width so margin + width
  // never exceeds 100% (which previously pushed deep rows past the right edge).
  function _applyRowIndent(row, depth) {
    const indent = depth * 22;
    row.style.marginLeft = indent + 'px';
    row.style.width = 'calc(100% - ' + indent + 'px)';
  }

  function buildDeleteButton(onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-action-btn delete-btn';
    btn.title = 'Delete';
    btn.setAttribute('aria-label', 'Delete');
    const svg = _svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.appendChild(_svgEl('path', { d: _TRASH_PATH }));
    btn.appendChild(svg);
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Shared breadcrumb trail renderer used by both the Naists browser and the
  // Edit Daeck tab's heading. `currentNaistId` is the naist level being
  // shown; `onNavigate(naistId)` is called with the id to jump to (null =
  // top). `trailingLabel`, if given, appends one more non-clickable "current"
  // crumb after the naist path (used by Edit Daeck to show the deck name as
  // the final crumb, with every naist ancestor — including the deck's direct
  // parent — clickable).
  function renderBreadcrumb(containerEl, naists, currentNaistId, onNavigate, trailingLabel) {
    containerEl.innerHTML = '';
    const path = naistPath(naists, currentNaistId);
    const crumbs = [{ id: null, name: 'All daecks' }].concat(
      path.map(function (n) { return { id: n.id, name: n.name }; })
    );
    if (trailingLabel !== undefined && trailingLabel !== null) {
      crumbs.push({ id: currentNaistId, name: trailingLabel });
    }
    crumbs.forEach(function (crumb, i) {
      const isLast = i === crumbs.length - 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'breadcrumb-crumb' + (isLast ? ' current' : '');
      btn.textContent = crumb.name;
      btn.disabled = isLast;
      // id of the level this crumb represents (empty string = top level) so
      // the Naists browser can turn crumbs into drag-and-drop targets.
      btn.dataset.naistId = crumb.id == null ? '' : crumb.id;
      if (!isLast) btn.addEventListener('click', function () { onNavigate(crumb.id); });
      containerEl.appendChild(btn);
      if (!isLast) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '/';
        containerEl.appendChild(sep);
      }
    });
  }

  // Restarts `container`'s level-enter animation (used whenever the Naists
  // browser navigates to a different level) by removing then re-adding the
  // class across a forced reflow.
  function _replayLevelEnter(container) {
    container.classList.remove('level-enter');
    void container.offsetWidth;
    container.classList.add('level-enter');
  }

  // ---------------- Naists tab: browser ----------------

  function bindNaistsView() {
    els.naistsSearch.addEventListener('input', function () { renderNaistsBrowser(); });

    els.newNaistBtn.addEventListener('click', async function () {
      const name = await openTextPrompt({
        title: 'New naist',
        placeholder: 'Naist name',
        confirmText: 'Create',
        requireNonEmpty: true
      });
      if (!name || !name.trim()) return;
      await addNaist(name.trim(), browseNaistId);
      await renderNaistsBrowser();
    });

    els.newDeckBtn.addEventListener('click', openNewDeckOverlay);

    // "+ Import daeck" — one-click Anki import that spins up a brand-new deck
    // named after the file, dropped into whatever naist level is being
    // browsed, then jumps straight into editing it.
    els.importDeckBtn.addEventListener('click', function () { els.importDeckInput.click(); });
    els.importDeckInput.addEventListener('change', async function (e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'Imported daeck';
      await withLoading(async function () {
        try {
          const deck = await addDeck(baseName, browseNaistId);
          const parsed = await importAnkiFile(file);
          await addCards(parsed, deck.id);
          switchTab('edit', { deckId: deck.id });
        } catch (err) {
          alert(err && err.message ? err.message : 'Import failed.');
        }
      });
    });
  }

  // Shows the CURRENT naist level: child naists (as distinct, folder-like
  // rows you navigate into) alongside decks that live directly at this
  // level. Top level (browseNaistId === null) shows naists with no parent
  // and decks with no naistId. A non-empty search query replaces this
  // level view with a flat, cross-deck card search instead (a "search
  // everywhere" escape hatch so organizing into naists never costs you the
  // ability to just find a card).
  async function renderNaistsBrowser() {
    const [decks, naists, cards] = await Promise.all([getDecks(), getNaists(), getCards()]);
    const now = Date.now();
    lastRenderedNaists = naists;
    const query = els.naistsSearch.value.trim().toLowerCase();

    if (query) {
      els.naistsBreadcrumb.innerHTML = '';
      renderNaistsSearchResults(query, cards, decks, naists);
      return;
    }

    renderBreadcrumb(els.naistsBreadcrumb, naists, browseNaistId, function (naistId) {
      browseNaistId = naistId;
      renderNaistsBrowser();
    });

    els.naistsList.innerHTML = '';
    const ctx = { naists: naists, decks: decks, cards: cards, now: now };
    const count = appendNaistLevel(els.naistsList, browseNaistId, 0, ctx);

    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'deck-picker-empty';
      empty.textContent = browseNaistId
        ? 'This naist is empty.'
        : 'No carbs yet — create a daeck to get started.';
      els.naistsList.appendChild(empty);
    }

    _replayLevelEnter(els.naistsList);
  }

  // Renders the direct children (child naists first, then decks) of
  // `parentId` into `container` at the given indent `depth`, recursing into
  // any naist the user has expanded inline. Returns how many direct rows it
  // appended so the caller can show an empty-state for a truly empty level.
  function appendNaistLevel(container, parentId, depth, ctx) {
    const pid = parentId || null;
    const childNaists = ctx.naists
      .filter(function (n) { return (n.parentNaistId || null) === pid; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    const levelDecks = ctx.decks
      .filter(function (d) { return (d.naistId || null) === pid; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });

    childNaists.forEach(function (naist) {
      const rollup = computeNaistRollup(naist, ctx.naists, ctx.decks, ctx.cards, ctx.now);
      const hasChildren = ctx.naists.some(function (n) { return n.parentNaistId === naist.id; })
        || ctx.decks.some(function (d) { return d.naistId === naist.id; });
      container.appendChild(renderNaistRow(naist, rollup, depth, hasChildren, ctx));
      if (expandedNaistIds.has(naist.id)) {
        appendNaistLevel(container, naist.id, depth + 1, ctx);
      }
    });

    levelDecks.forEach(function (deck) {
      const deckCards = ctx.cards.filter(function (c) { return c.deckId === deck.id; });
      const dueCount = deckCards.filter(function (c) { return isDue(c, ctx.now); }).length;
      container.appendChild(renderDeckRow(deck, ctx.naists, dueCount, deckCards.length, depth));
    });

    return childNaists.length + levelDecks.length;
  }

  function renderNaistsSearchResults(query, cards, decks, naists) {
    const deckNameById = {};
    decks.forEach(function (d) { deckNameById[d.id] = deckDisplayLabel(d, naists); });

    const matches = cards.filter(function (c) {
      return c.front.toLowerCase().indexOf(query) !== -1 || c.back.toLowerCase().indexOf(query) !== -1;
    });

    els.naistsList.innerHTML = '';
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'No carbs match.';
      els.naistsList.appendChild(empty);
      return;
    }

    matches
      .slice()
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .forEach(function (card) {
        els.naistsList.appendChild(renderCardRow(card, {
          deckLabel: deckNameById[card.deckId],
          onChanged: renderNaistsBrowser
        }));
      });
  }

  // ---------------- Naists tab: drag-and-drop reorganizing ----------------
  // Decks and naists can be dragged (via the grip handle, or a deck row's
  // body) and dropped onto: another naist row (move inside it), a breadcrumb
  // crumb (move up to that ancestor level, including "All daecks" = top
  // level), or the list background (move to whatever level is being browsed).
  // Cycle-safe: a naist can never be dropped into itself or a descendant.
  // Hovering a collapsed naist mid-drag springs it open (spring-loaded
  // folders) so you can drill several levels deep in one continuous drag.

  function buildDragHandle(kind, id, label) {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Drag to move';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="5" cy="4" r="1.35"/><circle cx="5" cy="8" r="1.35"/><circle cx="5" cy="12" r="1.35"/><circle cx="11" cy="4" r="1.35"/><circle cx="11" cy="8" r="1.35"/><circle cx="11" cy="12" r="1.35"/></svg>';
    handle.addEventListener('pointerdown', function (e) {
      beginPointerDrag(e, kind, id, label);
    });
    return handle;
  }

  // Whether `item` may be dropped into the naist `targetNaistId` (null =
  // top level). Decks can go anywhere. A naist can't go into itself or any
  // of its own descendants (that would orphan a subtree into a cycle).
  function canDropInto(item, targetNaistId, naists) {
    if (!item) return false;
    const target = targetNaistId || null;
    if (item.kind === 'naist') {
      if (item.id === target) return false;
      if (target && collectDescendantNaistIds(naists, item.id).indexOf(target) !== -1) return false;
    }
    return true;
  }

  async function performMove(item, targetNaistId) {
    if (!item) return;
    const target = targetNaistId || null;
    const naists = await getNaists();
    if (!canDropInto(item, target, naists)) return;

    if (item.kind === 'deck') {
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === item.id; });
      if (!deck || (deck.naistId || null) === target) return;
      await moveDeckToNaist(item.id, target);
    } else {
      const naist = naists.find(function (n) { return n.id === item.id; });
      if (!naist || (naist.parentNaistId || null) === target) return;
      const moved = await moveNaist(item.id, target);
      if (!moved) return;
    }

    if (target) expandedNaistIds.add(target);
    await renderNaistsBrowser();
  }

  // ----- unified pointer-based drag (mouse + touch) -----
  // HTML5 drag-and-drop does not work on iOS/Android touch, so both the
  // desktop and mobile experience are built on Pointer Events instead. A drag
  // only starts from the grip handle (so a row's Stody/Edit/etc. buttons keep
  // working), and only after the pointer moves past a small threshold (so a
  // tap on the handle is a no-op). A floating ghost follows the pointer, and
  // drop targets are resolved by hit-testing whatever's under the pointer.

  var _ptrDrag = null; // { kind, id, label, forbidden, startX, startY, active, ghost, sourceRow, pointerId }

  function beginPointerDrag(e, kind, id, label) {
    if (_ptrDrag) return;
    if (e.button !== undefined && e.button > 0) return; // left / touch / pen only
    e.preventDefault();
    // Release the implicit pointer capture touch puts on the handle, otherwise
    // pointermove keeps firing at the (soon-removed) handle instead of the
    // element under the finger — which breaks elementFromPoint hit-testing and
    // dies when a spring re-render replaces the source row.
    if (e.target && e.target.releasePointerCapture && e.target.hasPointerCapture &&
        e.target.hasPointerCapture(e.pointerId)) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    _ptrDrag = {
      kind: kind, id: id, label: label || '',
      forbidden: kind === 'naist'
        ? new Set([id].concat(collectDescendantNaistIds(lastRenderedNaists, id)))
        : null,
      startX: e.clientX, startY: e.clientY,
      active: false, ghost: null, pointerId: e.pointerId,
      sourceRow: e.currentTarget.closest ? e.currentTarget.closest('.browse-row') : null
    };
    window.addEventListener('pointermove', _onPtrDragMove, true);
    window.addEventListener('pointerup', _onPtrDragEnd, true);
    window.addEventListener('pointercancel', _onPtrDragEnd, true);
  }

  function _onPtrDragMove(e) {
    if (!_ptrDrag) return;
    if (!_ptrDrag.active) {
      if (Math.abs(e.clientX - _ptrDrag.startX) + Math.abs(e.clientY - _ptrDrag.startY) < 6) return;
      _ptrDrag.active = true;
      dragItem = { kind: _ptrDrag.kind, id: _ptrDrag.id };
      dragForbidden = _ptrDrag.forbidden;
      if (_ptrDrag.sourceRow) _ptrDrag.sourceRow.classList.add('dragging');
      document.body.classList.add('drag-active');
      _ptrDrag.ghost = _buildDragGhost(_ptrDrag);
      document.body.appendChild(_ptrDrag.ghost);
    }
    e.preventDefault();
    _positionGhost(_ptrDrag.ghost, e.clientX, e.clientY);
    _updateDropHighlight(_dropElementFromPoint(e.clientX, e.clientY));
  }

  function _onPtrDragEnd(e) {
    if (!_ptrDrag) return;
    window.removeEventListener('pointermove', _onPtrDragMove, true);
    window.removeEventListener('pointerup', _onPtrDragEnd, true);
    window.removeEventListener('pointercancel', _onPtrDragEnd, true);
    const drag = _ptrDrag;
    _ptrDrag = null;
    if (drag.active) {
      const targetId = _resolveDropNaistId(_dropElementFromPoint(e.clientX, e.clientY));
      if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
      if (drag.sourceRow) drag.sourceRow.classList.remove('dragging');
      document.body.classList.remove('drag-active');
      _cancelSpring();
      _clearDropHighlights();
      const item = { kind: drag.kind, id: drag.id };
      dragItem = null;
      dragForbidden = null;
      if (targetId !== undefined) performMove(item, targetId);
    } else {
      dragItem = null;
      dragForbidden = null;
    }
  }

  function _buildDragGhost(drag) {
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    if (drag.kind === 'naist') g.appendChild(buildNaistIcon());
    const span = document.createElement('span');
    span.textContent = drag.label || (drag.kind === 'naist' ? 'Naist' : 'Daeck');
    g.appendChild(span);
    return g;
  }

  function _positionGhost(g, x, y) {
    if (!g) return;
    g.style.left = x + 'px';
    g.style.top = y + 'px';
  }

  // Hit-test what's under the pointer, with the ghost temporarily hidden so it
  // never occludes the real drop target.
  function _dropElementFromPoint(x, y) {
    var restore;
    if (_ptrDrag && _ptrDrag.ghost) { restore = _ptrDrag.ghost.style.display; _ptrDrag.ghost.style.display = 'none'; }
    const el = document.elementFromPoint(x, y);
    if (_ptrDrag && _ptrDrag.ghost) _ptrDrag.ghost.style.display = restore || '';
    return el;
  }

  // Maps the element under the pointer to the naist id an item would move INTO
  // (null = top level), or undefined if it's not a valid drop target for the
  // current drag. Naist rows / breadcrumb crumbs target that naist; a deck row
  // or the list background target the level currently being browsed.
  function _resolveDropTargetRaw(el) {
    if (!el || !el.closest) return undefined;
    const crumb = el.closest('.breadcrumb-crumb');
    if (crumb && els.naistsBreadcrumb.contains(crumb)) {
      const raw = crumb.dataset.naistId;
      return raw === undefined || raw === '' ? null : raw;
    }
    const naistRow = el.closest('.browse-row-naist');
    if (naistRow && naistRow.dataset.naistId) return naistRow.dataset.naistId;
    if (el.closest('.browse-row-deck')) return browseNaistId || null;
    if (els.naistsList.contains(el)) return browseNaistId || null;
    return undefined;
  }

  function _resolveDropNaistId(el) {
    const t = _resolveDropTargetRaw(el);
    if (t === undefined) return undefined;
    if (dragItem && dragItem.kind === 'naist' && dragForbidden && t && dragForbidden.has(t)) return undefined;
    return t;
  }

  function _updateDropHighlight(el) {
    _clearDropHighlights();
    if (!dragItem || !el || !el.closest) return;
    const t = _resolveDropTargetRaw(el);
    if (t === undefined) return;
    if (dragItem.kind === 'naist' && dragForbidden && t && dragForbidden.has(t)) return;

    const crumb = el.closest('.breadcrumb-crumb');
    if (crumb && els.naistsBreadcrumb.contains(crumb)) { crumb.classList.add('drag-over'); return; }
    const naistRow = el.closest('.browse-row-naist');
    if (naistRow && naistRow.dataset.naistId) { naistRow.classList.add('drag-over'); _springOpen(t); return; }
    els.naistsList.classList.add('drag-over-root');
  }

  // Spring-loaded folders: after hovering a collapsed naist for a beat while
  // dragging, expand it so the drag can continue deeper without dropping.
  var _springTimer = null;
  var _springId = null;
  function _springOpen(targetNaistId) {
    const id = targetNaistId || null;
    if (!id || expandedNaistIds.has(id) || _springId === id) return;
    _cancelSpring();
    _springId = id;
    _springTimer = setTimeout(function () {
      _springTimer = null;
      _springId = null;
      if (dragItem) { expandedNaistIds.add(id); renderNaistsBrowser(); }
    }, 650);
  }
  function _cancelSpring(targetNaistId) {
    if (targetNaistId !== undefined && (targetNaistId || null) !== _springId) return;
    if (_springTimer) clearTimeout(_springTimer);
    _springTimer = null;
    _springId = null;
  }
  function _clearDropHighlights() {
    Array.prototype.slice
      .call(document.querySelectorAll('.browse-row.drag-over, .breadcrumb-crumb.drag-over, #naists-list.drag-over-root'))
      .forEach(function (el) { el.classList.remove('drag-over'); el.classList.remove('drag-over-root'); });
  }

  // A naist row: click the main area to navigate into it (unchanged
  // behavior). A disclosure chevron expands/collapses its contents inline
  // (Finder list-view style) without navigating. Distinguished from a deck
  // row by the folder-tab icon and a due-count rollup badge summing every
  // due card nested anywhere inside it. Draggable (grip handle) and itself a
  // drop target. Rename/Delete act on the naist itself.
  function renderNaistRow(naist, rollup, depth, hasChildren, ctx) {
    const row = document.createElement('div');
    row.className = 'browse-row browse-row-naist';
    row.dataset.naistId = naist.id;
    if (depth) _applyRowIndent(row, depth);

    row.appendChild(buildDragHandle('naist', naist.id, naist.name));

    const body = document.createElement('div');
    body.className = 'browse-row-body';

    const expanded = expandedNaistIds.has(naist.id);
    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'naist-chevron' + (expanded ? ' expanded' : '') + (hasChildren ? '' : ' empty');
    chevron.disabled = !hasChildren;
    chevron.setAttribute('aria-label', expanded ? 'Collapse naist' : 'Expand naist');
    chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    chevron.addEventListener('click', function (e) {
      e.stopPropagation();
      if (expandedNaistIds.has(naist.id)) expandedNaistIds.delete(naist.id);
      else expandedNaistIds.add(naist.id);
      renderNaistsBrowser();
    });
    body.appendChild(chevron);

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'browse-row-main';
    mainBtn.appendChild(buildNaistIcon());

    const info = document.createElement('span');
    info.className = 'naist-row-info';
    const name = document.createElement('span');
    name.className = 'deck-row-name';
    name.textContent = naist.name;
    const meta = document.createElement('span');
    meta.className = 'naist-row-meta';
    meta.textContent = rollup.deckCount + (rollup.deckCount === 1 ? ' daeck' : ' daecks');
    info.appendChild(name);
    info.appendChild(meta);

    const dueBadge = document.createElement('span');
    dueBadge.className = 'deck-due-badge' + (rollup.due === 0 ? ' none' : '');
    dueBadge.textContent = rollup.due === 0 ? 'No carbs due' : rollup.due + ' due';

    mainBtn.appendChild(info);
    mainBtn.appendChild(dueBadge);
    mainBtn.addEventListener('click', function () {
      browseNaistId = naist.id;
      renderNaistsBrowser();
    });

    const actions = document.createElement('div');
    actions.className = 'browse-row-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'secondary-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', async function () {
      const newName = await openTextPrompt({
        title: 'Rename naist',
        value: naist.name,
        confirmText: 'Rename',
        requireNonEmpty: true
      });
      if (!newName || !newName.trim()) return;
      await renameNaist(naist.id, newName.trim());
      await renderNaistsBrowser();
    });

    const deleteBtn = buildDeleteButton(async function () {
      if (!confirm('Delete naist "' + naist.name + '"? Anything inside (daecks and naists) moves up one level — nothing is deleted.')) return;
      await deleteNaist(naist.id);
      await renderNaistsBrowser();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    body.appendChild(mainBtn);
    body.appendChild(actions);
    row.appendChild(body);

    return row;
  }

  // A deck row: name + due-count badge (yellow/gold — "something needs
  // attention") + total-count badge (grey — neutral) on one line, explicit
  // Stody/Cram/Edit buttons (no more "click the row to jump into a session"
  // — those actions are opt-in and clearly labeled), and Rename/Move/Delete
  // affordances so a deck's whole lifecycle is reachable from this one row.
  // Draggable (grip handle or body) so it can be dropped into a naist; a
  // chevron-width spacer keeps its name aligned under sibling naist rows.
  function renderDeckRow(deck, naists, dueCount, totalCount, depth) {
    const row = document.createElement('div');
    row.className = 'browse-row browse-row-deck';
    if (depth) _applyRowIndent(row, depth);

    row.appendChild(buildDragHandle('deck', deck.id, deck.name));
    const body = document.createElement('div');
    body.className = 'browse-row-body';
    const spacer = document.createElement('span');
    spacer.className = 'naist-chevron-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    body.appendChild(spacer);

    const info = document.createElement('div');
    info.className = 'browse-row-info';
    const name = document.createElement('span');
    name.className = 'deck-row-name';
    name.textContent = deck.name;
    const counts = document.createElement('span');
    counts.className = 'deck-row-counts';
    const dueBadge = document.createElement('span');
    dueBadge.className = 'deck-due-badge' + (dueCount === 0 ? ' none' : '');
    dueBadge.textContent = dueCount === 0 ? 'No carbs due' : dueCount + ' due';
    const totalBadge = document.createElement('span');
    totalBadge.className = 'deck-total-badge';
    totalBadge.textContent = totalCount + ' total';
    counts.appendChild(dueBadge);
    counts.appendChild(totalBadge);
    info.appendChild(name);
    info.appendChild(counts);

    const primary = document.createElement('div');
    primary.className = 'browse-row-primary-actions';

    const stodyBtn = document.createElement('button');
    stodyBtn.type = 'button';
    stodyBtn.className = 'browse-row-stody-btn';
    stodyBtn.textContent = 'Stody';
    stodyBtn.addEventListener('click', function () {
      switchTab('study', { deckId: deck.id, deckName: deck.name });
    });

    const cramBtn = document.createElement('button');
    cramBtn.type = 'button';
    cramBtn.className = 'secondary-btn';
    cramBtn.textContent = 'Cram';
    cramBtn.disabled = totalCount === 0;
    cramBtn.title = totalCount === 0
      ? 'No cards in this deck yet'
      : 'Study every card regardless of due date — does not affect scheduling';
    cramBtn.addEventListener('click', function () {
      switchTab('study', { deckId: deck.id, deckName: deck.name, cram: true });
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function () {
      switchTab('edit', { deckId: deck.id });
    });

    primary.appendChild(stodyBtn);
    primary.appendChild(cramBtn);
    primary.appendChild(editBtn);

    const actions = document.createElement('div');
    actions.className = 'browse-row-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'secondary-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', async function () {
      const newName = await openTextPrompt({
        title: 'Rename daeck',
        value: deck.name,
        confirmText: 'Rename',
        requireNonEmpty: true
      });
      if (!newName || !newName.trim()) return;
      await renameDeck(deck.id, newName.trim());
      await renderNaistsBrowser();
    });
    actions.appendChild(renameBtn);

    if (deck.id !== DEFAULT_DECK_ID) {
      const deleteBtn = buildDeleteButton(async function () {
        if (!confirm('Delete daeck "' + deck.name + '" and all its carbs? This can\'t be undone.')) return;
        await deleteDeck(deck.id);
        if (editDeckId === deck.id) editDeckId = null;
        await renderNaistsBrowser();
      });
      actions.appendChild(deleteBtn);
    }

    body.appendChild(info);
    body.appendChild(primary);
    body.appendChild(actions);
    row.appendChild(body);

    return row;
  }

  // ---------------- Naists tab: new-deck-with-import overlay ----------------

  function bindNewDeckOverlay() {
    els.newDeckEmptyBtn.addEventListener('click', async function () {
      const name = els.newDeckNameInput.value.trim();
      if (!name) { els.newDeckNameInput.focus(); return; }
      await withLoading(async function () {
        const deck = await addDeck(name, pendingNewDeckNaistId);
        closeNewDeckOverlay();
        switchTab('edit', { deckId: deck.id });
      });
    });

    els.newDeckAnkiBtn.addEventListener('click', function () {
      const name = els.newDeckNameInput.value.trim();
      if (!name) { els.newDeckNameInput.focus(); return; }
      els.newDeckAnkiInput.click();
    });
    els.newDeckAnkiInput.addEventListener('change', async function (e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const name = els.newDeckNameInput.value.trim();
      if (!name) { els.newDeckNameInput.focus(); return; }
      await withLoading(async function () {
        try {
          const deck = await addDeck(name, pendingNewDeckNaistId);
          const parsed = await importAnkiFile(file);
          await addCards(parsed, deck.id);
          closeNewDeckOverlay();
          switchTab('edit', { deckId: deck.id });
        } catch (err) {
          els.newDeckStatus.textContent = err.message || 'Import failed.';
        }
      });
    });

    els.newDeckCancelBtn.addEventListener('click', closeNewDeckOverlay);
  }

  function openNewDeckOverlay() {
    pendingNewDeckNaistId = browseNaistId;
    els.newDeckNameInput.value = '';
    els.newDeckStatus.textContent = '';
    els.newDeckOverlay.hidden = false;
    els.newDeckNameInput.focus();
  }

  function closeNewDeckOverlay() {
    els.newDeckOverlay.hidden = true;
  }

  // ---------------- Stody tab: active session ----------------

  function bindStudyTab() {
    els.showAnswerBtn.addEventListener('click', revealAnswer);
    Array.prototype.slice.call(els.ratingButtons.querySelectorAll('.rating-btn')).forEach(function (btn) {
      btn.addEventListener('click', function () { rateCard(btn.dataset.rating); });
    });

    // Click anywhere on the card itself to move things along: first click
    // reveals the answer (same as Show Answer); once the answer is showing,
    // a click advances to the next card (recorded as a "Gob"/good rating, so
    // it's still scheduled and still undoable). Occlusion masks keep their
    // own click-to-reveal behavior — a pre-reveal mask click is left to
    // occlusion.js and never reveals everything or advances.
    const cardShell = els.studyCard.querySelector('.card-shell');
    if (cardShell) cardShell.addEventListener('click', onStudyCardClick);

    els.backToDecksBtn.addEventListener('click', function () { endStudySession(); switchTab('naists'); });
    els.emptyBackBtn.addEventListener('click', function () { endStudySession(); switchTab('naists'); });
    els.undoRatingBtn.addEventListener('click', undoLastRating);
    els.studyNoDeckGotoBtn.addEventListener('click', function () { switchTab('naists'); });
  }

  // Opening the Stody tab directly (tab-bar click, no forced deckId): if a
  // session is already open, just show it as-is; otherwise resume the
  // last-studied deck; otherwise a friendly empty state pointing at Naists.
  async function showStudyTab() {
    if (session.activeDeckId) {
      els.studyNoDeckState.hidden = true;
      els.studySession.hidden = false;
      return;
    }
    const lastId = await getLastStudiedDeckId();
    if (lastId) {
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === lastId; });
      if (deck) {
        await startDeckSession(deck.id, deck.name);
        return;
      }
    }
    els.studySession.hidden = true;
    els.studyNoDeckState.hidden = false;
  }

  function endStudySession() {
    session.activeDeckId = null;
    session.cram = false;
    session.lastAction = null;
    els.undoRatingBtn.hidden = true;
    els.cramModeBadge.hidden = true;
    els.studySession.hidden = true;
  }

  async function startDeckSession(deckId, deckName, opts) {
    opts = opts || {};
    session.activeDeckId = deckId;
    session.activeDeckName = deckName;
    session.cram = !!opts.cram;
    session.lastAction = null;
    els.undoRatingBtn.hidden = true;
    els.cramModeBadge.hidden = !session.cram;
    els.studyNoDeckState.hidden = true;
    els.studySession.hidden = false;

    await setLastStudiedDeckId(deckId);

    await withLoading(async function () {
      const cards = await getCards();
      session.queue = session.cram
        ? buildCramQueue(cards, deckId)
        : buildStudyQueue(cards, Date.now(), deckId);
      session.reviewedCount = 0;
      session.cardsSinceLastPig = 0;
      showNextCard();
    });
  }

  function updateSessionProgress() {
    const left = session.queue.length;
    els.sessionProgress.textContent = session.activeDeckName + ' · ' + session.reviewedCount + ' reviewed · ' + left + ' left';
  }

  function showNextCard() {
    updateSessionProgress();

    if (session.queue.length === 0) {
      session.currentCard = null;
      els.studyCard.hidden = true;
      els.emptyState.hidden = false;
      els.emptyStateText.textContent = (session.cram
        ? 'No carbs in "' + session.activeDeckName + '" to cram right now'
        : 'No carbs due in "' + session.activeDeckName + '" right now') +
        (currentUsername ? ', ' + currentUsername : '') + '.';
      return;
    }

    els.emptyState.hidden = true;
    els.studyCard.hidden = false;

    session.currentCard = session.queue.shift();
    renderCardFace(session.currentCard);
    els.cardBack.hidden = true;
    els.showAnswerBtn.hidden = false;
    els.ratingButtons.hidden = true;
  }

  // Fills in the study card's front/back text + optional images. Image-
  // occlusion cards take a completely different rendering path (a masked
  // image, no front/back text) — handled by occlusion.js, hooked in here via
  // a small type check rather than reworking this function's basic-card shape.
  function renderCardFace(card) {
    if (typeof isOcclusionCard === 'function' && isOcclusionCard(card)) {
      els.cardFrontText.hidden = true;
      _setCardImage(els.cardFrontImage, null);
      els.cardBackText.textContent = '';
      _setCardImage(els.cardBackImage, null);
      renderOcclusionStudyCard(card, els.cardOcclusionWrap);
      els.cardOcclusionWrap.hidden = false;
      return;
    }
    if (els.cardOcclusionWrap) {
      els.cardOcclusionWrap.hidden = true;
      els.cardOcclusionWrap.innerHTML = '';
    }
    els.cardFrontText.hidden = false;
    els.cardFrontText.textContent = card.front;
    els.cardBackText.textContent = card.back;
    _setCardImage(els.cardFrontImage, card.frontImage);
    _setCardImage(els.cardBackImage, card.backImage);
  }

  function _setCardImage(imgEl, dataUri) {
    if (dataUri) {
      imgEl.src = dataUri;
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
    }
  }

  function revealAnswer() {
    if (!session.currentCard) return;
    // Occlusion cards have no separate "back" section (#card-back stays
    // empty/hidden for them — see renderCardFace); "Show Answer" instead
    // reveals every mask still covered, then proceeds to rating exactly like
    // every other card. Chosen over "reveal only what's already been
    // clicked" so this one action has one unambiguous meaning.
    if (typeof isOcclusionCard === 'function' && isOcclusionCard(session.currentCard)) {
      revealAllOcclusionMasks(els.cardOcclusionWrap);
    } else {
      els.cardBack.hidden = false;
    }
    els.showAnswerBtn.hidden = true;
    els.ratingButtons.hidden = false;
    updateRatingIntervalPreviews();
  }

  // Whether the current card's answer is showing and rating is available —
  // the moment when a card click should advance rather than reveal.
  function _ratingAvailable() {
    return !els.ratingButtons.hidden;
  }

  function onStudyCardClick(e) {
    if (!session.currentCard) return;
    const onMask = !!(e.target.closest && e.target.closest('.occlusion-mask'));
    // Pre-reveal, a mask click is the user peeking at one region — let
    // occlusion.js handle it; don't reveal everything or advance.
    if (onMask && !_ratingAvailable()) return;
    if (_ratingAvailable()) {
      rateCard('good');
    } else {
      revealAnswer();
    }
  }

  // Formats an interval (in days, as returned by scheduleReview) into a
  // short, human-friendly subtitle for a rating button. 0 days (the "again"
  // case) always means "due immediately, later this session" — literally
  // printing "0d" would read as a bug, so we say "now" instead. Sub-day
  // intervals (e.g. a brand-new card's Harb step) render as hours/minutes
  // rather than rounding up to a misleading "1d".
  function formatIntervalPreview(days) {
    if (typeof days !== 'number' || !isFinite(days) || days < 0) return '';
    if (days === 0) return 'now';
    if (days < 1) {
      const hours = days * 24;
      if (hours >= 1) return Math.round(hours) + 'h';
      return Math.max(1, Math.round(hours * 60)) + 'm';
    }
    if (days < 31) return Math.round(days) + 'd';
    if (days < 60) return Math.max(1, Math.round(days / 7)) + 'w';
    if (days < 365) return Math.max(1, Math.round(days / 30)) + 'mo';
    return Math.max(1, Math.round(days / 365)) + 'y';
  }

  // Speculatively previews what each rating would produce as a next
  // interval, without persisting anything (scheduleReview is pure).
  // Skips cram mode, where ratings never actually reschedule the card —
  // showing a preview there would misleadingly imply otherwise.
  function updateRatingIntervalPreviews() {
    const card = session.currentCard;
    const btns = Array.prototype.slice.call(els.ratingButtons.querySelectorAll('.rating-btn'));
    btns.forEach(function (btn) {
      const span = btn.querySelector('.rating-interval');
      if (!span) return;
      span.textContent = '';
      if (!card || session.cram) return;
      try {
        const preview = scheduleReview(card, btn.dataset.rating, Date.now());
        span.textContent = formatIntervalPreview(preview && preview.interval);
      } catch (err) {
        span.textContent = '';
      }
    });
  }

  async function rateCard(rating) {
    const card = session.currentCard;
    if (!card) return;

    const reinsertAt = Math.min(session.queue.length, 3 + Math.floor(Math.random() * 4));

    if (session.cram) {
      // Cram mode never touches scheduling data: no scheduleReview(), no
      // updateCard(), no review-log entry. It only reorders this session's
      // local queue so "Again" cards resurface, exactly like a real
      // session, but nothing here can corrupt real SRS state.
      session.lastAction = {
        cram: true,
        originalCard: card,
        wasAgain: rating === 'again'
      };
      if (rating === 'again') session.queue.splice(reinsertAt, 0, card);
    } else {
      const updated = scheduleReview(card, rating, Date.now());
      const logEntry = { id: generateId(), cardId: card.id, deckId: card.deckId, rating: rating, timestamp: Date.now() };
      await updateCard(card.id, updated);
      await logReview(logEntry);

      session.lastAction = {
        cram: false,
        originalCard: card, // pre-rating snapshot, restored verbatim on undo
        updatedCard: updated,
        logEntryId: logEntry.id,
        wasAgain: rating === 'again'
      };
      if (rating === 'again') session.queue.splice(reinsertAt, 0, updated);
    }

    session.reviewedCount++;
    session.cardsSinceLastPig++;
    els.undoRatingBtn.hidden = false;

    if (session.cardsSinceLastPig >= BIGBERT_INTERVAL) {
      session.cardsSinceLastPig = 0;
      await showPigEncouragement();
    } else {
      showNextCard();
    }
  }

  async function undoLastRating() {
    const action = session.lastAction;
    if (!action) return;

    // If we've already advanced to a different card, that card would
    // otherwise be silently dropped from the queue — put it back on top.
    if (session.currentCard && session.currentCard.id !== action.originalCard.id) {
      session.queue.unshift(session.currentCard);
    }

    // Remove the "again" requeue duplicate we inserted, if it's still
    // sitting in the queue (it won't be if it was already reshown).
    if (action.wasAgain) {
      const requeuedId = action.cram ? action.originalCard.id : action.updatedCard.id;
      const idx = session.queue.findIndex(function (c) { return c.id === requeuedId; });
      if (idx !== -1) session.queue.splice(idx, 1);
    }

    if (!action.cram) {
      await updateCard(action.originalCard.id, action.originalCard);
      await deleteReviewLogEntry(action.logEntryId);
    }

    session.reviewedCount = Math.max(0, session.reviewedCount - 1);
    session.cardsSinceLastPig = Math.max(0, session.cardsSinceLastPig - 1);
    session.currentCard = action.originalCard;
    session.lastAction = null;
    els.undoRatingBtn.hidden = true;

    // Restore the "answer revealed, about to rate" state — that's the
    // moment right before the rating we're undoing was clicked.
    updateSessionProgress();
    els.emptyState.hidden = true;
    els.studyCard.hidden = false;
    renderCardFace(session.currentCard);
    if (typeof isOcclusionCard === 'function' && isOcclusionCard(session.currentCard)) {
      revealAllOcclusionMasks(els.cardOcclusionWrap);
    } else {
      els.cardBack.hidden = false;
    }
    els.showAnswerBtn.hidden = true;
    els.ratingButtons.hidden = false;
    updateRatingIntervalPreviews();
  }

  // ---------------- pig encouragement ----------------

  let _pigOverlayArmed = false;
  let _pigOverlayTimer = null;

  function bindPigOverlay() {
    // Keyboard/Enter activation of the continue button (mouse presses are
    // already covered by the document-level mousedown listener below).
    els.pigOverlayContinue.addEventListener('click', function () { dismissPigEncouragement(); });
  }

  function _onPigOverlayMouseDown() {
    dismissPigEncouragement();
    // Swallow the trailing click from this same press so it doesn't land on
    // the freshly-revealed next card (which would otherwise reveal/advance).
    document.addEventListener('click', function eat(ev) {
      ev.stopPropagation();
      document.removeEventListener('click', eat, true);
    }, true);
  }

  // Single, idempotent teardown — guarded so the timer and a mouse press
  // (or multiple presses) can't each advance the session.
  function dismissPigEncouragement() {
    if (!_pigOverlayArmed) return;
    _pigOverlayArmed = false;
    if (_pigOverlayTimer) { clearTimeout(_pigOverlayTimer); _pigOverlayTimer = null; }
    document.removeEventListener('mousedown', _onPigOverlayMouseDown, true);
    els.pigOverlay.hidden = true;
    els.pigOverlay.classList.remove('star-event');
    els.pigStarBadge.hidden = true;
    showNextCard();
  }

  // A collection of 100 pigs converts into a star: the pig count resets to
  // 1 and starCount goes up, celebrated with a fancier overlay state instead
  // of the usual encouragement.
  function getStarCelebrationText(starCount) {
    const name = currentUsername && currentUsername.trim() ? currentUsername.trim() : 'friend';
    return starCount === 1
      ? name + ', you earned your first star! 100 pigs collected and counting.'
      : name + ', star #' + starCount + '! That is another 100 pigs in the books.';
  }

  async function showPigEncouragement() {
    const earningStar = pigState.totalPigs + 1 >= 100;
    const photoPath = await getRandomPhotoPath();
    els.pigOverlayImg.src = photoPath;

    if (earningStar) {
      pigState.starCount = (pigState.starCount || 0) + 1;
      pigState.totalPigs = 1;
      await savePigState(pigState);
      updatePigCountDisplay();
      updateStarCountDisplay();
      await initScatteredPigs(els.pigField, pigState.totalPigs);

      els.pigOverlay.classList.add('star-event');
      els.pigStarBadge.hidden = false;
      els.pigOverlayText.textContent = getStarCelebrationText(pigState.starCount);
    } else {
      els.pigOverlay.classList.remove('star-event');
      els.pigStarBadge.hidden = true;
      els.pigOverlayText.textContent = getRandomEncouragement(currentUsername);

      pigState.totalPigs += 1;
      await savePigState(pigState);
      updatePigCountDisplay();
      addScatterPig(els.pigField, pigState.totalPigs).catch(function () {});
    }

    els.pigOverlay.hidden = false;
    // Dismiss on ANY mouse press anywhere, or automatically after 3s —
    // whichever comes first. Armed here (not in bindPigOverlay) so the
    // listener/timer only live while the overlay is actually up.
    _pigOverlayArmed = true;
    document.addEventListener('mousedown', _onPigOverlayMouseDown, true);
    _pigOverlayTimer = setTimeout(dismissPigEncouragement, 3000);
  }

  // ---------------- Edit Daeck tab ----------------

  function _dtHasFiles(dt) {
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, 'Files') !== -1;
  }

  function _imageFileFromFiles(files) {
    if (!files || !files.length) return null;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f && ((f.type || '').indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name || ''))) {
        return f;
      }
    }
    return null;
  }

  function _imageFileFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    var fromFiles = _imageFileFromFiles(clipboardData.files);
    if (fromFiles) return fromFiles;
    var items = clipboardData.items;
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && (items[i].type || '').indexOf('image/') === 0) {
        return items[i].getAsFile();
      }
    }
    return null;
  }

  function _setAttachedPreview(previewEl, removeEl, dataUri) {
    var wrap = previewEl.parentElement;
    if (dataUri) {
      previewEl.src = dataUri;
      previewEl.hidden = false;
      removeEl.hidden = false;
      if (wrap) wrap.hidden = false;
    } else {
      previewEl.hidden = true;
      previewEl.removeAttribute('src');
      removeEl.hidden = true;
      if (wrap && wrap.classList.contains('image-attach')) wrap.hidden = true;
    }
  }

  // Drop / paste / click-preview on a Front or Baeck field. `dropEl` is the
  // textarea; the hidden file input is still used so clicking the preview
  // can replace the image. `onChange(dataUriOrNull)` fires on attach/remove.
  function bindImageAttach(dropEl, inputEl, previewEl, removeEl, onChange) {
    function hoverTarget() {
      return (dropEl.parentElement && dropEl.parentElement.classList.contains('field-with-image'))
        ? dropEl.parentElement
        : dropEl;
    }

    function setOver(on) {
      hoverTarget().classList.toggle('image-drop-over', on);
      dropEl.classList.toggle('image-drop-over', on);
    }

    function attachFile(file) {
      if (!file) return;
      withLoading(async function () {
        try {
          var dataUri = await fileToCompressedDataUri(file);
          _setAttachedPreview(previewEl, removeEl, dataUri);
          onChange(dataUri);
        } catch (e) {
          // non-fatal — just skip attaching an image
        }
      });
    }

    function onDragOver(e) {
      if (!_dtHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setOver(true);
    }

    function onDrop(e) {
      var file = _imageFileFromFiles(e.dataTransfer && e.dataTransfer.files);
      setOver(false);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      attachFile(file);
    }

    var dropTargets = [dropEl];
    var fieldWrap = dropEl.parentElement;
    if (fieldWrap && fieldWrap.classList.contains('field-with-image')) dropTargets.push(fieldWrap);
    if (previewEl.parentElement && dropTargets.indexOf(previewEl.parentElement) === -1) {
      dropTargets.push(previewEl.parentElement);
    }

    dropTargets.forEach(function (target) {
      target.addEventListener('dragover', onDragOver);
      target.addEventListener('dragleave', function (e) {
        if (target.contains(e.relatedTarget)) return;
        setOver(false);
      });
      target.addEventListener('drop', onDrop);
    });

    dropEl.addEventListener('paste', function (e) {
      var file = _imageFileFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      attachFile(file);
    });

    inputEl.addEventListener('change', function () {
      var file = inputEl.files[0];
      inputEl.value = '';
      if (file) attachFile(file);
    });
    previewEl.addEventListener('click', function () { inputEl.click(); });
    previewEl.title = 'Replace image';
    removeEl.addEventListener('click', function () {
      _setAttachedPreview(previewEl, removeEl, null);
      onChange(null);
    });
  }

  function resetAddImageControls() {
    addFrontImageDataUri = null;
    addBackImageDataUri = null;
    [
      [els.addFrontImagePreview, els.addFrontImageRemove],
      [els.addBackImagePreview, els.addBackImageRemove]
    ].forEach(function (pair) {
      _setAttachedPreview(pair[0], pair[1], null);
    });
  }

  function bindEditView() {
    els.editNoDeckGotoBtn.addEventListener('click', function () { switchTab('naists'); });

    els.editDeckRenameBtn.addEventListener('click', async function () {
      if (!editDeckId) return;
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === editDeckId; });
      if (!deck) return;
      const newName = await openTextPrompt({
        title: 'Rename daeck',
        value: deck.name,
        confirmText: 'Rename',
        requireNonEmpty: true
      });
      if (!newName || !newName.trim()) return;
      await renameDeck(editDeckId, newName.trim());
      await renderEditDeck();
    });

    els.editDeckDeleteBtn.addEventListener('click', async function () {
      if (!editDeckId || editDeckId === DEFAULT_DECK_ID) return;
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === editDeckId; });
      if (!deck) return;
      if (!confirm('Delete daeck "' + deck.name + '" and all its carbs? This can\'t be undone.')) return;
      await deleteDeck(deck.id);
      editDeckId = null;
      switchTab('naists');
    });

    els.editDeckSearch.addEventListener('input', function () { renderEditDeck(); });

    els.addCardBtn.addEventListener('click', submitNewCard);
    [els.addFront, els.addBack].forEach(function (ta) {
      ta.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitNewCard();
      });
    });
    bindImageAttach(els.addFront, els.addFrontImageInput, els.addFrontImagePreview, els.addFrontImageRemove, function (dataUri) {
      addFrontImageDataUri = dataUri;
    });
    bindImageAttach(els.addBack, els.addBackImageInput, els.addBackImagePreview, els.addBackImageRemove, function (dataUri) {
      addBackImageDataUri = dataUri;
    });
  }

  async function submitNewCard() {
    const front = els.addFront.value.trim();
    const back = els.addBack.value.trim();
    if (!front || !back) {
      (front ? els.addBack : els.addFront).focus();
      return;
    }
    if (!editDeckId) return;
    await addCard(front, back, editDeckId, addFrontImageDataUri, addBackImageDataUri);
    els.addFront.value = '';
    els.addBack.value = '';
    resetAddImageControls();
    els.addFront.focus();
    await renderEditDeck();

    const original = els.addCardBtn.textContent;
    els.addCardBtn.textContent = 'Added!';
    setTimeout(function () { els.addCardBtn.textContent = original; }, 900);
  }

  // Opening the Edit Daeck tab directly (tab-bar click): show whatever deck
  // is already open (module state), or a friendly empty state if none has
  // been picked yet this session.
  function renderEditTab() {
    if (editDeckId) {
      renderEditDeck();
    } else {
      showEditEmptyState();
    }
  }

  function openEditDeck(deckId) {
    editDeckId = deckId;
    renderEditDeck();
  }

  function showEditEmptyState() {
    els.editNoDeckState.hidden = false;
    els.editDeckPanel.hidden = true;
    window.activeAddDeckId = null;
  }

  async function renderEditDeck() {
    if (!editDeckId) { showEditEmptyState(); return; }
    const [decks, naists, cards] = await Promise.all([getDecks(), getNaists(), getCards()]);
    const deck = decks.find(function (d) { return d.id === editDeckId; });
    if (!deck) { editDeckId = null; showEditEmptyState(); return; }

    els.editNoDeckState.hidden = true;
    els.editDeckPanel.hidden = false;
    // occlusion.js's creation-mode editor reads this global to know which
    // deck a newly-saved occlusion card should land in (no dropdown to read
    // anymore — the deck is chosen by context, same as the basic add form).
    window.activeAddDeckId = deck.id;

    renderBreadcrumb(els.editDeckBreadcrumb, naists, deck.naistId, function (naistId) {
      browseNaistId = naistId;
      switchTab('naists');
    }, deck.name);

    els.editDeckTitle.textContent = deck.name;
    const deckCards = cards.filter(function (c) { return c.deckId === deck.id; });
    const dueCount = deckCards.filter(function (c) { return isDue(c, Date.now()); }).length;
    els.editDeckCounts.textContent = dueCount + ' due · ' + deckCards.length + ' total';

    els.editDeckDeleteBtn.disabled = deck.id === DEFAULT_DECK_ID;

    renderEditDeckCardList(deckCards);
  }

  function renderEditDeckCardList(deckCards) {
    const query = els.editDeckSearch.value.trim().toLowerCase();
    let filtered = deckCards;
    if (query) {
      filtered = filtered.filter(function (c) {
        return c.front.toLowerCase().indexOf(query) !== -1 || c.back.toLowerCase().indexOf(query) !== -1;
      });
    }

    els.editDeckCardList.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = deckCards.length === 0 ? 'No carbs yet — add your first one above.' : 'No carbs match.';
      els.editDeckCardList.appendChild(empty);
      return;
    }

    filtered
      .slice()
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .forEach(function (card) {
        els.editDeckCardList.appendChild(renderCardRow(card, { onChanged: renderEditDeck }));
      });
  }

  // ---------------- shared card row (Naists search results + Edit Daeck list) ----------------

  function renderCardRow(card, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'card-row';

    const text = document.createElement('div');
    text.className = 'card-row-text';

    const line = document.createElement('div');
    line.className = 'card-row-line';

    if (opts.deckLabel) {
      const tag = document.createElement('span');
      tag.className = 'card-row-tag';
      tag.textContent = opts.deckLabel;
      line.appendChild(tag);
    }

    // Image-occlusion cards have no meaningful front/back text — show the
    // occlusion image as the thumbnail and a region count in its place.
    // v1 scope cut: no inline region re-editing here, so there's no Edit
    // button for these rows, only Delete.
    if (typeof isOcclusionCard === 'function' && isOcclusionCard(card)) {
      if (card.image) {
        const thumb = document.createElement('img');
        thumb.className = 'card-row-thumb';
        thumb.src = card.image;
        thumb.alt = '';
        line.appendChild(thumb);
      }
      const label = document.createElement('span');
      label.className = 'card-row-front';
      label.textContent = occlusionRowLabel(card);
      line.appendChild(label);
      text.appendChild(line);

      const occlusionActions = document.createElement('div');
      occlusionActions.className = 'card-row-actions';
      const occlusionDeleteBtn = buildDeleteButton(async function () {
        if (!confirm('Delete this occlusion carb?')) return;
        await deleteCard(card.id);
        if (opts.onChanged) opts.onChanged();
      });
      occlusionActions.appendChild(occlusionDeleteBtn);

      row.appendChild(text);
      row.appendChild(occlusionActions);
      return row;
    }

    [card.frontImage, card.backImage].forEach(function (src) {
      if (!src) return;
      const thumb = document.createElement('img');
      thumb.className = 'card-row-thumb';
      thumb.src = src;
      thumb.alt = '';
      line.appendChild(thumb);
    });

    const frontEl = document.createElement('span');
    frontEl.className = 'card-row-front';
    frontEl.textContent = card.front;
    const sep = document.createElement('span');
    sep.className = 'card-row-sep';
    sep.textContent = '—';
    const backEl = document.createElement('span');
    backEl.className = 'card-row-back';
    backEl.textContent = card.back;

    line.appendChild(frontEl);
    line.appendChild(sep);
    line.appendChild(backEl);
    text.appendChild(line);

    const actions = document.createElement('div');
    actions.className = 'card-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function () { enterCardEditMode(row, card, opts.onChanged); });

    const deleteBtn = buildDeleteButton(async function () {
      if (!confirm('Delete this carb?\n\n"' + truncate(card.front, 60) + '"')) return;
      await deleteCard(card.id);
      if (opts.onChanged) opts.onChanged();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    row.appendChild(text);
    row.appendChild(actions);
    return row;
  }

  // Preview + remove-image row used in inline card edit. Drop/paste live on
  // the matching textarea (`dropEl`); clicking the preview replaces the file.
  function _buildEditImageControl(currentImage, onChange, dropEl) {
    const wrap = document.createElement('div');
    wrap.className = 'image-attach';
    wrap.hidden = !currentImage;

    const preview = document.createElement('img');
    preview.className = 'image-preview';
    preview.alt = '';
    if (currentImage) preview.src = currentImage;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary-btn';
    removeBtn.textContent = 'Remove image';

    wrap.appendChild(input);
    wrap.appendChild(preview);
    wrap.appendChild(removeBtn);

    bindImageAttach(dropEl, input, preview, removeBtn, onChange);
    return wrap;
  }

  function enterCardEditMode(row, card, onChanged) {
    row.innerHTML = '';
    row.classList.add('editing');

    let frontImage = card.frontImage || null;
    let backImage = card.backImage || null;

    const frontTa = document.createElement('textarea');
    frontTa.value = card.front;
    frontTa.placeholder = 'Front';
    frontTa.title = 'Drop or paste an image';
    const frontImageCtl = _buildEditImageControl(frontImage, function (v) { frontImage = v; }, frontTa);

    const backTa = document.createElement('textarea');
    backTa.value = card.back;
    backTa.placeholder = 'Baeck';
    backTa.title = 'Drop or paste an image';
    const backImageCtl = _buildEditImageControl(backImage, function (v) { backImage = v; }, backTa);

    const actions = document.createElement('div');
    actions.className = 'card-row-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'secondary-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async function () {
      const front = frontTa.value.trim();
      const back = backTa.value.trim();
      if (!front || !back) return;
      await updateCard(card.id, { front: front, back: back, frontImage: frontImage, backImage: backImage });
      if (onChanged) onChanged();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'secondary-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { if (onChanged) onChanged(); });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    row.appendChild(frontTa);
    row.appendChild(frontImageCtl);
    row.appendChild(backTa);
    row.appendChild(backImageCtl);
    row.appendChild(actions);
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  // ---------------- stats ----------------

  async function renderStatsView() {
    const [cards, decks, log] = await Promise.all([getCards(), getDecks(), getReviewLog()]);
    const now = Date.now();

    renderStatsTiles(cards, log, now);

    const activity = computeReviewsPerDay(log, 14, now);
    renderStatsChart(els.statsActivityChart, activity, {
      barClass: '',
      labelFn: function (d, i, total) { return statsDayLabel(d.date, i === total - 1); }
    });

    const forecast = computeDueForecast(cards, 7, now);
    renderStatsChart(els.statsForecastChart, forecast, {
      barClass: 'due-bar',
      labelFn: function (d, i) { return statsDayLabel(d.date, i === 0); }
    });

    renderStatsDeckBreakdown(computeDeckBreakdown(log, cards, decks, now, 30));
  }

  function statsDayLabel(dateStr, isToday) {
    if (isToday) return 'Today';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function renderStatsTiles(cards, log, now) {
    const totalReviews = log.length;
    const retention30 = computeRetention(log, { sinceTs: now - 30 * 24 * 60 * 60 * 1000 });
    const streak = computeStreak(log, now);
    const studiedToday = computeReviewsPerDay(log, 1, now)[0].count;
    const dueNow = cards.filter(function (c) { return isDue(c, now); }).length;

    const tiles = [
      { label: 'Total reviewbs', value: totalReviews },
      { label: 'Retaintion (30d)', value: retention30.total > 0 ? Math.round(retention30.retentionRate * 100) + '%' : '—' },
      { label: 'Day streagb', value: streak },
      { label: 'Stodied today', value: studiedToday },
      { label: 'Carbs due nowb', value: dueNow },
      { label: 'Total carbs', value: cards.length }
    ];

    els.statsTiles.innerHTML = '';
    tiles.forEach(function (t) {
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      const val = document.createElement('div');
      val.className = 'stat-tile-value';
      val.textContent = t.value;
      const label = document.createElement('div');
      label.className = 'stat-tile-label';
      label.textContent = t.label;
      tile.appendChild(val);
      tile.appendChild(label);
      els.statsTiles.appendChild(tile);
    });
  }

  function renderStatsChart(container, data, opts) {
    container.innerHTML = '';
    if (!data.length) return;
    const max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.count; })));

    data.forEach(function (d, i) {
      const col = document.createElement('div');
      col.className = 'stats-bar-col';

      const countEl = document.createElement('div');
      countEl.className = 'stats-bar-count';
      countEl.textContent = d.count;

      const track = document.createElement('div');
      track.className = 'stats-bar-track';
      const bar = document.createElement('div');
      bar.className = 'stats-bar' + (opts.barClass ? ' ' + opts.barClass : '');
      const pct = Math.max(2, Math.round((d.count / max) * 100));
      bar.style.height = pct + '%';
      track.appendChild(bar);

      const label = document.createElement('div');
      label.className = 'stats-bar-label';
      label.textContent = opts.labelFn(d, i, data.length);

      col.appendChild(countEl);
      col.appendChild(track);
      col.appendChild(label);
      container.appendChild(col);
    });
  }

  function renderStatsDeckBreakdown(breakdown) {
    els.statsDeckBreakdown.innerHTML = '';
    if (!breakdown.length) {
      const empty = document.createElement('div');
      empty.className = 'stats-empty';
      empty.textContent = 'No daecks yet.';
      els.statsDeckBreakdown.appendChild(empty);
      return;
    }

    breakdown.forEach(function (d) {
      const row = document.createElement('div');
      row.className = 'stats-deck-row';

      const name = document.createElement('span');
      name.className = 'stats-deck-row-name';
      name.textContent = d.deckName;

      const metrics = document.createElement('span');
      metrics.className = 'stats-deck-row-metrics';

      function metric(label, value) {
        const span = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = value + ' ';
        span.appendChild(strong);
        span.appendChild(document.createTextNode(label));
        metrics.appendChild(span);
      }
      metric('total', d.totalCards);
      metric('due', d.dueNow);
      metric('reviewbs (30d)', d.reviews);
      metric('retaintion (30d)', d.retentionRate !== null ? Math.round(d.retentionRate * 100) + '%' : '—');

      row.appendChild(name);
      row.appendChild(metrics);
      els.statsDeckBreakdown.appendChild(row);
    });
  }

  // ---------------- keyboard shortcuts help ----------------

  function bindShortcutsOverlay() {
    els.shortcutsBtn.addEventListener('click', function () {
      els.shortcutsOverlay.hidden = !els.shortcutsOverlay.hidden;
    });
    els.shortcutsCloseBtn.addEventListener('click', function () {
      els.shortcutsOverlay.hidden = true;
    });
  }

  // ---------------- keyboard shortcuts ----------------

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      // '?' toggles the shortcuts help panel from almost anywhere.
      if (!typing && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        if (els.pigOverlay && !els.pigOverlay.hidden) return;
        e.preventDefault();
        els.shortcutsOverlay.hidden = !els.shortcutsOverlay.hidden;
        return;
      }
      if (e.key === 'Escape' && els.shortcutsOverlay && !els.shortcutsOverlay.hidden) {
        els.shortcutsOverlay.hidden = true;
        return;
      }

      if (typing) return;
      if (!els.shortcutsOverlay.hidden) return;
      if (!els.pigOverlay.hidden) return;
      if (!els.views.study.classList.contains('active')) return;
      if (els.studySession.hidden) return;

      if (e.code === 'Space' && !els.showAnswerBtn.hidden) {
        e.preventDefault();
        revealAnswer();
        return;
      }

      if (e.key === 'Tab' && !els.showAnswerBtn.hidden) {
        e.preventDefault();
        revealAnswer();
        return;
      }

      if (!els.ratingButtons.hidden) {
        const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
        if (map[e.key]) {
          rateCard(map[e.key]);
          return;
        }
      }

      if ((e.key === 'u' || e.key === 'U') && !els.undoRatingBtn.hidden) {
        e.preventDefault();
        undoLastRating();
      }
    });
  }
})();
