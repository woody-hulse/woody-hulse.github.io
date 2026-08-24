// app.js — ties storage.js, srs.js, stats.js, anki-import.js, and pigs.js
// together: tabs, the unified Nests browser, the study session flow, the
// Edit Deck card CRUD UI, stats, and the store/economy.

(function () {
  const ANIMAL_SHOP = window.StudyEconomy && window.StudyEconomy.species ? window.StudyEconomy.species() : [
    { id: 'chickens', base: 15 },
    { id: 'sheep', base: 100 },
    { id: 'ducks', base: 1100 },
    { id: 'retrievers', base: 12000 },
    { id: 'pigs', base: 130000 },
    { id: 'fish', base: 1400000 },
    { id: 'bison', base: 8500000 },
    { id: 'horse', base: 45000000 },
    { id: 'squid', base: 210000000 },
    { id: 'giraffe', base: 980000000 },
    { id: 'cat', base: 4200000000 },
    { id: 'lizard', base: 18000000000 }
  ];
  const PRICE_GROWTH = window.StudyEconomy && window.StudyEconomy.priceGrowth ? window.StudyEconomy.priceGrowth : 1.22;
  const ENCOURAGEMENT_INTERVAL = 10;
  const PET_HAPPINESS_GAIN = 12;
  const COOP_PASSIVE_CAP_HOURS = 8;

  let currentUsername = null;
  let economy = { bucks: 0, animals: { chickens: 0, sheep: 0, ducks: 0, retrievers: 0, pigs: 0, fish: 0, bison: 0, horse: 0, squid: 0, giraffe: 0, cat: 0, lizard: 0 }, unlockedAnimals: [], unlockedBackgrounds: [], animalPlacements: {}, animalNames: {}, animalHappiness: {}, rewardLedger: { paid: {} }, pens: [], troughs: [], coops: [], flowers: [], passiveIncome: { version: 1, lastAccruedAt: 0, carry: 0, totalEarned: 0, lastClaimedAt: 0, lastClaimedAmount: 0 } };
  let addFormTags = [];
  let occlusionFormTags = [];
  let knownTags = [];
  let passiveIncomeTimer = null;
  let passiveIncomeBusy = false;
  let passiveIncomeWasVisible = !document.hidden;
  let passiveIncomeLastPersistAt = 0;
  let coopEggLastPersistAt = 0;
  let storeBuyQuantity = 1;
  let ratingBusy = false;
  let deferredFlushTimer = null;
  let layoutViewportKey = '';
  let layoutSyncTimer = null;

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
    activeTag: null,
    // Single-level "undo last rating" support. Set right after a rating is
    // applied; cleared on undo or when a new rating overwrites it. Not
    // cleared by simply advancing to the next card, so undo still works
    // after you've moved on and noticed the mistake.
    lastAction: null,
    cardsSinceLastPig: 0
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    applyI18n(document);
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

      if (isCloudAuthConfigured()) {
        await setupCloudAuthScreen();
      } else {
        // Cloud auth not configured (js/firebase-config.js is still the
        // REPLACE_ME placeholder) — exactly today's local-only flow.
        currentUsername = await getUsername();
        if (currentUsername) {
          await enterApp();
        } else {
          syncAuthFormsForCloudState(false);
          if (els.authScreen) els.authScreen.hidden = false;
        }
      }
    } catch (err) {
      console.error('init failed; showing an auth screen as a fallback.', err);
      syncAuthFormsForCloudState(isCloudAuthConfigured());
      if (els.authScreen) els.authScreen.hidden = false;
    } finally {
      if (els.authScreen && !els.authScreen.hidden) syncAuthFormsForCloudState(isCloudAuthConfigured());
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

  function isCloudAuthConfigured() {
    return !!(window.CloudAuth && window.CloudAuth.isConfigured && typeof window.CloudAuth.getInitialUser === 'function');
  }

  function syncAuthFormsForCloudState(configured) {
    configured = !!configured;
    if (els.authLocalForm) els.authLocalForm.hidden = configured;
    if (els.authCloudForm) els.authCloudForm.hidden = !configured;
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
    els.appTitle = document.getElementById('app-title');
    els.bucksValue = document.getElementById('bucks-value');
    els.bucksDisplay = document.getElementById('bucks-display');
    els.bucksLabel = document.getElementById('bucks-label');
    els.tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
    els.views = {
      naists: document.getElementById('view-naists'),
      study: document.getElementById('view-study'),
      edit: document.getElementById('view-edit'),
      stats: document.getElementById('view-stats'),
      farm: document.getElementById('view-farm'),
      store: document.getElementById('view-store')
    };
    els.focusBtn = document.getElementById('focus-btn');
    els.settingsBtn = document.getElementById('settings-btn');

    // ---- text-prompt overlay (custom window.prompt replacement) ----
    els.textPromptOverlay = document.getElementById('text-prompt-overlay');
    els.textPromptTitle = document.getElementById('text-prompt-title');
    els.textPromptInput = document.getElementById('text-prompt-input');
    els.textPromptCancel = document.getElementById('text-prompt-cancel');
    els.textPromptConfirm = document.getElementById('text-prompt-confirm');
    els.pixelModalOverlay = document.getElementById('pixel-modal-overlay');
    els.pixelModalTitle = document.getElementById('pixel-modal-title');
    els.pixelModalMessage = document.getElementById('pixel-modal-message');
    els.pixelModalCancel = document.getElementById('pixel-modal-cancel');
    els.pixelModalConfirm = document.getElementById('pixel-modal-confirm');

    // ---- settings overlay ----
    els.settingsOverlay = document.getElementById('settings-overlay');
    els.settingsNicknameValue = document.getElementById('settings-nickname-value');
    els.settingsNicknameBtn = document.getElementById('settings-nickname-btn');
    els.settingsAccentSwatches = document.getElementById('settings-accent-swatches');
    els.settingsSignoutSection = document.getElementById('settings-signout-section');
    els.settingsSignoutBtn = document.getElementById('settings-signout-btn');
    els.settingsCloseBtn = document.getElementById('settings-close-btn');
    els.spriteLabOpenBtn = document.getElementById('sprite-lab-open-btn');
    els.spriteLabOverlay = document.getElementById('sprite-lab-overlay');
    els.spriteLabSpecies = document.getElementById('sprite-lab-species');
    els.spriteLabState = document.getElementById('sprite-lab-state');
    els.spriteLabFrame = document.getElementById('sprite-lab-frame');
    els.spriteLabPlayBtn = document.getElementById('sprite-lab-play-btn');
    els.spriteLabPreview = document.getElementById('sprite-lab-preview');
    els.spriteLabGrid = document.getElementById('sprite-lab-grid');
    els.spriteLabPalette = document.getElementById('sprite-lab-palette');
    els.spriteLabOutput = document.getElementById('sprite-lab-output');
    els.spriteLabResetBtn = document.getElementById('sprite-lab-reset-btn');
    els.spriteLabCloseBtn = document.getElementById('sprite-lab-close-btn');
    els.settingsThemeRow = document.getElementById('settings-theme-row');
    els.settingsGrassRow = document.getElementById('settings-grass-row');
    els.settingsVocabToggle = document.getElementById('settings-vocab-toggle');
    els.settingsFocusModeRow = document.getElementById('settings-focus-mode-row');
    els.settingsEncouragementToggle = document.getElementById('settings-encouragement-toggle');
    els.addCardTags = document.getElementById('add-card-tags');
    els.occlusionCardTags = document.getElementById('occlusion-card-tags');
    els.storeAnimalList = document.getElementById('store-animal-list');
    els.storeFarmList = document.getElementById('store-farm-list');
    els.storeAnimalsLabel = document.getElementById('store-animals-label');
    els.storeFarmLabel = document.getElementById('store-farm-label');
    els.storeQuantityToggle = document.getElementById('store-quantity-toggle');

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
    els.sessionProgressChip = document.getElementById('session-progress-chip');
    els.sessionProgressName = document.getElementById('session-progress-name');
    els.sessionProgressCounts = document.getElementById('session-progress-counts');
    els.cramModeBadge = document.getElementById('cram-mode-badge');
    els.undoRatingBtn = document.getElementById('undo-rating-btn');
    els.emptyState = document.getElementById('empty-state');
    els.emptyStateText = els.emptyState ? els.emptyState.querySelector('p') : null;
    els.emptyBackBtn = document.getElementById('empty-back-btn');
    els.studyCard = document.getElementById('study-card');
    els.cardFront = document.getElementById('card-front');
    els.cardFrontText = document.getElementById('card-front-text');
    els.cardFrontImage = document.getElementById('card-front-image');
    els.cardOcclusionWrap = document.getElementById('card-occlusion-wrap');
    els.cardBack = document.getElementById('card-back');
    els.cardBackText = document.getElementById('card-back-text');
    els.cardBackImage = document.getElementById('card-back-image');
    els.cardTags = document.getElementById('card-tags');
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

    els.shortcutsBtn = document.getElementById('shortcuts-btn');
    els.shortcutsOverlay = document.getElementById('shortcuts-overlay');
    els.shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');

    els.pigOverlay = document.getElementById('pig-encouragement-overlay');
    els.pigOverlayImg = document.getElementById('pig-encouragement-img');
    els.pigOverlayText = document.getElementById('pig-encouragement-text');
    els.pigOverlayContinue = document.getElementById('pig-encouragement-continue');

    els.loadingOverlay = document.getElementById('loading-overlay');
    els.spinnerImg = document.getElementById('spinner-img');
  }

  // ---------------- loading overlay ----------------

  let _loadingDepth = 0;
  function showLoading() {
    _loadingDepth++;
    if (els.loadingOverlay) els.loadingOverlay.hidden = false;
  }
  function hideLoading() {
    _loadingDepth = Math.max(0, _loadingDepth - 1);
    if (_loadingDepth === 0 && els.loadingOverlay) els.loadingOverlay.hidden = true;
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
  // within `ms`, we stop waiting, cancel that activation, and keep this session
  // on local storage. That avoids a late stale cloud cache replacing local
  // progress after the user has already started studying.
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
        if (window.CloudStore.cancelPendingActivation) window.CloudStore.cancelPendingActivation(uid);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function flushStorageNow(reason) {
    try {
      if (typeof flushStudyStorage === 'function') {
        await flushStudyStorage();
      } else if (window.StudyStorage && typeof window.StudyStorage.flush === 'function') {
        await window.StudyStorage.flush();
      }
    } catch (e) {
      console.error('Storage flush failed' + (reason ? ' after ' + reason : '') + '.', e);
    }
  }

  function scheduleStorageFlush(reason, delay) {
    if (deferredFlushTimer) clearTimeout(deferredFlushTimer);
    deferredFlushTimer = setTimeout(function () {
      deferredFlushTimer = null;
      flushStorageNow(reason || 'deferred save');
    }, delay == null ? 1400 : delay);
  }

  async function saveSettingsAndFlush(settings) {
    await saveSettings(settings);
    await flushStorageNow('settings change');
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
    if (els.app && !els.app.hidden) {
      refreshGreeting();
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
        if (!els.app || els.app.hidden) await enterApp();
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
    if (!isCloudAuthConfigured()) {
      showAuthScreen();
      return;
    }
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
      syncAuthFormsForCloudState(isCloudAuthConfigured());
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
    if (els.app) els.app.hidden = true;
    syncAuthFormsForCloudState(isCloudAuthConfigured());
    if (els.authScreen) els.authScreen.hidden = false;
  }

  async function enterApp() {
    if (els.authScreen) els.authScreen.hidden = true;
    if (els.app) els.app.hidden = false;

    economy = await getEconomy();
    const settings = await getSettings();
    setFunSpellings(!!settings.funSpellings);
    applyI18n(document);
    await applyAppearanceFromSettings();
    applyFocusMode(settings.focusMode);
    applySellMode(false);

    refreshGreeting();
    updateBucksDisplay();

    bindTabs();
    bindLayoutMode();
    bindNaistsView();
    bindNewDeckOverlay();
    bindStudyTab();
    bindEditView();
    bindStoreView();
    bindShortcutsOverlay();
    bindPigOverlay();
    bindSettingsOverlay();
    bindSpriteLab();
    bindTextPrompt();
    bindPixelModal();
    bindAnimalSell();
    bindAnimalNames();
    bindFarmObjectInteractions();
    bindPassiveIncome();
    setAnimalPlacementHooks(
      function () { return economy.animalPlacements || {}; },
      function (next) {
        economy.animalPlacements = next;
        persistEconomy();
      }
    );
    setPenTroughHooks(
      function () { return { pens: economy.pens || [], troughs: economy.troughs || [], coops: economy.coops || [], flowers: economy.flowers || [] }; },
      function (pens) { economy.pens = pens; persistEconomy(); },
      function (troughs) { economy.troughs = troughs; persistEconomy(); },
      function (flowers) { economy.flowers = flowers; persistEconomy(); },
      function (coops) { economy.coops = coops; persistEconomy(); }
    );
    bindAnimalFieldDrag();

    await withLoading(async function () {
      await refreshKnownTags();
      await initScatteredAnimals(els.pigField, economy.animals);
      syncAnimalNameAttributes();
      if (typeof renderPensAndTroughs === 'function') renderPensAndTroughs(els.pigField);
      await accruePassiveIncome({ reason: 'enter', renderStore: false });
      await accrueCoopEggs({ reason: 'enter', renderStore: false });
      if (typeof syncFarmGap === 'function') syncFarmGap();
      await renderNaistsBrowser();
    });
  }

  function refreshGreeting() {
    const name = currentUsername && currentUsername.trim() ? currentUsername.trim() : '';
    if (els.userGreeting) els.userGreeting.textContent = name ? t('hi', { name: name }) : '';
  }

  function displayDeckName(deck) {
    if (!deck) return '';
    if (deck.id === DEFAULT_DECK_ID && (deck.name === 'General' || deck.name === 'Gaineral')) {
      return t('defaultDeck');
    }
    return deck.name;
  }

  function formatMoney(n) {
    const abs = Math.abs(Number(n) || 0);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1000) return sign + (abs / 1e3).toFixed(2) + 'K';
    return sign + abs.toFixed(2);
  }

  function formatCurrency(n) {
    return '$' + formatMoney(n);
  }

  function buyPrice(speciesId, ownedCount) {
    if (window.StudyEconomy && window.StudyEconomy.buyPrice) {
      return window.StudyEconomy.buyPrice(speciesId, ownedCount);
    }
    const spec = ANIMAL_SHOP.find(function (s) { return s.id === speciesId; });
    if (!spec) return 0;
    return Math.round(spec.base * Math.pow(PRICE_GROWTH, ownedCount || 0) * 100) / 100;
  }

  function sellPrice(speciesId, ownedCount) {
    if (window.StudyEconomy && window.StudyEconomy.sellPrice) {
      return window.StudyEconomy.sellPrice(speciesId, ownedCount);
    }
    return Math.round(buyPrice(speciesId, ownedCount) * 0.5 * 100) / 100;
  }

  function flowerShop() {
    return window.StudyFlowers && window.StudyFlowers.all ? window.StudyFlowers.all() : [];
  }

  function flowerSpec(typeId) {
    if (window.StudyFlowers && window.StudyFlowers.has && !window.StudyFlowers.has(typeId)) return null;
    if (window.StudyFlowers && window.StudyFlowers.get) return window.StudyFlowers.get(typeId);
    return flowerShop().find(function (spec) { return spec.id === typeId; }) || null;
  }

  function flowerOwnedCount(typeId) {
    return (economy.flowers || []).filter(function (fl) { return fl.type === typeId; }).length;
  }

  function flowerPrice(typeId, ownedCount) {
    const spec = flowerSpec(typeId);
    if (!spec) return 0;
    const growth = window.StudyEconomy && window.StudyEconomy.flowerPriceGrowth
      ? window.StudyEconomy.flowerPriceGrowth
      : (window.StudyFlowers && window.StudyFlowers.priceGrowth ? window.StudyFlowers.priceGrowth : 1.18);
    return Math.round(spec.base * Math.pow(growth, ownedCount || 0) * 100) / 100;
  }

  function flowerBonusMultiplier(flowers) {
    if (window.StudyFlowers && window.StudyFlowers.multiplier) return window.StudyFlowers.multiplier(flowers || []);
    return 1;
  }

  function flowerBonusPercent(flowers) {
    return Math.round((flowerBonusMultiplier(flowers || []) - 1) * 100);
  }

  function formatBonus(n) {
    const pct = Math.round((Number(n) || 0) * 100);
    return (pct > 0 ? '+' : '') + pct + '%';
  }

  function bucksPerRating(animals) {
    return window.StudyEconomy && window.StudyEconomy.cardReward
      ? window.StudyEconomy.cardReward(animals, farmBoostMultiplier(), economy.animalHappiness)
      : Math.round(Math.max(1, 1) * farmBoostMultiplier() * 100) / 100;
  }

  function farmBoostMultiplier() {
    const troughBoost = (typeof computeTroughBoost === 'function')
      ? computeTroughBoost(els.pigField, economy.pens, economy.troughs)
      : 1;
    const flowerBoost = flowerBonusMultiplier(economy.flowers);
    if (window.StudyEconomy && window.StudyEconomy.farmMultiplier) {
      return window.StudyEconomy.farmMultiplier(troughBoost, flowerBoost);
    }
    return Math.round(troughBoost * flowerBoost * 100) / 100;
  }

  function passiveIncomeState() {
    if (!economy.passiveIncome || typeof economy.passiveIncome !== 'object' || Array.isArray(economy.passiveIncome)) {
      economy.passiveIncome = { version: 1, lastAccruedAt: 0, carry: 0, totalEarned: 0, lastClaimedAt: 0, lastClaimedAmount: 0 };
    }
    return economy.passiveIncome;
  }

  function passiveBucksPerHour() {
    if (window.StudyEconomy && window.StudyEconomy.passiveHourly) {
      return window.StudyEconomy.passiveHourly(economy.animals, farmBoostMultiplier(), economy.animalHappiness);
    }
    const farm = farmBoostMultiplier();
    return Math.round(Math.max(0, bucksPerRating(economy.animals) - farm) * 4 * 100) / 100;
  }

  function passiveAccrualForElapsed(elapsedMs, active) {
    const state = passiveIncomeState();
    if (window.StudyEconomy && window.StudyEconomy.passiveAccrual) {
      return window.StudyEconomy.passiveAccrual(economy.animals, farmBoostMultiplier(), elapsedMs, state.carry, active, economy.animalHappiness);
    }
    const hourly = passiveBucksPerHour();
    const elapsedHours = Math.max(0, (Number(elapsedMs) || 0) / 3600000);
    const cappedHours = Math.min(elapsedHours, 8);
    const effectiveHours = cappedHours <= 2 ? cappedHours : 2 + ((cappedHours - 2) * 0.5);
    const raw = (hourly * effectiveHours * (active ? 1 : 0.35)) + Math.max(0, Number(state.carry) || 0);
    const amount = Math.floor((raw + 1e-9) * 100) / 100;
    return {
      amount: Math.round(amount * 100) / 100,
      carry: Math.max(0, raw - amount),
      creditedSeconds: Math.floor(effectiveHours * 3600),
      capped: elapsedHours > cappedHours
    };
  }

  async function accruePassiveIncome(opts) {
    opts = opts || {};
    if (passiveIncomeBusy || !economy) return { amount: 0, creditedSeconds: 0 };
    passiveIncomeBusy = true;
    try {
      const now = Date.now();
      const state = passiveIncomeState();
      const last = Number(state.lastAccruedAt) || 0;
      if (!last || last > now + 60000) {
        state.lastAccruedAt = now;
        state.lastClaimedAt = 0;
        state.lastClaimedAmount = 0;
        await persistEconomy();
        return { amount: 0, creditedSeconds: 0, initialized: true };
      }

      const elapsed = now - last;
      if (elapsed < 1000) return { amount: 0, creditedSeconds: 0 };
      const active = opts.active !== undefined ? !!opts.active : (!document.hidden && opts.reason !== 'enter');
      const accrual = passiveAccrualForElapsed(elapsed, active);
      state.lastAccruedAt = now;
      state.carry = Math.max(0, Number(accrual.carry) || 0);
      if (accrual.amount > 0) {
        economy.bucks = Math.round((economy.bucks + accrual.amount) * 100) / 100;
        state.totalEarned = Math.round(((state.totalEarned || 0) + accrual.amount) * 100) / 100;
        state.lastClaimedAt = now;
        state.lastClaimedAmount = accrual.amount;
        showMoneyFloat(accrual.amount, opts.source || null);
      } else {
        state.lastClaimedAt = 0;
        state.lastClaimedAmount = 0;
      }
      const shouldPersist = opts.forcePersist || opts.reason !== 'timer' || now - passiveIncomeLastPersistAt >= 15000;
      if (shouldPersist) await persistEconomy({ flush: opts.flush !== false });
      else updateBucksDisplay();
      if (opts.renderStore && activeTabName() === 'store') refreshStoreAffordances();
      return accrual;
    } finally {
      passiveIncomeBusy = false;
    }
  }

  function bindPassiveIncome() {
    if (document.documentElement.dataset.passiveIncomeBound) return;
    document.documentElement.dataset.passiveIncomeBound = '1';
    passiveIncomeWasVisible = !document.hidden;
    passiveIncomeTimer = window.setInterval(function () {
      if (!els.app || els.app.hidden || document.hidden) return;
      accruePassiveIncome({ reason: 'timer', active: true, renderStore: true, flush: false });
      accrueCoopEggs({ reason: 'timer', renderStore: true, flush: false });
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!els.app || els.app.hidden) return;
      const wasVisible = passiveIncomeWasVisible;
      passiveIncomeWasVisible = !document.hidden;
      accruePassiveIncome({
        reason: document.hidden ? 'hidden' : 'visible',
        active: wasVisible,
        renderStore: !document.hidden,
        forcePersist: true
      });
      accrueCoopEggs({ reason: document.hidden ? 'hidden' : 'visible', renderStore: false, forcePersist: true });
    });
    window.addEventListener('pagehide', function () {
      if (!els.app || els.app.hidden) return;
      accruePassiveIncome({ reason: 'pagehide', active: passiveIncomeWasVisible, renderStore: false, forcePersist: true });
      accrueCoopEggs({ reason: 'pagehide', renderStore: false, forcePersist: true });
    });
    window.addEventListener('beforeunload', function () {
      if (!els.app || els.app.hidden) return;
      accruePassiveIncome({ reason: 'beforeunload', active: passiveIncomeWasVisible, renderStore: false, forcePersist: true });
      accrueCoopEggs({ reason: 'beforeunload', renderStore: false, forcePersist: true });
      if (passiveIncomeTimer) window.clearInterval(passiveIncomeTimer);
      passiveIncomeTimer = null;
    });
  }

  function boostPercent(multiplier) {
    if (window.StudyEconomy && window.StudyEconomy.percentFromMultiplier) {
      return window.StudyEconomy.percentFromMultiplier(multiplier);
    }
    return Math.round((Math.max(1, Number(multiplier) || 1) - 1) * 100);
  }

  function penPriceForSize(widthVw, heightVh) {
    // price = max(rate*2, rate*4 * (widthVw*heightVh)/(8*14)); sell refunds 50% of paid
    const rate = bucksPerRating(economy.animals);
    const area = Math.max(0, widthVw * heightVh);
    const ref = 8 * 14;
    return Math.round(Math.max(rate * 2, rate * 4 * (area / ref)) * 100) / 100;
  }

  function troughBuyPrice() {
    return Math.round(bucksPerRating(economy.animals) * 5 * 100) / 100;
  }

  function coopBuyPrice() {
    return Math.round(Math.max(25, bucksPerRating(economy.animals) * 12) * 100) / 100;
  }

  function coopHourlyValue(coop) {
    if (typeof computeCoopHourlyValue === 'function') {
      return computeCoopHourlyValue(els.pigField, coop, economy.pens, economy.troughs);
    }
    return 0;
  }

  function coopEggValue() {
    return (economy.coops || []).reduce(function (total, coop) {
      return total + (Number(coop.eggValue) || 0);
    }, 0);
  }

  function coopEggDisplayTotal() {
    return (economy.coops || []).reduce(function (total, coop) {
      return total + coopEggDisplayCount(coop);
    }, 0);
  }

  function coopEggDisplayCount(coop) {
    const saved = Number(coop && coop.eggCount);
    if (Number.isFinite(saved) && saved > 0) return Math.floor(saved);
    const value = Number(coop && coop.eggValue) || 0;
    return value > 0 ? Math.max(1, Math.round(value)) : 0;
  }

  function eggCountLabel(count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    return count === 1 ? t('oneEgg') : t('nEggs', { n: count });
  }

  function coopHourlyTotal() {
    return (economy.coops || []).reduce(function (total, coop) {
      return total + coopHourlyValue(coop);
    }, 0);
  }

  async function accrueCoopEggs(opts) {
    opts = opts || {};
    if (!economy || !Array.isArray(economy.coops) || !economy.coops.length) return { amount: 0 };
    const now = Date.now();
    let amount = 0;
    let changed = false;
    economy.coops = economy.coops.map(function (coop) {
      const next = Object.assign({}, coop);
      const last = Number(next.lastEggAt) || 0;
      if (!last || last > now + 60000) {
        next.lastEggAt = now;
        changed = true;
        return next;
      }
      const elapsedMs = Math.max(0, now - last);
      if (elapsedMs < 1000) return next;
      const hours = Math.min(elapsedMs / 3600000, COOP_PASSIVE_CAP_HOURS);
      const raw = coopHourlyValue(next) * hours + Math.max(0, Number(next.eggCarry) || 0);
      const earned = Math.floor((raw + 1e-9) * 100) / 100;
      next.eggCarry = Math.max(0, raw - earned);
      next.lastEggAt = now;
      if (earned > 0) {
        next.eggValue = Math.round(((next.eggValue || 0) + earned) * 100) / 100;
        next.totalEggValue = Math.round(((next.totalEggValue || 0) + earned) * 100) / 100;
        amount += earned;
      }
      changed = true;
      return next;
    });
    if (!changed) return { amount: 0 };
    const shouldPersist = opts.forcePersist || opts.reason === 'enter' || opts.reason === 'before mutation' || now - coopEggLastPersistAt >= 15000;
    if (shouldPersist) {
      coopEggLastPersistAt = now;
      await persistEconomy({ flush: opts.forcePersist && opts.flush !== false });
    }
    if (opts.renderStore && activeTabName() === 'store') refreshStoreAffordances();
    return { amount: Math.round(amount * 100) / 100 };
  }

  function updateBucksDisplay() {
    if (els.bucksValue) els.bucksValue.textContent = formatCurrency(economy.bucks);
  }

  function moneyFloatOrigin(source) {
    if (source && Number.isFinite(source.clientX) && Number.isFinite(source.clientY)) {
      return { x: source.clientX, y: source.clientY };
    }
    if (source && source.getBoundingClientRect) {
      const sr = source.getBoundingClientRect();
      return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    }
    const el = els.bucksValue || document.getElementById('bucks-display');
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      return { x: Math.min(window.innerWidth - 28, r.right + 32), y: r.top + r.height / 2 };
    }
    return { x: Math.max(20, window.innerWidth - 80), y: 72 };
  }

  function showMoneyFloat(amount, source) {
    amount = Number(amount) || 0;
    if (amount <= 0 || document.documentElement.classList.contains('focus-mode')) return;
    const origin = moneyFloatOrigin(source);
    const el = document.createElement('div');
    el.className = 'money-float';
    el.textContent = '+' + formatCurrency(amount);
    el.style.left = origin.x + 'px';
    el.style.top = origin.y + 'px';
    document.body.appendChild(el);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1200);
  }

  function rewardLedger() {
    if (!economy.rewardLedger || typeof economy.rewardLedger !== 'object' || Array.isArray(economy.rewardLedger)) {
      economy.rewardLedger = { paid: {} };
    }
    if (!economy.rewardLedger.paid || typeof economy.rewardLedger.paid !== 'object' || Array.isArray(economy.rewardLedger.paid)) {
      economy.rewardLedger.paid = {};
    }
    return economy.rewardLedger;
  }

  function rewardKeyForCard(card) {
    if (!card || !card.id) return '';
    return [
      'card',
      card.id,
      Number(card.dueDate) || 0,
      Number(card.lastReviewed) || 0,
      Number(card.repetition) || 0
    ].join(':');
  }

  async function grantRatingReward(card, rating, logEntry) {
    if (!card || rating === 'again') return { amount: 0, paid: false, key: '' };
    const key = rewardKeyForCard(card);
    if (!key) return { amount: 0, paid: false, key: '' };
    const ledger = rewardLedger();
    if (ledger.paid[key]) {
      if (logEntry) {
        logEntry.rewardKey = key;
        logEntry.rewardAmount = 0;
      }
      return { amount: 0, paid: false, key: key };
    }
    await accruePassiveIncome({ reason: 'before rating reward', renderStore: false, flush: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const earned = bucksPerRating(economy.animals);
    economy.bucks = Math.round((economy.bucks + earned) * 100) / 100;
    showMoneyFloat(earned, null);
    ledger.paid[key] = true;
    if (logEntry) {
      logEntry.rewardKey = key;
      logEntry.rewardAmount = earned;
    }
    await persistEconomy({ flush: false });
    return { amount: earned, paid: true, key: key };
  }

  function normalizeFocusMode(value) {
    if (value === true) return 'sit';
    if (value === 'sit' || value === 'sleep') return value;
    return false;
  }

  function nextFocusMode(value) {
    const mode = normalizeFocusMode(value);
    if (!mode) return 'sit';
    return mode === 'sit' ? 'sleep' : false;
  }

  function isSleepFocusActive() {
    return document.documentElement.classList.contains('focus-mode-sleep') ||
      document.documentElement.dataset.focusMode === 'sleep';
  }

  function syncSleepLockout(mode) {
    const sleep = normalizeFocusMode(mode) === 'sleep';
    const storeBtn = (els.tabBtns || []).find(function (btn) { return btn.dataset.tab === 'store'; });
    if (storeBtn) {
      storeBtn.disabled = sleep;
      storeBtn.classList.toggle('sleep-locked', sleep);
      storeBtn.setAttribute('aria-disabled', sleep ? 'true' : 'false');
      storeBtn.setAttribute('title', sleep ? t('storeSleepLocked') : t('store'));
      storeBtn.setAttribute('aria-label', sleep ? t('storeSleepLocked') : t('store'));
    }
    if (els.views && els.views.store) els.views.store.classList.toggle('sleep-locked', sleep);
    if (els.pigField) els.pigField.classList.toggle('sleep-locked', sleep);
  }

  function syncFocusButton(mode) {
    if (!els.focusBtn) return;
    mode = normalizeFocusMode(mode);
    const iconName = mode === 'sleep' ? 'moon' : (mode === 'sit' ? 'sit' : 'focus');
    const label = mode === 'sleep' ? t('focusSleep') : (mode === 'sit' ? t('focusSit') : t('focus'));
    els.focusBtn.dataset.focusState = mode || 'off';
    els.focusBtn.classList.toggle('active', !!mode);
    els.focusBtn.setAttribute('aria-pressed', mode ? 'true' : 'false');
    els.focusBtn.setAttribute('title', label);
    els.focusBtn.setAttribute('aria-label', label);
    const icon = els.focusBtn.querySelector('[data-pixel-icon], .pixel-icon');
    if (icon) {
      icon.setAttribute('data-pixel-icon', iconName);
      if (window.PixelSprites && window.PixelSprites.paintIcon) window.PixelSprites.paintIcon(icon, iconName);
    }
  }

  function clearSleepFocusArtifacts() {
    const root = document.documentElement;
    root.classList.remove('focus-mode-sleep');
    if (document.body) document.body.classList.remove('focus-mode-sleep');
    if (!els.pigField) return;
    els.pigField.classList.remove('focus-mode-sleep');
    Array.prototype.forEach.call(els.pigField.querySelectorAll('.animal-scatter, .pen-fence, .trough-object, .coop-object, .flower-object'), function (el) {
      el.style.removeProperty('filter');
      el.style.removeProperty('opacity');
      el.style.removeProperty('mix-blend-mode');
    });
  }

  function applyFocusMode(mode) {
    mode = normalizeFocusMode(mode);
    const on = !!mode;
    const root = document.documentElement;
    root.classList.remove('focus-mode-sit', 'focus-mode-sleep');
    delete root.dataset.focusMode;
    if (document.body) document.body.classList.remove('focus-mode-sit', 'focus-mode-sleep');
    if (els.pigField) els.pigField.classList.remove('focus-mode-sit', 'focus-mode-sleep');
    root.classList.toggle('focus-mode', on);
    if (mode) {
      root.dataset.focusMode = mode;
      root.classList.add('focus-mode-' + mode);
      if (document.body) document.body.classList.add('focus-mode-' + mode);
      if (els.pigField) els.pigField.classList.add('focus-mode-' + mode);
    }
    if (mode !== 'sleep') clearSleepFocusArtifacts();
    if (els.pigField) els.pigField.classList.remove('focus-hidden');
    if (els.bucksDisplay) els.bucksDisplay.hidden = on;
    syncSleepLockout(mode);
    if (mode === 'sleep') hideAnimalNameTip();
    if (mode === 'sleep') {
      const active = (els.tabBtns || []).find(function (btn) { return btn.classList.contains('active'); });
      if (active && active.dataset.tab === 'store') switchTab('farm');
    }
    syncFocusButton(mode);
    if (els.settingsFocusModeRow) {
      Array.prototype.forEach.call(els.settingsFocusModeRow.querySelectorAll('[data-focus-choice]'), function (btn) {
        const active = btn.getAttribute('data-focus-choice') === (mode || 'off');
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    if (typeof setFarmFocusMode === 'function') setFarmFocusMode(mode || 'roam');
    if (on && typeof cancelPenPlacement === 'function') cancelPenPlacement();
    if (on && typeof cancelStorePlacement === 'function') cancelStorePlacement();
    if (on && els.pigOverlay && !els.pigOverlay.hidden) dismissPigEncouragement();
  }

  async function setFocusMode(mode) {
    const s = await getSettings();
    s.focusMode = normalizeFocusMode(mode);
    await saveSettingsAndFlush(s);
    applyFocusMode(s.focusMode);
  }

  function applySellMode(on) {
    if (!els.pigField) return;
    els.pigField.classList.toggle('sell-mode', !!on);
    if (on) hideAnimalNameTip();
  }

  function isCompactLayout() {
    return typeof window.isCompactLayout === 'function'
      ? window.isCompactLayout()
      : !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
  }

  function sellModeForTab(tab) {
    return tab === 'store' && !isCompactLayout() && !isSleepFocusActive();
  }

  function currentLayoutViewportKey() {
    const root = document.documentElement;
    const w = root.clientWidth || window.innerWidth || 1;
    const h = root.clientHeight || window.innerHeight || 1;
    return w + 'x' + h;
  }

  function isPinchZoomed() {
    return !!(window.visualViewport && Math.abs((window.visualViewport.scale || 1) - 1) > 0.02);
  }

  function syncLayoutMode(opts) {
    opts = opts || {};
    const key = currentLayoutViewportKey();
    if (!opts.force && key === layoutViewportKey) return;
    layoutViewportKey = key;
    const compact = isCompactLayout();
    document.documentElement.classList.toggle('compact-layout', compact);
    const active = els.tabBtns && els.tabBtns.find(function (b) { return b.classList.contains('active'); });
    let tab = active ? active.dataset.tab : 'naists';
    if (!compact && tab === 'farm') {
      switchTab('naists');
      tab = 'naists';
    }
    applySellMode(sellModeForTab(tab));
    if (!sellModeForTab(tab)) hideSellTip();
    if (typeof relayoutField === 'function') relayoutField(els.pigField);
  }

  function bindLayoutMode() {
    if (document.documentElement.dataset.layoutModeBound) return;
    document.documentElement.dataset.layoutModeBound = '1';
    syncLayoutMode({ force: true });
    if (window.matchMedia) {
      const mq = window.matchMedia('(max-width: 720px)');
      const onMediaChange = function () { syncLayoutMode({ force: true }); };
      if (mq.addEventListener) mq.addEventListener('change', onMediaChange);
      else if (mq.addListener) mq.addListener(onMediaChange);
    }
    window.addEventListener('resize', function () {
      if (isPinchZoomed()) return;
      if (layoutSyncTimer) clearTimeout(layoutSyncTimer);
      layoutSyncTimer = setTimeout(function () {
        layoutSyncTimer = null;
        syncLayoutMode();
      }, 80);
    });
  }

  async function persistEconomy(opts) {
    opts = opts || {};
    economy = await saveEconomy(economy);
    updateBucksDisplay();
    passiveIncomeLastPersistAt = Date.now();
    if (opts.flush !== false) await flushStorageNow('economy save');
  }

  async function refreshKnownTags() {
    const cards = await getCards();
    const settings = await getSettings();
    const set = {};
    (settings.tagVocab || []).forEach(function (tag) { if (tag) set[tag] = true; });
    cards.forEach(function (c) {
      (c.tags || []).forEach(function (tag) {
        if (tag) set[tag] = true;
      });
    });
    knownTags = Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  async function rememberTag(name) {
    const value = String(name || '').replace(/^#/, '').trim();
    if (!value) return;
    const s = await getSettings();
    const vocab = Array.isArray(s.tagVocab) ? s.tagVocab.slice() : [];
    if (!vocab.some(function (t) { return t.toLowerCase() === value.toLowerCase(); })) {
      vocab.push(value);
      s.tagVocab = vocab;
      await saveSettingsAndFlush(s);
    }
    await refreshKnownTags();
  }

  async function applyVocabAndRerender() {
    const settings = await getSettings();
    applyI18n(document);
    refreshGreeting();
    updateBucksDisplay();
    syncFocusButton(settings.focusMode);
    const active = (els.tabBtns || []).find(function (b) { return b.classList.contains('active'); });
    const tab = active ? active.dataset.tab : 'naists';
    if (tab === 'naists') await renderNaistsBrowser();
    if (tab === 'edit') await renderEditTab();
    if (tab === 'stats') await renderStatsView();
    if (tab === 'store') await renderStore();
    if (tab === 'study') {
      if (els.sessionProgressChip && session.activeDeckName) updateSessionProgress();
      if (session.currentCard) updateRatingIntervalPreviews();
    } else {
      hideSessionProgressChip();
    }
  }

  // ---------------- appearance (foreground theme + pixel grass field) ----------------
  // Light/dark/system still change foreground tokens. The page background is
  // limited to authored pixel grass textures so old saved custom images or
  // non-farm cosmetic ids cannot punch through the redesign.

  const ACCENT_PRESETS = [
    { id: 'raspberry', nameKey: 'accentBerry', swatch: '#d6337a' },
    { id: 'blueberry', nameKey: 'accentBlue', swatch: '#3b6fd4' },
    { id: 'matcha', nameKey: 'accentMatcha', swatch: '#2f9e63' },
    { id: 'tangerine', nameKey: 'accentTang', swatch: '#e07d2a' },
    { id: 'grape', nameKey: 'accentGrape', swatch: '#8b46c8' }
  ];
  const GRASS_PRESETS = ['grass', 'grass-meadow', 'grass-noise'];

  // Applies the chosen accent + light/dark appearance to <html>/<body>.
  function applyAppearance(settings) {
    const s = settings || {};
    const theme = (s.theme === 'light' || s.theme === 'dark') ? s.theme : 'system';
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const accent = s.accentPreset || 'raspberry';
    const grass = GRASS_PRESETS.indexOf(s.backgroundPreset) !== -1 ? s.backgroundPreset : 'grass';
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.bg = grass;
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundRepeat = '';
    document.body.style.backgroundAttachment = '';
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
      title: t('yourName'),
      placeholder: t('namePlaceholder'),
      value: currentUsername || '',
      confirmText: required ? t('go') : t('save'),
      requireNonEmpty: true
    });
    if (name && name.trim()) {
      currentUsername = name.trim();
      await setUsername(currentUsername);
      await flushStorageNow('nickname save');
      refreshGreeting();
      if (els.settingsNicknameValue) els.settingsNicknameValue.textContent = currentUsername;
    }
    return currentUsername;
  }

  // ---------------- generic text-prompt overlay (window.prompt replacement) ----------------

  var _textPromptResolve = null;

  function bindTextPrompt() {
    if (!els.textPromptOverlay || els.textPromptOverlay.dataset.bound) return;
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
    els.textPromptTitle.textContent = opts.title || t('name');
    els.textPromptInput.value = opts.value || '';
    els.textPromptInput.placeholder = opts.placeholder || '';
    els.textPromptConfirm.textContent = opts.confirmText || t('ok');
    els.textPromptConfirm.dataset.requireNonEmpty = opts.requireNonEmpty ? '1' : '';
    _syncTextPromptConfirm();
    els.textPromptOverlay.hidden = false;
    setTimeout(function () { els.textPromptInput.focus(); els.textPromptInput.select(); }, 30);
    return new Promise(function (resolve) { _textPromptResolve = resolve; });
  }

  // ---------------- generic pixel modal (alert/confirm replacement) ----------------

  var _pixelModalResolve = null;

  function bindPixelModal() {
    if (!els.pixelModalOverlay || els.pixelModalOverlay.dataset.bound) return;
    els.pixelModalOverlay.dataset.bound = '1';
    els.pixelModalConfirm.addEventListener('click', function () { _closePixelModal(true); });
    els.pixelModalCancel.addEventListener('click', function () { _closePixelModal(false); });
    els.pixelModalOverlay.addEventListener('mousedown', function (e) {
      if (e.target === els.pixelModalOverlay) _closePixelModal(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!els.pixelModalOverlay || els.pixelModalOverlay.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        _closePixelModal(false);
      } else if (e.key === 'Enter' && document.activeElement !== els.pixelModalCancel) {
        e.preventDefault();
        _closePixelModal(true);
      }
    });
  }

  function _closePixelModal(result) {
    if (!els.pixelModalOverlay) return;
    els.pixelModalOverlay.hidden = true;
    els.pixelModalOverlay.dataset.kind = '';
    els.pixelModalConfirm.className = 'primary-btn';
    const resolve = _pixelModalResolve;
    _pixelModalResolve = null;
    if (resolve) resolve(!!result);
  }

  function openPixelModal(opts) {
    opts = opts || {};
    bindPixelModal();
    if (!els.pixelModalOverlay) return Promise.resolve(true);
    if (_pixelModalResolve) _closePixelModal(false);
    const showCancel = !!opts.showCancel;
    els.pixelModalOverlay.dataset.kind = showCancel ? 'confirm' : 'alert';
    els.pixelModalTitle.textContent = opts.title || (showCancel ? t('confirm') : t('notice'));
    els.pixelModalMessage.textContent = opts.message || '';
    els.pixelModalCancel.hidden = !showCancel;
    els.pixelModalCancel.textContent = opts.cancelText || t('cancel');
    els.pixelModalConfirm.textContent = opts.confirmText || t('ok');
    els.pixelModalConfirm.className = opts.danger ? 'secondary-btn danger-btn' : 'primary-btn';
    els.pixelModalOverlay.hidden = false;
    setTimeout(function () { els.pixelModalConfirm.focus(); }, 30);
    return new Promise(function (resolve) { _pixelModalResolve = resolve; });
  }

  function openPixelConfirm(message, opts) {
    opts = opts || {};
    return openPixelModal(Object.assign({}, opts, {
      message: message,
      showCancel: true,
      confirmText: opts.confirmText || t('delete')
    }));
  }

  function openPixelAlert(message, opts) {
    opts = opts || {};
    return openPixelModal(Object.assign({}, opts, {
      message: message,
      showCancel: false
    }));
  }

  // ---------------- settings overlay ----------------

  function bindSettingsOverlay() {
    if (!els.settingsOverlay || els.settingsOverlay.dataset.bound) return;
    els.settingsOverlay.dataset.bound = '1';
    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettings);
    if (els.focusBtn && !els.focusBtn.dataset.bound) {
      els.focusBtn.dataset.bound = '1';
      els.focusBtn.addEventListener('click', async function () {
        const s = await getSettings();
        const domMode = normalizeFocusMode(document.documentElement.dataset.focusMode);
        await setFocusMode(nextFocusMode(domMode || s.focusMode));
        await renderSettings();
      });
    }
    if (els.settingsCloseBtn) els.settingsCloseBtn.addEventListener('click', closeSettings);
    els.settingsOverlay.addEventListener('mousedown', function (e) {
      if (e.target === els.settingsOverlay) closeSettings();
    });

    if (els.settingsNicknameBtn) {
      els.settingsNicknameBtn.addEventListener('click', function () { promptForNickname(false); });
    }

    if (els.settingsSignoutBtn) {
      els.settingsSignoutBtn.addEventListener('click', async function () {
        closeSettings();
        await withLoading(async function () {
          await CloudAuth.signOutUser();
          // showAuthScreen() runs from the onAuthStateChanged(null) callback.
        });
      });
    }

    if (els.settingsVocabToggle) {
      els.settingsVocabToggle.addEventListener('click', async function () {
        const s = await getSettings();
        s.funSpellings = !s.funSpellings;
        await saveSettingsAndFlush(s);
        setFunSpellings(!!s.funSpellings);
        await applyVocabAndRerender();
        await renderSettings();
      });
    }

    if (els.settingsFocusModeRow) {
      els.settingsFocusModeRow.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-focus-choice]');
        if (!btn) return;
        const choice = btn.getAttribute('data-focus-choice');
        await setFocusMode(choice === 'off' ? false : choice);
        await renderSettings();
      });
    }

    if (els.settingsEncouragementToggle) {
      els.settingsEncouragementToggle.addEventListener('click', async function () {
        const s = await getSettings();
        s.encouragement = !s.encouragement;
        await saveSettingsAndFlush(s);
        await renderSettings();
      });
    }

    if (els.settingsThemeRow) {
      els.settingsThemeRow.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-theme-choice]');
        if (!btn) return;
        const choice = btn.getAttribute('data-theme-choice');
        if (choice !== 'light' && choice !== 'dark' && choice !== 'system') return;
        const s = await getSettings();
        s.theme = choice;
        await saveSettingsAndFlush(s);
        applyAppearance(s);
        await renderSettings();
      });
    }

    if (els.settingsGrassRow) {
      els.settingsGrassRow.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-grass-choice]');
        if (!btn) return;
        const choice = btn.getAttribute('data-grass-choice');
        if (GRASS_PRESETS.indexOf(choice) === -1) return;
        const s = await getSettings();
        s.backgroundPreset = choice;
        s.backgroundImage = null;
        await saveSettingsAndFlush(s);
        applyAppearance(s);
        await renderSettings();
      });
    }
  }

  async function openSettings() {
    await renderSettings();
    if (els.settingsOverlay) els.settingsOverlay.hidden = false;
  }

  function closeSettings() {
    if (els.settingsOverlay) els.settingsOverlay.hidden = true;
  }

  async function renderSettings() {
    const settings = await getSettings();

    if (els.settingsNicknameValue) {
      els.settingsNicknameValue.textContent = currentUsername || t('friend');
    }

    // Sign out only makes sense (and is only wired) with cloud auth on.
    if (els.settingsSignoutSection) {
      els.settingsSignoutSection.hidden = !(window.CloudAuth && window.CloudAuth.isConfigured);
    }

    const theme = (settings.theme === 'light' || settings.theme === 'dark') ? settings.theme : 'system';
    if (els.settingsThemeRow) {
      Array.prototype.forEach.call(els.settingsThemeRow.querySelectorAll('[data-theme-choice]'), function (btn) {
        const on = btn.getAttribute('data-theme-choice') === theme;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    const grass = GRASS_PRESETS.indexOf(settings.backgroundPreset) !== -1 ? settings.backgroundPreset : 'grass';
    if (els.settingsGrassRow) {
      Array.prototype.forEach.call(els.settingsGrassRow.querySelectorAll('[data-grass-choice]'), function (btn) {
        const on = btn.getAttribute('data-grass-choice') === grass;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    _renderSwatches(els.settingsAccentSwatches, ACCENT_PRESETS, settings.accentPreset || 'raspberry', async function (id) {
      const s = await getSettings();
      s.accentPreset = id;
      await saveSettingsAndFlush(s);
      applyAppearance(s);
      await renderSettings();
    });

    const focusMode = normalizeFocusMode(settings.focusMode);
    _setToggle(els.settingsVocabToggle, !!settings.funSpellings);
    if (els.settingsFocusModeRow) {
      Array.prototype.forEach.call(els.settingsFocusModeRow.querySelectorAll('[data-focus-choice]'), function (btn) {
        const on = btn.getAttribute('data-focus-choice') === (focusMode || 'off');
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    _setToggle(els.settingsEncouragementToggle, !!settings.encouragement);
  }

  function _setToggle(btn, on) {
    if (!btn) return;
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function _renderSwatches(container, presets, activeId, onPick) {
    if (!container) return;
    container.innerHTML = '';
    presets.forEach(function (preset) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch' + (preset.id === activeId ? ' active' : '');
      btn.style.background = preset.swatch;
      const presetName = preset.nameKey ? t(preset.nameKey) : (preset.name || preset.id);
      btn.title = presetName;
      btn.setAttribute('aria-label', presetName);
      const label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = presetName;
      btn.appendChild(label);
      btn.addEventListener('click', function () { onPick(preset.id); });
      container.appendChild(btn);
    });
  }

  // ---------------- sprite lab (developer-only pixel frame sandbox) ----------------

  const SPRITE_LAB_W = 18;
  const SPRITE_LAB_H = 16;
  const SPRITE_LAB_COLORS = [
    '#2b1f18', '#fff3c8', '#f6c545', '#78b94f', '#3f8a3f',
    '#f092a3', '#cf5d71', '#d29a4c', '#8a532e', '#4b72c9',
    '#58a9cf', '#c9483f', '#f0a329', '#f8edd4', '#30363f'
  ];
  let spriteLabCells = {};
  let spriteLabColor = SPRITE_LAB_COLORS[0];
  let spriteLabTimer = null;

  function bindSpriteLab() {
    if (!els.spriteLabOverlay || els.spriteLabOverlay.dataset.bound) return;
    els.spriteLabOverlay.dataset.bound = '1';
    if (els.spriteLabOpenBtn) els.spriteLabOpenBtn.addEventListener('click', openSpriteLab);
    if (els.spriteLabCloseBtn) els.spriteLabCloseBtn.addEventListener('click', closeSpriteLab);
    if (els.spriteLabResetBtn) els.spriteLabResetBtn.addEventListener('click', resetSpriteLabFromCatalog);
    if (els.spriteLabPlayBtn) els.spriteLabPlayBtn.addEventListener('click', toggleSpriteLabPlayback);
    if (els.spriteLabSpecies) els.spriteLabSpecies.addEventListener('change', resetSpriteLabFromCatalog);
    if (els.spriteLabState) els.spriteLabState.addEventListener('change', resetSpriteLabFromCatalog);
    if (els.spriteLabFrame) els.spriteLabFrame.addEventListener('input', resetSpriteLabFromCatalog);
    if (els.spriteLabGrid) {
      els.spriteLabGrid.addEventListener('click', function (e) {
        const cell = e.target.closest('[data-x][data-y]');
        if (!cell) return;
        stopSpriteLabPlayback();
        spriteLabCells[cell.dataset.x + ':' + cell.dataset.y] = spriteLabColor;
        renderSpriteLab();
      });
      els.spriteLabGrid.addEventListener('contextmenu', function (e) {
        const cell = e.target.closest('[data-x][data-y]');
        if (!cell) return;
        e.preventDefault();
        stopSpriteLabPlayback();
        delete spriteLabCells[cell.dataset.x + ':' + cell.dataset.y];
        renderSpriteLab();
      });
    }
    if (els.spriteLabOverlay) {
      els.spriteLabOverlay.addEventListener('mousedown', function (e) {
        if (e.target === els.spriteLabOverlay) closeSpriteLab();
      });
    }
  }

  function openSpriteLab() {
    fillSpriteLabSelects();
    resetSpriteLabFromCatalog();
    els.spriteLabOverlay.hidden = false;
  }

  function closeSpriteLab() {
    stopSpriteLabPlayback();
    if (els.spriteLabOverlay) els.spriteLabOverlay.hidden = true;
  }

  function fillSpriteLabSelects() {
    if (!window.PixelSprites) return;
    if (els.spriteLabSpecies && !els.spriteLabSpecies.options.length) {
      (window.PixelSprites.species || []).forEach(function (species) {
        const opt = document.createElement('option');
        opt.value = species;
        opt.textContent = speciesLabel(species);
        els.spriteLabSpecies.appendChild(opt);
      });
    }
    if (els.spriteLabState && !els.spriteLabState.options.length) {
      (window.PixelSprites.states || []).forEach(function (state) {
        const opt = document.createElement('option');
        opt.value = state;
        opt.textContent = state;
        els.spriteLabState.appendChild(opt);
      });
    }
    if (els.spriteLabPalette && !els.spriteLabPalette.children.length) {
      SPRITE_LAB_COLORS.forEach(function (color) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch sprite-lab-swatch';
        btn.style.background = color;
        btn.setAttribute('aria-label', color);
        btn.addEventListener('click', function () {
          spriteLabColor = color;
          Array.prototype.forEach.call(els.spriteLabPalette.querySelectorAll('.sprite-lab-swatch'), function (b) {
            b.classList.toggle('active', b === btn);
          });
        });
        if (color === spriteLabColor) btn.classList.add('active');
        els.spriteLabPalette.appendChild(btn);
      });
    }
  }

  function resetSpriteLabFromCatalog() {
    stopSpriteLabPlayback();
    if (!window.PixelSprites || !window.PixelSprites.frame) return;
    const species = els.spriteLabSpecies.value || 'pigs';
    const state = els.spriteLabState.value || 'stand';
    const frame = Number(els.spriteLabFrame.value) || 0;
    spriteLabCells = {};
    window.PixelSprites.frame(species, { state: state, frame: frame }).forEach(function (cell) {
      spriteLabCells[cell.x + ':' + cell.y] = cell.color;
    });
    renderSpriteLab();
  }

  function toggleSpriteLabPlayback() {
    if (spriteLabTimer) {
      stopSpriteLabPlayback();
      return;
    }
    if (!els.spriteLabFrame) return;
    els.spriteLabPlayBtn.textContent = 'Stop';
    spriteLabTimer = setInterval(function () {
      els.spriteLabFrame.value = String((Number(els.spriteLabFrame.value) + 1) % 4);
      if (!window.PixelSprites || !window.PixelSprites.frame) return;
      const species = els.spriteLabSpecies.value || 'pigs';
      const state = els.spriteLabState.value || 'walk';
      spriteLabCells = {};
      window.PixelSprites.frame(species, { state: state, frame: Number(els.spriteLabFrame.value) }).forEach(function (cell) {
        spriteLabCells[cell.x + ':' + cell.y] = cell.color;
      });
      renderSpriteLab();
    }, 260);
  }

  function stopSpriteLabPlayback() {
    if (spriteLabTimer) clearInterval(spriteLabTimer);
    spriteLabTimer = null;
    if (els.spriteLabPlayBtn) els.spriteLabPlayBtn.textContent = 'Play';
  }

  function renderSpriteLab() {
    paintSpriteLabPreview();
    renderSpriteLabGrid();
    if (els.spriteLabOutput) {
      const cells = Object.keys(spriteLabCells).sort().map(function (key) {
        const parts = key.split(':');
        return { x: Number(parts[0]), y: Number(parts[1]), color: spriteLabCells[key] };
      });
      els.spriteLabOutput.value = JSON.stringify({ width: SPRITE_LAB_W, height: SPRITE_LAB_H, cells: cells }, null, 2);
    }
  }

  function paintSpriteLabPreview() {
    if (!els.spriteLabPreview) return;
    const shell = document.createElement('span');
    shell.className = 'pixel-sprite sprite-lab-preview-sprite';
    shell.style.setProperty('--sprite-w', SPRITE_LAB_W);
    shell.style.setProperty('--sprite-h', SPRITE_LAB_H);
    const inner = document.createElement('span');
    inner.className = 'pixel-sprite-inner';
    Object.keys(spriteLabCells).forEach(function (key) {
      const parts = key.split(':');
      const px = document.createElement('span');
      px.className = 'pixel-cell';
      px.style.gridColumn = String(Number(parts[0]) + 1);
      px.style.gridRow = String(Number(parts[1]) + 1);
      px.style.backgroundColor = spriteLabCells[key];
      inner.appendChild(px);
    });
    shell.appendChild(inner);
    els.spriteLabPreview.textContent = '';
    els.spriteLabPreview.appendChild(shell);
  }

  function renderSpriteLabGrid() {
    if (!els.spriteLabGrid) return;
    els.spriteLabGrid.innerHTML = '';
    for (let y = 0; y < SPRITE_LAB_H; y++) {
      for (let x = 0; x < SPRITE_LAB_W; x++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.style.backgroundColor = spriteLabCells[x + ':' + y] || 'transparent';
        btn.setAttribute('aria-label', 'pixel ' + x + ', ' + y);
        els.spriteLabGrid.appendChild(btn);
      }
    }
  }

  // ---------------- tabs ----------------

  function bindTabs() {
    if (!els.app || els.app.dataset.tabsBound) return;
    els.app.dataset.tabsBound = '1';
    (els.tabBtns || []).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.tab === 'store' && isSleepFocusActive()) return;
        switchTab(btn.dataset.tab);
      });
    });
  }

  // `opts.deckId` (Stody/Edit only) forces that specific deck, bypassing the
  // Stody tab's "resume last-studied deck" default and the Edit tab's
  // "show whatever's currently open" default — used by a deck row's
  // explicit Stody/Cram/Edit buttons. A plain tab-bar click never passes
  // opts, so it always falls through to those defaults.
  function switchTab(tab, opts) {
    opts = opts || {};
    if (tab === 'store' && isSleepFocusActive()) {
      syncSleepLockout('sleep');
      const active = (els.tabBtns || []).find(function (btn) { return btn.classList.contains('active'); });
      if (active && active.dataset.tab === 'store') switchTab('farm');
      return;
    }
    if (tab === 'farm' && !isCompactLayout()) tab = 'naists';
    (els.tabBtns || []).forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    Object.keys(els.views).forEach(function (name) {
      if (els.views[name]) els.views[name].classList.toggle('active', name === tab);
    });
    document.documentElement.classList.toggle('farm-tab', tab === 'farm');
    if (typeof syncFarmGap === 'function') syncFarmGap();

    if (tab === 'naists') renderNaistsBrowser();
    if (tab === 'study') {
      if (opts.tag) {
        startDeckSession(null, '#' + opts.tag, { tag: opts.tag, cram: !!opts.cram });
      } else if (opts.deckId) {
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
    if (tab === 'store') renderStore();
    applySellMode(sellModeForTab(tab));
    if (!sellModeForTab(tab)) hideSellTip();
    if (tab !== 'study') hideSessionProgressChip();
    else if (session.activeDeckName) updateSessionProgress();
    if (tab !== 'study' && els.pigOverlay && !els.pigOverlay.hidden) dismissPigEncouragement();
  }

  // ---------------- naist helpers (shared: Naists browser + Edit Daeck breadcrumb) ----------------

  const NEST_PATH_SEPARATOR = ' > ';
  const NEST_BREADCRUMB_SEPARATOR = '>';

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
    return naistPath(naists, naistId).map(function (n) { return n.name; }).join(NEST_PATH_SEPARATOR);
  }

  function deckDisplayLabel(deck, naists) {
    const pathLabel = naistPathLabel(naists, deck.naistId);
    const name = displayDeckName(deck);
    return pathLabel ? pathLabel + NEST_PATH_SEPARATOR + name : name;
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
    if (window.PixelSprites && window.PixelSprites.renderIcon) {
      const icon = window.PixelSprites.renderIcon('nests');
      icon.classList.add('naist-icon');
      return icon;
    }
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
    btn.title = t('delete');
    btn.setAttribute('aria-label', t('delete'));
    if (window.PixelSprites && window.PixelSprites.renderIcon) {
      btn.appendChild(window.PixelSprites.renderIcon('trash'));
    } else {
      const svg = _svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      svg.appendChild(_svgEl('path', { d: _TRASH_PATH }));
      btn.appendChild(svg);
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick(e);
    });
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
    const crumbs = [{ id: null, name: t('allDecks') }].concat(
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
        sep.textContent = NEST_BREADCRUMB_SEPARATOR;
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
    if (!els.naistsSearch || els.naistsSearch.dataset.bound) return;
    els.naistsSearch.dataset.bound = '1';
    els.naistsSearch.addEventListener('input', function () { renderNaistsBrowser(); });

    if (els.newNaistBtn) {
      els.newNaistBtn.addEventListener('click', async function () {
        const name = await openTextPrompt({
          title: t('newNestTitle'),
          placeholder: t('nestName'),
          confirmText: t('create'),
          requireNonEmpty: true
        });
        if (!name || !name.trim()) return;
        await addNaist(name.trim(), browseNaistId);
        await flushStorageNow('nest create');
        await renderNaistsBrowser();
      });
    }

    if (els.newDeckBtn) els.newDeckBtn.addEventListener('click', openNewDeckOverlay);

    // "+ Import daeck" — one-click Anki import that spins up a brand-new deck
    // named after the file, dropped into whatever naist level is being
    // browsed, then jumps straight into editing it.
    if (els.importDeckBtn && els.importDeckInput) {
      els.importDeckBtn.addEventListener('click', function () { els.importDeckInput.click(); });
      els.importDeckInput.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const baseName = file.name.replace(/\.[^.]+$/, '').trim() || t('importedDeck');
        await withLoading(async function () {
          let changed = false;
          try {
            const deck = await addDeck(baseName, browseNaistId);
            changed = true;
            const parsed = await importAnkiFile(file);
            await addCards(parsed, deck.id);
            await flushStorageNow('deck import');
            switchTab('edit', { deckId: deck.id });
          } catch (err) {
            if (changed) await flushStorageNow('partial deck import');
            await openPixelAlert(err && err.message ? err.message : t('importFailed'), { title: t('importFailed') });
          }
        });
      });
    }
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
        ? t('emptyNest')
        : t('noCardsYet');
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

  function normalizeTagQuery(query) {
    return String(query || '').trim().replace(/^#/, '').toLowerCase();
  }

  function cardMatchesSearch(card, query) {
    const q = query.toLowerCase();
    const tagQ = normalizeTagQuery(query);
    if ((card.front || '').toLowerCase().indexOf(q) !== -1) return true;
    if ((card.back || '').toLowerCase().indexOf(q) !== -1) return true;
    return (card.tags || []).some(function (tag) {
      return String(tag).toLowerCase().indexOf(tagQ) !== -1;
    });
  }

  function matchingTagName(query) {
    const q = normalizeTagQuery(query);
    if (!q) return null;
    const exact = knownTags.find(function (tag) { return tag.toLowerCase() === q; });
    return exact || null;
  }

  function renderNaistsSearchResults(query, cards, decks, naists) {
    const deckNameById = {};
    decks.forEach(function (d) { deckNameById[d.id] = deckDisplayLabel(d, naists); });

    const matches = cards.filter(function (c) { return cardMatchesSearch(c, query); });
    const tagMatch = matchingTagName(query);

    els.naistsList.innerHTML = '';

    if (tagMatch) {
      const bar = document.createElement('div');
      bar.className = 'tag-study-bar';
      const label = document.createElement('span');
      label.textContent = '#' + tagMatch;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary-btn';
      btn.textContent = t('studyThisTag');
      btn.addEventListener('click', function () {
        switchTab('study', { tag: tagMatch });
      });
      bar.appendChild(label);
      bar.appendChild(btn);
      els.naistsList.appendChild(bar);
    }

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = t('noCardsMatch');
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
    handle.title = t('dragToMove');
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<span class="pixel-grip-dot"></span><span class="pixel-grip-dot"></span><span class="pixel-grip-dot"></span><span class="pixel-grip-dot"></span><span class="pixel-grip-dot"></span><span class="pixel-grip-dot"></span>';
    handle.addEventListener('pointerdown', function (e) {
      beginPointerDrag(e, kind, id, label);
    });
    handle.addEventListener('click', function (e) { e.stopPropagation(); });
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
    await flushStorageNow('nest move');
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
    span.textContent = drag.label || (drag.kind === 'naist' ? t('nest') : t('deck'));
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
    chevron.setAttribute('aria-label', expanded ? t('collapseNest') : t('expandNest'));
    chevron.innerHTML = '<span class="pixel-chevron-arrow" aria-hidden="true"></span>';
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
    name.title = t('rename');
    name.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const newName = await openTextPrompt({
        title: t('renameNest'),
        value: naist.name,
        confirmText: t('rename'),
        requireNonEmpty: true
      });
      if (!newName || !newName.trim()) return;
      await renameNaist(naist.id, newName.trim());
      await flushStorageNow('nest rename');
      await renderNaistsBrowser();
    });
    const meta = document.createElement('span');
    meta.className = 'naist-row-meta';
    meta.textContent = rollup.deckCount === 1 ? t('oneDeck') : t('nDecks', { n: rollup.deckCount });
    info.appendChild(name);
    info.appendChild(meta);

    const dueBadge = document.createElement('span');
    dueBadge.className = 'deck-due-badge' + (rollup.due === 0 ? ' none' : '');
    dueBadge.textContent = rollup.due === 0 ? t('noCardsDue') : t('nDue', { n: rollup.due });

    mainBtn.appendChild(info);
    mainBtn.appendChild(dueBadge);
    mainBtn.addEventListener('click', function () {
      browseNaistId = naist.id;
      renderNaistsBrowser();
    });

    const actions = document.createElement('div');
    actions.className = 'browse-row-actions';

    const deleteBtn = buildDeleteButton(async function () {
      if (!await openPixelConfirm(t('deleteNestConfirm', { name: naist.name }), { title: t('delete'), danger: true })) return;
      await deleteNaist(naist.id);
      await flushStorageNow('nest delete');
      await renderNaistsBrowser();
    });

    actions.appendChild(deleteBtn);
    body.appendChild(mainBtn);
    body.appendChild(actions);
    row.appendChild(body);

    return row;
  }

  // A deck row: name + due-count badge + total-count badge on one line.
  // Clicking the row (name, counts, empty space) starts a Study session.
  // Cram and Edit stay explicit buttons and must not start study. The Study
  // button remains as an extra affordance. Drag handle / delete do not start
  // study. Rename lives on the Edit tab. Draggable via the grip handle; a
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
    name.textContent = displayDeckName(deck);
    name.title = t('study');
    const counts = document.createElement('span');
    counts.className = 'deck-row-counts';
    const dueBadge = document.createElement('span');
    dueBadge.className = 'deck-due-badge' + (dueCount === 0 ? ' none' : '');
    dueBadge.textContent = dueCount === 0 ? t('noCardsDue') : t('nDue', { n: dueCount });
    const totalBadge = document.createElement('span');
    totalBadge.className = 'deck-total-badge';
    totalBadge.textContent = t('nTotal', { n: totalCount });
    counts.appendChild(dueBadge);
    counts.appendChild(totalBadge);
    info.appendChild(name);
    info.appendChild(counts);

    const primary = document.createElement('div');
    primary.className = 'browse-row-primary-actions';

    const stodyBtn = document.createElement('button');
    stodyBtn.type = 'button';
    stodyBtn.className = 'secondary-btn';
    stodyBtn.textContent = t('study');
    stodyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      switchTab('study', { deckId: deck.id, deckName: displayDeckName(deck) });
    });

    const cramBtn = document.createElement('button');
    cramBtn.type = 'button';
    cramBtn.className = 'secondary-btn';
    cramBtn.textContent = t('cram');
    cramBtn.disabled = totalCount === 0;
    cramBtn.title = totalCount === 0 ? t('noCramCards') : t('cramTitle');
    cramBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      switchTab('study', { deckId: deck.id, deckName: displayDeckName(deck), cram: true });
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-btn';
    editBtn.textContent = t('edit');
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      switchTab('edit', { deckId: deck.id });
    });

    primary.appendChild(stodyBtn);
    primary.appendChild(cramBtn);
    primary.appendChild(editBtn);

    const actions = document.createElement('div');
    actions.className = 'browse-row-actions';

    if (deck.id !== DEFAULT_DECK_ID) {
      const deleteBtn = buildDeleteButton(async function () {
        if (!await openPixelConfirm(t('deleteDeckConfirm', { name: displayDeckName(deck) }), { title: t('delete'), danger: true })) return;
        await deleteDeck(deck.id);
        await flushStorageNow('deck delete');
        if (editDeckId === deck.id) editDeckId = null;
        await renderNaistsBrowser();
      });
      actions.appendChild(deleteBtn);
    }

    body.appendChild(info);
    body.appendChild(primary);
    body.appendChild(actions);
    row.appendChild(body);

    row.addEventListener('click', function (e) {
      if (e.target.closest('.drag-handle, .browse-row-primary-actions, .browse-row-actions, button')) return;
      switchTab('study', { deckId: deck.id, deckName: displayDeckName(deck) });
    });

    return row;
  }

  // ---------------- Naists tab: new-deck-with-import overlay ----------------

  function bindNewDeckOverlay() {
    if (!els.newDeckOverlay || els.newDeckOverlay.dataset.bound) return;
    els.newDeckOverlay.dataset.bound = '1';
    els.newDeckEmptyBtn.addEventListener('click', async function () {
      const name = els.newDeckNameInput.value.trim();
      if (!name) { els.newDeckNameInput.focus(); return; }
      await withLoading(async function () {
        const deck = await addDeck(name, pendingNewDeckNaistId);
        await flushStorageNow('deck create');
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
        let changed = false;
        try {
          const deck = await addDeck(name, pendingNewDeckNaistId);
          changed = true;
          const parsed = await importAnkiFile(file);
          await addCards(parsed, deck.id);
          await flushStorageNow('deck import');
          closeNewDeckOverlay();
          switchTab('edit', { deckId: deck.id });
        } catch (err) {
          if (changed) await flushStorageNow('partial deck import');
          els.newDeckStatus.textContent = err.message || t('importFailed');
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
    if (!els.showAnswerBtn || els.showAnswerBtn.dataset.bound) return;
    els.showAnswerBtn.dataset.bound = '1';
    els.showAnswerBtn.addEventListener('click', revealAnswer);
    if (els.ratingButtons) {
      Array.prototype.slice.call(els.ratingButtons.querySelectorAll('.rating-btn')).forEach(function (btn) {
        btn.addEventListener('click', function () { rateCard(btn.dataset.rating); });
      });
    }

    // Click anywhere on the card itself to move things along: first click
    // reveals the answer (same as Show Answer); once the answer is showing,
    // a click advances to the next card (recorded as a "Gob"/good rating, so
    // it's still scheduled and still undoable). Occlusion masks keep their
    // own click-to-reveal behavior — a pre-reveal mask click is left to
    // occlusion.js and never reveals everything or advances.
    const cardShell = els.studyCard && els.studyCard.querySelector('.card-shell');
    if (cardShell) cardShell.addEventListener('click', onStudyCardClick);

    if (els.emptyBackBtn) {
      els.emptyBackBtn.addEventListener('click', function () { endStudySession(); switchTab('naists'); });
    }
    if (els.undoRatingBtn) els.undoRatingBtn.addEventListener('click', undoLastRating);
    if (els.studyNoDeckGotoBtn) {
      els.studyNoDeckGotoBtn.addEventListener('click', function () { switchTab('naists'); });
    }
  }

  // Opening the Stody tab directly (tab-bar click, no forced deckId): if a
  // session is already open, just show it as-is; otherwise resume the
  // last-studied deck; otherwise a friendly empty state pointing at Naists.
  async function showStudyTab() {
    if (session.activeDeckId || session.activeTag) {
      els.studyNoDeckState.hidden = true;
      els.studySession.hidden = false;
      updateSessionProgress();
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
    hideSessionProgressChip();
  }

  function endStudySession() {
    session.activeDeckId = null;
    session.activeTag = null;
    session.cram = false;
    session.lastAction = null;
    els.undoRatingBtn.hidden = true;
    els.cramModeBadge.hidden = true;
    els.studySession.hidden = true;
    hideSessionProgressChip();
    flushStorageNow('session end');
  }

  async function startDeckSession(deckId, deckName, opts) {
    opts = opts || {};
    session.activeDeckId = deckId || null;
    session.activeTag = opts.tag || null;
    session.activeDeckName = deckName || (session.activeTag ? '#' + session.activeTag : '');
    session.cram = !!opts.cram;
    session.lastAction = null;
    session.cardsSinceLastPig = 0;
    els.undoRatingBtn.hidden = true;
    els.cramModeBadge.hidden = !session.cram;
    els.studyNoDeckState.hidden = true;
    els.studySession.hidden = false;

    if (deckId) {
      await setLastStudiedDeckId(deckId);
      await flushStorageNow('session start');
    }

    await withLoading(async function () {
      const cards = await getCards();
      session.queue = session.cram
        ? buildCramQueue(cards, deckId).filter(function (c) { return cardHasTag(c, session.activeTag); })
        : buildStudyQueue(cards, Date.now(), deckId, undefined, session.activeTag);
      session.reviewedCount = 0;
      showNextCard();
    });
  }

  function hideSessionProgressChip() {
    if (els.sessionProgressChip) els.sessionProgressChip.hidden = true;
  }

  function updateSessionProgress() {
    const left = session.queue.length;
    const reviewed = session.reviewedCount;
    const name = session.activeDeckName || '';
    if (!els.sessionProgressChip) return;
    const onStudy = !!(els.views.study && els.views.study.classList.contains('active'));
    const live = !!(name && els.studySession && !els.studySession.hidden);
    els.sessionProgressChip.hidden = !(onStudy && live);
    if (els.sessionProgressName) els.sessionProgressName.textContent = name;
    if (els.sessionProgressCounts) {
      els.sessionProgressCounts.textContent = t('sessionChipCounts', { reviewed: reviewed, left: left });
    }
    els.sessionProgressChip.title = t('sessionProgress', {
      name: name,
      reviewed: reviewed,
      left: left
    });
    if (els.cramModeBadge) els.cramModeBadge.hidden = !session.cram;
  }

  function showNextCard() {
    updateSessionProgress();

    if (session.queue.length === 0) {
      session.currentCard = null;
      els.studyCard.hidden = true;
      els.emptyState.hidden = false;
      const emptyKey = session.cram ? 'cramEmpty' : 'studyEmpty';
      els.emptyStateText.textContent = t(emptyKey, { name: session.activeDeckName }) +
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
      renderStudyCardTags(card.tags);
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
    renderStudyCardTags(card.tags);
  }

  function renderStudyCardTags(tags) {
    if (!els.cardTags) return;
    els.cardTags.innerHTML = '';
    if (!tags || !tags.length) {
      els.cardTags.hidden = true;
      return;
    }
    tags.forEach(function (tag) {
      els.cardTags.appendChild(makeTagChip(tag, false));
    });
    els.cardTags.hidden = false;
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
    const n = Number(days);
    if (!isFinite(n) || n < 0) return '';
    if (n === 0) return t('intervalNow');
    if (n < 1) {
      const hours = n * 24;
      if (hours >= 1) return Math.round(hours) + 'h';
      return Math.max(1, Math.round(hours * 60)) + 'm';
    }
    if (n < 31) return Math.round(n) + 'd';
    if (n < 60) return Math.max(1, Math.round(n / 7)) + 'w';
    if (n < 365) return Math.max(1, Math.round(n / 30)) + 'mo';
    return Math.max(1, Math.round(n / 365)) + 'y';
  }

  // Speculatively previews what each rating would produce as a next
  // interval, without persisting anything (scheduleReview is pure).
  function updateRatingIntervalPreviews() {
    const card = session.currentCard;
    const btns = Array.prototype.slice.call(els.ratingButtons.querySelectorAll('.rating-btn'));
    btns.forEach(function (btn) {
      let span = btn.querySelector('.rating-interval');
      if (!span) {
        span = document.createElement('span');
        span.className = 'rating-interval';
        btn.appendChild(span);
      }
      span.textContent = '';
      if (!card) return;
      try {
        const preview = scheduleReview(card, btn.dataset.rating, Date.now());
        const days = preview ? preview.interval : null;
        span.textContent = formatIntervalPreview(days);
      } catch (err) {
        span.textContent = '';
      }
    });
  }

  function setRatingBusy(on) {
    ratingBusy = !!on;
    if (!els.ratingButtons) return;
    Array.prototype.forEach.call(els.ratingButtons.querySelectorAll('.rating-btn'), function (btn) {
      btn.disabled = !!on;
    });
  }

  async function rateCard(rating) {
    const card = session.currentCard;
    if (!card || ratingBusy) return;
    setRatingBusy(true);

    try {
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
        const reward = await grantRatingReward(card, rating, logEntry);
        await updateCard(card.id, updated);
        await logReview(logEntry);

        session.lastAction = {
          cram: false,
          originalCard: card, // pre-rating snapshot, restored verbatim on undo
          updatedCard: updated,
          logEntryId: logEntry.id,
          wasAgain: rating === 'again',
          rewardKey: reward.key,
          bucksGranted: reward.amount
        };
        if (rating === 'again') session.queue.splice(reinsertAt, 0, updated);

        updateBucksDisplay();
        scheduleStorageFlush('rating save');
      }

      session.reviewedCount++;
      els.undoRatingBtn.hidden = false;

      const settings = await getSettings();
      const sleepFocus = document.documentElement.dataset.focusMode === 'sleep';
      if (settings.encouragement && !sleepFocus) {
        session.cardsSinceLastPig = (session.cardsSinceLastPig || 0) + 1;
        if (session.cardsSinceLastPig >= ENCOURAGEMENT_INTERVAL) {
          session.cardsSinceLastPig = 0;
          if (session.lastAction) session.lastAction.encouragementFired = true;
          await showPigEncouragement();
          return;
        }
      }
      showNextCard();
    } finally {
      setRatingBusy(false);
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
      await flushStorageNow('rating undo');
    }

    session.reviewedCount = Math.max(0, session.reviewedCount - 1);
    session.cardsSinceLastPig = action.encouragementFired
      ? ENCOURAGEMENT_INTERVAL - 1
      : Math.max(0, (session.cardsSinceLastPig || 0) - 1);
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

  let _pigOverlayArmed = false;
  let _pigOverlayTimer = null;
  let _pigOverlayStop = null;

  function bindPigOverlay() {
    if (!els.pigOverlay || els.pigOverlay.dataset.bound) return;
    els.pigOverlay.dataset.bound = '1';
    if (els.pigOverlayContinue) {
      els.pigOverlayContinue.addEventListener('click', function () { dismissPigEncouragement(); });
    }
  }

  function _onPigOverlayMouseDown() {
    dismissPigEncouragement();
    document.addEventListener('click', function eat(ev) {
      ev.stopPropagation();
      document.removeEventListener('click', eat, true);
    }, true);
  }

  function dismissPigEncouragement() {
    if (!_pigOverlayArmed) return;
    _pigOverlayArmed = false;
    if (_pigOverlayTimer) { clearTimeout(_pigOverlayTimer); _pigOverlayTimer = null; }
    if (_pigOverlayStop) { _pigOverlayStop(); _pigOverlayStop = null; }
    document.removeEventListener('mousedown', _onPigOverlayMouseDown, true);
    if (els.pigOverlay) {
      els.pigOverlay.hidden = true;
      els.pigOverlay.classList.remove('star-event');
    }
    showNextCard();
  }

  function visibleEncouragementAnimals() {
    const out = [];
    if (!els.pigField) return out;
    Array.prototype.forEach.call(els.pigField.querySelectorAll('.animal-scatter'), function (node) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      if (!rect.width || !rect.height) return;
      if (style && (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)) return;
      out.push({
        species: node.dataset.species || 'pigs',
        variant: Number(node.dataset.variant || node.dataset.index || 0),
        name: animalNameForNode(node)
      });
    });
    return out;
  }

  function randomEncouragementAnimal() {
    const visible = visibleEncouragementAnimals();
    if (visible.length) return visible[Math.floor(Math.random() * visible.length)];
    const owned = [];
    ANIMAL_SHOP.forEach(function (spec) {
      const count = (economy.animals && economy.animals[spec.id]) || 0;
      for (let i = 1; i <= count; i++) {
        owned.push({
          species: spec.id,
          variant: i,
          name: speciesLabel(spec.id) + ' ' + i
        });
      }
    });
    return owned.length ? owned[Math.floor(Math.random() * owned.length)] : { species: 'pigs', variant: 0, name: speciesLabel('pigs') };
  }

  function randomEncouragementState() {
    const states = ['stand', 'walk', 'sit', 'sleep'];
    return states[Math.floor(Math.random() * states.length)];
  }

  async function showPigEncouragement() {
    if (!els.pigOverlay) {
      showNextCard();
      return;
    }
    if (_pigOverlayStop) { _pigOverlayStop(); _pigOverlayStop = null; }
    if (els.pigOverlayImg) {
      const animal = randomEncouragementAnimal();
      const state = randomEncouragementState();
      els.pigOverlayImg.textContent = '';
      els.pigOverlayImg.classList.remove('encouragement-walk', 'encouragement-state-stand', 'encouragement-state-walk', 'encouragement-state-sit', 'encouragement-state-sleep');
      els.pigOverlayImg.classList.add('encouragement-state-' + state);
      if (state === 'walk') els.pigOverlayImg.classList.add('encouragement-walk');
      els.pigOverlayImg.setAttribute('aria-label', animal.name);
      if (window.PixelSprites && window.PixelSprites.paintAnimal) {
        window.PixelSprites.paintAnimal(els.pigOverlayImg, animal.species, {
          state: state,
          variant: animal.variant
        });
        if (state === 'walk') _pigOverlayStop = window.PixelSprites.animate(els.pigOverlayImg, 'walk', 4);
      }
    }
    if (els.pigOverlayText) els.pigOverlayText.textContent = getRandomEncouragement(currentUsername);
    if (els.pigOverlayContinue) els.pigOverlayContinue.textContent = t('studyingContinue');
    els.pigOverlay.hidden = false;
    _pigOverlayArmed = true;
    document.addEventListener('mousedown', _onPigOverlayMouseDown, true);
    _pigOverlayTimer = setTimeout(dismissPigEncouragement, 3000);
  }

  // ---------------- Edit Deck tab ----------------

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
    previewEl.title = t('replaceImage');
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
    if (!els.addCardBtn || els.addCardBtn.dataset.bound) return;
    els.addCardBtn.dataset.bound = '1';
    els.editNoDeckGotoBtn.addEventListener('click', function () { switchTab('naists'); });

    els.editDeckRenameBtn.addEventListener('click', async function () {
      if (!editDeckId) return;
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === editDeckId; });
      if (!deck) return;
      const newName = await openTextPrompt({
        title: t('renameDeck'),
        value: deck.name,
        confirmText: t('rename'),
        requireNonEmpty: true
      });
      if (!newName || !newName.trim()) return;
      await renameDeck(editDeckId, newName.trim());
      await flushStorageNow('deck rename');
      await renderEditDeck();
    });

    els.editDeckDeleteBtn.addEventListener('click', async function () {
      if (!editDeckId || editDeckId === DEFAULT_DECK_ID) return;
      const decks = await getDecks();
      const deck = decks.find(function (d) { return d.id === editDeckId; });
      if (!deck) return;
      if (!await openPixelConfirm(t('deleteDeckConfirm', { name: displayDeckName(deck) }), { title: t('delete'), danger: true })) return;
      await deleteDeck(deck.id);
      await flushStorageNow('deck delete');
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
    renderTagInput(els.addCardTags, addFormTags, function (next) { addFormTags = next; });
    renderTagInput(els.occlusionCardTags, occlusionFormTags, function (next) { occlusionFormTags = next; });
    window.getAddFormTags = function () { return occlusionFormTags.slice(); };
    window.onOcclusionCardAdded = async function () {
      occlusionFormTags = [];
      renderTagInput(els.occlusionCardTags, occlusionFormTags, function (next) { occlusionFormTags = next; });
      await refreshKnownTags();
      await renderEditDeck();
    };
  }

  async function submitNewCard() {
    const front = els.addFront.value.trim();
    const back = els.addBack.value.trim();
    if (!front || !back) {
      (front ? els.addBack : els.addFront).focus();
      return;
    }
    if (!editDeckId) return;
    await addCard(front, back, editDeckId, addFrontImageDataUri, addBackImageDataUri, addFormTags.slice());
    await flushStorageNow('card add');
    els.addFront.value = '';
    els.addBack.value = '';
    addFormTags = [];
    resetAddImageControls();
    renderTagInput(els.addCardTags, addFormTags, function (next) { addFormTags = next; });
    els.addFront.focus();
    await refreshKnownTags();
    await renderEditDeck();

    const original = els.addCardBtn.textContent;
    els.addCardBtn.textContent = t('added');
    setTimeout(function () { els.addCardBtn.textContent = t('addCard'); }, 900);
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
    }, displayDeckName(deck));

    els.editDeckTitle.textContent = displayDeckName(deck);
    const deckCards = cards.filter(function (c) { return c.deckId === deck.id; });
    const dueCount = deckCards.filter(function (c) { return isDue(c, Date.now()); }).length;
    els.editDeckCounts.textContent = t('editCounts', { due: dueCount, total: deckCards.length });

    els.editDeckDeleteBtn.disabled = deck.id === DEFAULT_DECK_ID;

    renderEditDeckCardList(deckCards);
  }

  function renderEditDeckCardList(deckCards) {
    const query = els.editDeckSearch.value.trim().toLowerCase();
    let filtered = deckCards;
    if (query) {
      filtered = filtered.filter(function (c) { return cardMatchesSearch(c, query); });
    }

    els.editDeckCardList.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = deckCards.length === 0 ? t('noCardsInDeck') : t('noCardsMatch');
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
        if (!await openPixelConfirm(t('deleteOcclusionConfirm'), { title: t('delete'), danger: true })) return;
        await deleteCard(card.id);
        await flushStorageNow('card delete');
        if (opts.onChanged) opts.onChanged();
      });
      occlusionActions.appendChild(occlusionDeleteBtn);

      appendTagChips(text, card.tags);
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
    appendTagChips(text, card.tags);

    const actions = document.createElement('div');
    actions.className = 'card-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-btn';
    editBtn.textContent = t('edit');
    editBtn.addEventListener('click', function () { enterCardEditMode(row, card, opts.onChanged); });

    const deleteBtn = buildDeleteButton(async function () {
      const message = t('deleteCardConfirm') + '\n\n"' + truncate(card.front, 60) + '"';
      if (!await openPixelConfirm(message, { title: t('delete'), danger: true })) return;
      await deleteCard(card.id);
      await flushStorageNow('card delete');
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
    removeBtn.textContent = t('removeImage');

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
    frontTa.placeholder = t('front');
    frontTa.title = t('dropImage');
    const frontImageCtl = _buildEditImageControl(frontImage, function (v) { frontImage = v; }, frontTa);

    const backTa = document.createElement('textarea');
    backTa.value = card.back;
    backTa.placeholder = t('back');
    backTa.title = t('dropImage');
    const backImageCtl = _buildEditImageControl(backImage, function (v) { backImage = v; }, backTa);

    let tags = (card.tags || []).slice();
    const tagWrap = document.createElement('div');
    tagWrap.className = 'tag-input';
    renderTagInput(tagWrap, tags, function (next) { tags = next; });

    const actions = document.createElement('div');
    actions.className = 'card-row-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'secondary-btn';
    saveBtn.textContent = t('save');
    saveBtn.addEventListener('click', async function () {
      const front = frontTa.value.trim();
      const back = backTa.value.trim();
      if (!front || !back) return;
      await updateCard(card.id, { front: front, back: back, frontImage: frontImage, backImage: backImage, tags: tags });
      await flushStorageNow('card edit');
      await refreshKnownTags();
      if (onChanged) onChanged();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'secondary-btn';
    cancelBtn.textContent = t('cancel');
    cancelBtn.addEventListener('click', function () { if (onChanged) onChanged(); });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    row.appendChild(frontTa);
    row.appendChild(frontImageCtl);
    row.appendChild(backTa);
    row.appendChild(backImageCtl);
    row.appendChild(tagWrap);
    row.appendChild(actions);
  }

  const TAG_TONES = 10;
  function tagToneIndex(name) {
    let h = 2166136261;
    const s = String(name || '').toLowerCase();
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) % TAG_TONES;
  }
  function makeTagChip(name, removable, onRemove) {
    const chip = document.createElement('span');
    const tagLength = String(name || '').length;
    chip.className = 'tag-chip';
    chip.dataset.tone = String(tagToneIndex(name));
    chip.dataset.tagLen = String(tagLength);
    if (tagLength > 28) chip.style.setProperty('--tag-fit-size', '0.5rem');
    else if (tagLength > 18) chip.style.setProperty('--tag-fit-size', '0.56rem');
    else if (tagLength > 12) chip.style.setProperty('--tag-fit-size', '0.64rem');
    const label = document.createElement('span');
    label.className = 'tag-chip-text';
    label.textContent = name;
    chip.appendChild(label);
    if (removable) {
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', t('delete'));
      x.addEventListener('click', function () { if (onRemove) onRemove(); });
      chip.appendChild(x);
    }
    return chip;
  }

  function appendTagChips(parent, tags) {
    if (!tags || !tags.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'card-row-tags';
    tags.forEach(function (tag) {
      wrap.appendChild(makeTagChip(tag, false));
    });
    parent.appendChild(wrap);
  }

  function renderTagInput(container, tags, onChange) {
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('tag-input');
    const current = (tags || []).slice();

    function commit(next) {
      onChange(next);
      renderTagInput(container, next, onChange);
    }

    current.forEach(function (tag) {
      container.appendChild(makeTagChip(tag, true, function () {
        commit(current.filter(function (t) { return t !== tag; }));
      }));
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('tagsPlaceholder');
    input.setAttribute('aria-label', t('tags'));
    container.appendChild(input);

    const suggest = document.createElement('div');
    suggest.className = 'tag-suggest';
    suggest.hidden = true;
    container.appendChild(suggest);

    function addTag(raw) {
      const value = String(raw || '').replace(/^#/, '').trim();
      if (!value) return;
      if (current.some(function (t) { return t.toLowerCase() === value.toLowerCase(); })) {
        input.value = '';
        suggest.hidden = true;
        return;
      }
      rememberTag(value);
      commit(current.concat([value]));
    }

    function showSuggest() {
      const q = input.value.trim().toLowerCase();
      const opts = knownTags.filter(function (tag) {
        if (current.some(function (c) { return c.toLowerCase() === tag.toLowerCase(); })) return false;
        return !q || tag.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);
      suggest.innerHTML = '';
      opts.forEach(function (tag) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-suggest-item';
        btn.appendChild(makeTagChip(tag, false));
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          addTag(tag);
        });
        suggest.appendChild(btn);
      });
      const typed = input.value.replace(/^#/, '').trim();
      const exact = typed && knownTags.some(function (tag) { return tag.toLowerCase() === typed.toLowerCase(); });
      if (typed && !exact) {
        const create = document.createElement('button');
        create.type = 'button';
        create.className = 'tag-suggest-create';
        create.textContent = t('createTag', { name: typed });
        create.addEventListener('mousedown', function (e) {
          e.preventDefault();
          addTag(typed);
        });
        suggest.appendChild(create);
      }
      suggest.hidden = suggest.childNodes.length === 0;
    }

    input.addEventListener('input', showSuggest);
    input.addEventListener('focus', showSuggest);
    input.addEventListener('blur', function () { setTimeout(function () { suggest.hidden = true; }, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(input.value);
      } else if (e.key === 'Backspace' && !input.value && current.length) {
        commit(current.slice(0, -1));
      }
    });
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function speciesLabel(id) {
    return t(id);
  }

  function animalStoreVisibility(speciesId) {
    if (window.StudyEconomy && window.StudyEconomy.visibilityFor) {
      return window.StudyEconomy.visibilityFor(economy.animals, economy.unlockedAnimals, speciesId);
    }
    return { tier: 'visible', offset: 0 };
  }

  function rememberUnlockedAnimal(speciesId) {
    if (window.StudyEconomy && window.StudyEconomy.unlockedAnimals) {
      economy.unlockedAnimals = window.StudyEconomy.unlockedAnimals(
        economy.animals,
        (economy.unlockedAnimals || []).concat([speciesId])
      );
      return;
    }
    const unlocked = economy.unlockedAnimals || [];
    if (unlocked.indexOf(speciesId) === -1) {
      economy.unlockedAnimals = unlocked.concat([speciesId]);
    }
  }

  function updateStoreSectionLabels() {
    if (els.storeAnimalsLabel) {
      els.storeAnimalsLabel.textContent = t('storeAnimals') + ' · ' + t('moneyPerCard', {
        rate: formatCurrency(bucksPerRating(economy.animals))
      }) + ' · ' + t('moneyPerHour', {
        rate: formatCurrency(passiveBucksPerHour())
      });
    }
    if (els.storeFarmLabel) {
      els.storeFarmLabel.textContent = t('storeFarm') + ' · ' + t('farmBoostTotal', {
        pct: boostPercent(farmBoostMultiplier())
      });
    }
  }

  function activeTabName() {
    const active = (els.tabBtns || []).find(function (b) { return b.classList.contains('active'); });
    return active ? active.dataset.tab : '';
  }

  function animalInstanceIdForNode(node) {
    if (!node) return '';
    return node.dataset.instanceId || (node.dataset.species + '-' + node.dataset.index);
  }

  function defaultAnimalNameForNode(node) {
    if (!node) return t('animal');
    const index = Number(node.dataset.index) || 1;
    return speciesLabel(node.dataset.species || 'pigs') + ' ' + index;
  }

  function animalNameForNode(node) {
    const id = animalInstanceIdForNode(node);
    const custom = id && economy.animalNames && economy.animalNames[id];
    return custom || defaultAnimalNameForNode(node);
  }

  function syncAnimalNameAttributes(scope) {
    const root = scope || els.pigField;
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.animal-scatter'), function (node) {
      const name = animalNameForNode(node);
      const id = animalInstanceIdForNode(node);
      node.dataset.animalName = name;
      node.dataset.animalHappiness = String(animalHappinessValue(id));
      node.title = name;
      node.setAttribute('aria-label', name);
    });
  }

  function _storePlacingActive() {
    return !!document.querySelector('.store-place-preview');
  }

  function clientXInFarmArea(clientX) {
    if (isCompactLayout()) return document.documentElement.classList.contains('farm-tab');
    const x = Number(clientX);
    if (!Number.isFinite(x)) return true;
    const root = document.documentElement;
    const vw = root.clientWidth || window.innerWidth || 1;
    const raw = getComputedStyle(root).getPropertyValue('--content-width');
    const contentW = Number.parseFloat(raw) || 640;
    const gutter = Math.max(12, (vw - contentW) / 2);
    const gapLeft = gutter;
    const gapRight = vw - gutter;
    return x < gapLeft || x > gapRight;
  }

  function farmPointerInteractionBlocked(target, clientX) {
    if (!els.pigField || els.pigField.classList.contains('sell-mode')) return true;
    if (isSleepFocusActive()) return true;
    if (activeTabName() === 'store') return true;
    if (els.app && els.app.hidden) return true;
    if (_storePlacingActive()) return true;
    if (!target || !target.closest) return !clientXInFarmArea(clientX);
    if (target.closest('#top-nav, #tab-row, #tab-nav, #auth-screen, .overlay-card, #shortcuts-overlay, #new-deck-overlay, #text-prompt-overlay, #pixel-modal-overlay, #animal-detail-overlay, #settings-overlay, #loading-overlay, #pig-encouragement-overlay, button, a, input, textarea, select, label')) return true;
    return !clientXInFarmArea(clientX);
  }

  function animalNameInteractionBlocked(target, clientX) {
    return farmPointerInteractionBlocked(target, clientX);
  }

  function hitAnimalForEvent(e) {
    if (!e || animalNameInteractionBlocked(e.target, e.clientX)) return null;
    if (typeof fieldAnimalAtPoint !== 'function') return null;
    return fieldAnimalAtPoint(e.clientX, e.clientY);
  }

  let _animalNameTip = null;
  function ensureAnimalNameTip() {
    if (_animalNameTip) return _animalNameTip;
    _animalNameTip = document.createElement('div');
    _animalNameTip.className = 'animal-name-tip';
    _animalNameTip.hidden = true;
    document.body.appendChild(_animalNameTip);
    return _animalNameTip;
  }

  function positionAnimalNameTip(clientX, clientY) {
    if (!_animalNameTip || _animalNameTip.hidden) return;
    const pad = 12;
    const tw = _animalNameTip.offsetWidth || 90;
    const th = _animalNameTip.offsetHeight || 24;
    let x = clientX + pad;
    let y = clientY - th - pad;
    if (x + tw > window.innerWidth - 8) x = clientX - tw - pad;
    if (x < 8) x = 8;
    if (y < 8) y = clientY + pad;
    if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
    _animalNameTip.style.left = x + 'px';
    _animalNameTip.style.top = y + 'px';
  }

  function hideAnimalNameTip() {
    if (_animalNameTip) _animalNameTip.hidden = true;
  }

  function compactAnimalNames(names, species, removedIndex) {
    const next = {};
    Object.keys(names || {}).forEach(function (key) {
      const parts = key.split('-');
      const spec = parts[0];
      const idx = Number(parts[1]);
      if (spec !== species) {
        next[key] = names[key];
        return;
      }
      if (!Number.isInteger(idx) || idx === removedIndex) return;
      next[spec + '-' + (idx > removedIndex ? idx - 1 : idx)] = names[key];
    });
    return next;
  }

  function compactAnimalHappiness(happiness, species, removedIndex) {
    const next = {};
    Object.keys(happiness || {}).forEach(function (key) {
      const parts = key.split('-');
      const spec = parts[0];
      const idx = Number(parts[1]);
      if (spec !== species) {
        next[key] = happiness[key];
        return;
      }
      if (!Number.isInteger(idx) || idx === removedIndex) return;
      next[spec + '-' + (idx > removedIndex ? idx - 1 : idx)] = happiness[key];
    });
    return next;
  }

  function animalHappinessValue(instanceId) {
    const n = economy.animalHappiness && Number(economy.animalHappiness[instanceId]);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function animalProductivityPercent(instanceId) {
    const multiplier = window.StudyEconomy && window.StudyEconomy.animalProductivityMultiplier
      ? window.StudyEconomy.animalProductivityMultiplier(economy.animalHappiness, instanceId)
      : 1 + animalHappinessValue(instanceId) * 0.0025;
    return Math.round((multiplier - 1) * 100);
  }

  let _animalDetailOverlay = null;
  let _animalDetailStop = null;

  function closeAnimalDetail() {
    if (_animalDetailStop) {
      _animalDetailStop();
      _animalDetailStop = null;
    }
    if (_animalDetailOverlay) _animalDetailOverlay.hidden = true;
  }

  function ensureAnimalDetailOverlay() {
    if (_animalDetailOverlay) return _animalDetailOverlay;
    const overlay = document.createElement('div');
    overlay.id = 'animal-detail-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="overlay-card animal-detail-card" role="dialog" aria-modal="true">' +
        '<h2 class="animal-detail-title"></h2>' +
        '<div class="animal-detail-body">' +
          '<div class="animal-detail-sprite" aria-hidden="true"></div>' +
          '<label class="animal-detail-name-field"><span></span><input type="text" maxlength="36"></label>' +
          '<div class="animal-detail-stats">' +
            '<span data-stat="happiness"></span>' +
            '<span data-stat="productivity"></span>' +
          '</div>' +
        '</div>' +
        '<div class="text-prompt-actions animal-detail-actions">' +
          '<button type="button" class="secondary-btn" data-action="pet"></button>' +
          '<button type="button" class="secondary-btn" data-action="close"></button>' +
          '<button type="button" class="primary-btn" data-action="save"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closeAnimalDetail();
    });
    document.addEventListener('keydown', function (e) {
      if (!_animalDetailOverlay || _animalDetailOverlay.hidden) return;
      if (e.key === 'Escape') closeAnimalDetail();
    });
    _animalDetailOverlay = overlay;
    return overlay;
  }

  async function openAnimalDetail(node) {
    if (!node) return;
    const id = animalInstanceIdForNode(node);
    if (!id) return;
    hideAnimalNameTip();
    const overlay = ensureAnimalDetailOverlay();
    const card = overlay.querySelector('.animal-detail-card');
    const title = overlay.querySelector('.animal-detail-title');
    const spriteSlot = overlay.querySelector('.animal-detail-sprite');
    const label = overlay.querySelector('.animal-detail-name-field span');
    const input = overlay.querySelector('.animal-detail-name-field input');
    const happinessStat = overlay.querySelector('[data-stat="happiness"]');
    const productivityStat = overlay.querySelector('[data-stat="productivity"]');
    const petBtn = overlay.querySelector('[data-action="pet"]');
    const closeBtn = overlay.querySelector('[data-action="close"]');
    const saveBtn = overlay.querySelector('[data-action="save"]');

    function refreshStats() {
      const happiness = animalHappinessValue(id);
      happinessStat.textContent = t('animalHappiness', { pct: Math.round(happiness) });
      productivityStat.textContent = t('animalProductivity', { pct: animalProductivityPercent(id) });
      petBtn.disabled = happiness >= 100;
    }

    if (_animalDetailStop) {
      _animalDetailStop();
      _animalDetailStop = null;
    }
    title.textContent = animalNameForNode(node);
    label.textContent = t('name');
    input.placeholder = t('animalNamePlaceholder');
    input.value = animalNameForNode(node);
    petBtn.textContent = t('petAnimal');
    closeBtn.textContent = t('close');
    saveBtn.textContent = t('save');
    spriteSlot.textContent = '';
    if (window.PixelSprites && window.PixelSprites.renderAnimal) {
      const states = ['stand', 'walk', 'sit', 'sleep'];
      const state = states[Math.floor(Math.random() * states.length)];
      const sprite = window.PixelSprites.renderAnimal(node.dataset.species || 'pigs', {
        state: state,
        variant: Number(node.dataset.variant || node.dataset.index || 0)
      });
      spriteSlot.appendChild(sprite);
      _animalDetailStop = window.PixelSprites.animate ? window.PixelSprites.animate(sprite, state, state === 'walk' ? 5 : 2) : null;
    }
    refreshStats();

    saveBtn.onclick = async function () {
      const next = input.value.trim();
      if (!next) return;
      economy.animalNames = Object.assign({}, economy.animalNames || {});
      economy.animalNames[id] = next;
      title.textContent = next;
      await persistEconomy();
      syncAnimalNameAttributes();
      refreshStoreAffordances();
      closeAnimalDetail();
    };
    closeBtn.onclick = closeAnimalDetail;
    petBtn.onclick = async function () {
      economy.animalHappiness = Object.assign({}, economy.animalHappiness || {});
      economy.animalHappiness[id] = Math.min(100, animalHappinessValue(id) + PET_HAPPINESS_GAIN);
      await persistEconomy();
      syncAnimalNameAttributes();
      refreshStats();
      refreshStoreAffordances();
    };

    if (card) card.setAttribute('aria-label', t('animalDetails'));
    overlay.hidden = false;
    setTimeout(function () { input.focus(); input.select(); }, 0);
  }

  function bindAnimalNames() {
    if (!els.pigField || els.pigField.dataset.namesBound) return;
    els.pigField.dataset.namesBound = '1';
    window.addEventListener('pointermove', function (e) {
      const node = hitAnimalForEvent(e);
      if (!node || window.StudyFieldGestureMoved) {
        hideAnimalNameTip();
        return;
      }
      const tip = ensureAnimalNameTip();
      tip.textContent = animalNameForNode(node);
      tip.hidden = false;
      positionAnimalNameTip(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener('pointerdown', function () {
      hideAnimalNameTip();
    }, { capture: true, passive: true });
    window.addEventListener('click', function (e) {
      const node = hitAnimalForEvent(e);
      if (!node || window.StudyFieldGestureMoved) return;
      e.preventDefault();
      e.stopPropagation();
      openAnimalDetail(node);
    }, true);
  }

  let _farmObjectTip = null;

  function ensureFarmObjectTip() {
    if (_farmObjectTip) return _farmObjectTip;
    _farmObjectTip = document.createElement('div');
    _farmObjectTip.className = 'animal-name-tip farm-object-tip';
    _farmObjectTip.hidden = true;
    document.body.appendChild(_farmObjectTip);
    return _farmObjectTip;
  }

  function hideFarmObjectTip() {
    if (_farmObjectTip) _farmObjectTip.hidden = true;
  }

  function farmObjectInteractionBlocked(target, clientX) {
    return farmPointerInteractionBlocked(target, clientX);
  }

  function fieldObjectAtPoint(selector, x, y) {
    if (!els.pigField) return null;
    let hit = null;
    Array.prototype.forEach.call(els.pigField.querySelectorAll(selector), function (node) {
      const r = node.getBoundingClientRect();
      const pad = 8;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) hit = node;
    });
    return hit;
  }

  function troughFullnessValue(tr) {
    if (typeof window.troughFullness === 'function') return window.troughFullness(tr);
    const filledAt = Number(tr && tr.filledAt) || 0;
    if (!filledAt) return 0;
    return Math.max(0, Math.min(1, 1 - ((Date.now() - filledAt) / (30 * 60 * 1000))));
  }

  function farmObjectTipText(node) {
    if (!node) return '';
    if (node.classList.contains('trough-object')) {
      const tr = (economy.troughs || []).find(function (item) { return item.id === node.dataset.id; });
      const pct = Math.round(troughFullnessValue(tr) * 100);
      return t('troughFullness', { pct: pct });
    }
    if (node.classList.contains('coop-object')) {
      const coop = (economy.coops || []).find(function (item) { return item.id === node.dataset.id; });
      const eggs = Math.round(((coop && coop.eggValue) || 0) * 100) / 100;
      if (eggs > 0) return t('coopEggHover', { eggs: eggCountLabel(coopEggDisplayCount(coop)), price: formatCurrency(eggs) });
      return t('coopEggEmpty');
    }
    if (node.classList.contains('flower-object')) {
      const spec = flowerSpec(node.dataset.flowerType);
      if (!spec) return '';
      return t(spec.nameKey) + ' · ' + formatBonus(spec.bonus);
    }
    return '';
  }

  async function refillTrough(troughId) {
    if (!troughId || isSleepFocusActive()) return;
    let changed = false;
    economy.troughs = (economy.troughs || []).map(function (tr) {
      if (tr.id !== troughId) return tr;
      changed = true;
      return Object.assign({}, tr, { filledAt: Date.now() });
    });
    if (!changed) return;
    await persistEconomy();
    renderPensAndTroughs(els.pigField);
    refreshStoreAffordances();
  }

  function bindFarmObjectInteractions() {
    if (!els.pigField || els.pigField.dataset.objectInteractionsBound) return;
    els.pigField.dataset.objectInteractionsBound = '1';
    window.addEventListener('pointermove', function (e) {
      if (farmObjectInteractionBlocked(e.target, e.clientX) || window.StudyFieldGestureMoved || hitAnimalForEvent(e)) {
        hideFarmObjectTip();
        return;
      }
      const node = fieldObjectAtPoint('.trough-object, .coop-object, .flower-object', e.clientX, e.clientY);
      const text = farmObjectTipText(node);
      if (!node || !text) {
        hideFarmObjectTip();
        return;
      }
      const tip = ensureFarmObjectTip();
      tip.textContent = text;
      tip.hidden = false;
      const pad = 12;
      const tw = tip.offsetWidth || 120;
      const th = tip.offsetHeight || 24;
      let x = e.clientX + pad;
      let y = e.clientY - th - pad;
      if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad;
      if (x < 8) x = 8;
      if (y < 8) y = e.clientY + pad;
      if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }, { passive: true });
    window.addEventListener('pointerdown', hideFarmObjectTip, { capture: true, passive: true });
    window.addEventListener('click', function (e) {
      if (farmObjectInteractionBlocked(e.target, e.clientX) || window.StudyFieldGestureMoved || hitAnimalForEvent(e)) return;
      const node = fieldObjectAtPoint('.trough-object, .coop-object', e.clientX, e.clientY);
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      if (node.classList.contains('trough-object')) {
        refillTrough(node.dataset.id);
      } else if (node.classList.contains('coop-object')) {
        sellCoopEggs(node.dataset.id, e);
      }
      hideFarmObjectTip();
    }, true);
  }

  function syncStoreQuantityToggle() {
    if (!els.storeQuantityToggle) return;
    Array.prototype.forEach.call(els.storeQuantityToggle.querySelectorAll('[data-store-qty]'), function (btn) {
      const active = Number(btn.dataset.storeQty) === storeBuyQuantity;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindStoreView() {
    if (!els.storeQuantityToggle || els.storeQuantityToggle.dataset.bound) return;
    els.storeQuantityToggle.dataset.bound = '1';
    els.storeQuantityToggle.addEventListener('click', function (e) {
      const btn = e.target.closest && e.target.closest('[data-store-qty]');
      if (!btn) return;
      const qty = Number(btn.dataset.storeQty);
      storeBuyQuantity = qty === 10 ? 10 : 1;
      syncStoreQuantityToggle();
      renderStore();
    });
  }

  function fillPixelThumb(container, kind, name, opts) {
    if (!container) return;
    container.innerHTML = '';
    if (window.PixelSprites) {
      const sprite = kind === 'icon'
        ? window.PixelSprites.renderIcon(name)
        : window.PixelSprites.renderAnimal(name, opts || {});
      container.appendChild(sprite);
    }
  }

  function fillFlowerThumb(container, typeId) {
    if (!container) return;
    container.innerHTML = '';
    if (window.StudyFlowers && window.StudyFlowers.render) {
      container.appendChild(window.StudyFlowers.render(typeId));
    }
  }

  function storeBatchPrice(unitPrice, quantity) {
    return Math.round((unitPrice || 0) * Math.max(1, quantity || 1) * 100) / 100;
  }

  function storeOwnedBadge(count, label) {
    const badge = document.createElement('span');
    badge.className = 'store-owned-badge';
    badge.textContent = label === '???'
      ? '???'
      : t('ownedBadge', {
        n: count || 0,
        label: label || t('owned')
      });
    return badge;
  }

  function appendStoreInfo(parent, nameText, ownedCount, ownedLabel, metaText) {
    const titleLine = document.createElement('div');
    titleLine.className = 'store-row-title-line';
    const name = document.createElement('div');
    name.className = 'store-row-name';
    name.textContent = nameText;
    titleLine.appendChild(name);
    titleLine.appendChild(storeOwnedBadge(ownedCount, ownedLabel));
    const meta = document.createElement('div');
    meta.className = 'store-row-meta';
    meta.textContent = metaText || '';
    parent.appendChild(titleLine);
    parent.appendChild(meta);
  }

  function storeBuyButton(text, price, disabled, title, onClick, requiredBucks) {
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'secondary-btn store-buy-btn';
    buy.textContent = t(text, { price: formatCurrency(price) });
    buy.dataset.storePrice = String(Number(price) || 0);
    buy.dataset.storeRequires = String(requiredBucks == null ? (Number(price) || 0) : (Number(requiredBucks) || 0));
    buy.disabled = !!disabled;
    buy.title = title || (disabled ? t('notEnoughBucks') : '');
    buy.addEventListener('click', onClick);
    return buy;
  }

  function refreshStoreAffordances() {
    updateBucksDisplay();
    updateStoreSectionLabels();
    if (!els.views || !els.views.store || !els.views.store.classList.contains('active')) return;
    Array.prototype.forEach.call(els.views.store.querySelectorAll('.store-buy-btn[data-store-requires]'), function (btn) {
      const required = Number(btn.dataset.storeRequires) || 0;
      const disabled = economy.bucks < required;
      btn.disabled = disabled;
      btn.title = disabled ? t('notEnoughBucks') : '';
    });
  }

  function normalizePlacementBatch(payload, quantity) {
    const needed = Math.max(1, quantity || 1);
    if (Array.isArray(payload)) return payload.slice(0, needed);
    const single = payload || {};
    const out = [];
    for (let i = 0; i < needed; i++) out.push(Object.assign({}, single));
    return out;
  }

  async function renderStore() {
    await accrueCoopEggs({ reason: 'store render', renderStore: false, flush: false });
    updateBucksDisplay();
    syncStoreQuantityToggle();
    const active = (els.tabBtns || []).find(function (b) { return b.classList.contains('active'); });
    applySellMode(!isSleepFocusActive() && sellModeForTab(active ? active.dataset.tab : 'store'));
    updateStoreSectionLabels();

    els.storeAnimalList.innerHTML = '';
    ANIMAL_SHOP.forEach(function (spec) {
      const owned = (economy.animals[spec.id] || 0);
      const price = buyPrice(spec.id, owned);
      const visibility = animalStoreVisibility(spec.id);
      const row = document.createElement('div');
      row.className = 'store-row';
      row.classList.toggle('is-locked-preview', visibility.tier === 'silhouette');
      row.classList.toggle('is-locked-full', visibility.tier === 'hidden');
      const thumb = document.createElement('div');
      thumb.className = 'store-thumb';
      if (visibility.tier === 'hidden') {
        thumb.classList.add('is-mystery');
        fillPixelThumb(thumb, 'icon', 'help');
      } else {
        if (visibility.tier === 'silhouette') thumb.classList.add('is-silhouette');
        fillPixelThumb(thumb, 'animal', spec.id, { state: 'stand', variant: owned });
      }
      const info = document.createElement('div');
      info.className = 'store-row-info';
      let ownedLabel = t('owned');
      let metaText = '';
      if (visibility.tier === 'hidden') {
        ownedLabel = '???';
        metaText = '???';
      } else if (visibility.tier === 'silhouette') {
        ownedLabel = '???';
        metaText = t('animalLockedHint');
      } else {
        metaText = '';
      }
      appendStoreInfo(info, visibility.tier === 'visible' ? speciesLabel(spec.id) : '???', owned, ownedLabel, metaText);
      const actions = document.createElement('div');
      actions.className = 'store-row-actions';
      if (visibility.tier === 'visible') {
        const qty = storeBuyQuantity === 10 ? 10 : 1;
        const batchPrice = storeBatchPrice(price, qty);
        actions.appendChild(storeBuyButton('buyPrice', batchPrice, economy.bucks < batchPrice, '', function (e) { buyAnimal(spec.id, e, qty); }));
      } else {
        const locked = document.createElement('button');
        locked.type = 'button';
        locked.className = 'secondary-btn store-buy-btn';
        locked.textContent = visibility.tier === 'hidden'
          ? t('buyUnknownPrice')
          : t('buyPrice', { price: formatCurrency(storeBatchPrice(price, storeBuyQuantity)) });
        locked.disabled = true;
        locked.title = t('animalLockedHint');
        actions.appendChild(locked);
      }
      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(actions);
      els.storeAnimalList.appendChild(row);
    });

    if (els.storeFarmList) {
      els.storeFarmList.innerHTML = '';
      const penCount = (economy.pens || []).length;
      const troughCount = (economy.troughs || []).length;
      const coopCount = (economy.coops || []).length;
      const samplePen = penPriceForSize(8, 14);
      const troughPrice = troughBuyPrice();
      const coopPrice = coopBuyPrice();
      const eggs = Math.round(coopEggValue() * 100) / 100;
      const eggLabel = eggCountLabel(coopEggDisplayTotal());
      const eggHourly = Math.round(coopHourlyTotal() * 100) / 100;

      function farmRow(name, meta, icon, actionsBuilder, opts) {
        opts = opts || {};
        const row = document.createElement('div');
        row.className = 'store-row';
        const thumb = document.createElement('div');
        thumb.className = 'store-thumb';
        if (opts.flowerType) fillFlowerThumb(thumb, opts.flowerType);
        else fillPixelThumb(thumb, 'icon', icon);
        const info = document.createElement('div');
        info.className = 'store-row-info';
        appendStoreInfo(info, name, opts.owned || 0, opts.ownedLabel || t('owned'), meta);
        const actions = document.createElement('div');
        actions.className = 'store-row-actions';
        if (actionsBuilder) actionsBuilder(actions);
        row.appendChild(thumb);
        row.appendChild(info);
        row.appendChild(actions);
        els.storeFarmList.appendChild(row);
      }
      farmRow(
        t('pen'),
        '',
        'fence',
        function (actions) {
          actions.appendChild(storeBuyButton('buyFromPrice', samplePen, economy.bucks < samplePen * 0.25, '', function (e) { buyPen(e); }, samplePen * 0.25));
        },
        { owned: penCount }
      );
      farmRow(
        t('trough'),
        '',
        'trough',
        function (actions) {
          actions.appendChild(storeBuyButton('buyPrice', troughPrice, economy.bucks < troughPrice, '', function (e) { buyTrough(e); }));
        },
        { owned: troughCount }
      );
      farmRow(
        t('coop'),
        t('coopMeta', { eggs: eggLabel, price: formatCurrency(eggs), rate: formatCurrency(eggHourly) }),
        'coop',
        function (actions) {
          actions.appendChild(storeBuyButton('buyPrice', coopPrice, economy.bucks < coopPrice, '', function (e) { buyCoop(e); }));
        },
        { owned: coopCount }
      );

      const flowers = flowerShop();
      if (flowers.length) {
        const header = document.createElement('div');
        header.className = 'store-section-label';
        header.textContent = t('storeFlowers') + ' · ' + t('flowerBonusTotal', { pct: flowerBonusPercent(economy.flowers) });
        els.storeFarmList.appendChild(header);
        flowers.forEach(function (spec) {
          const owned = flowerOwnedCount(spec.id);
          const price = flowerPrice(spec.id, owned);
          farmRow(
            t(spec.nameKey),
            t('flowerMeta', { bonus: formatBonus(spec.bonus) }),
            '',
            function (actions) {
              const qty = storeBuyQuantity === 10 ? 10 : 1;
              const batchPrice = storeBatchPrice(price, qty);
              actions.appendChild(storeBuyButton('buyPrice', batchPrice, economy.bucks < batchPrice, '', function (e) { buyFlower(spec.id, e, qty); }));
            },
            { flowerType: spec.id, owned: owned, ownedLabel: t('planted') }
          );
        });
      }
    }

  }

  async function buyAnimal(speciesId, event, quantity) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before buy animal', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    quantity = Math.max(1, quantity || 1);
    const owned = economy.animals[speciesId] || 0;
    const unitPrice = buyPrice(speciesId, owned);
    const price = storeBatchPrice(unitPrice, quantity);
    if (animalStoreVisibility(speciesId).tier !== 'visible') return;
    if (economy.bucks < price) return;
    const nextIndex = owned + 1;
    const name = speciesLabel(speciesId);
    if (isCompactLayout()) switchTab('farm');
    const started = typeof startAnimalPlacement === 'function' && startAnimalPlacement(els.pigField, speciesId, nextIndex, {
      quantity: quantity,
      batchRadiusPx: quantity > 1 ? 36 : undefined,
      clientX: event && event.clientX,
      clientY: event && event.clientY,
      banner: t('placeStoreItem', { name: quantity > 1 ? t('storeItemQuantity', { n: quantity, name: name }) : name }),
      priceText: formatCurrency(price),
      onConfirm: async function (placementPayload) {
        await accruePassiveIncome({ reason: 'place animal', renderStore: false });
        await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
        if (economy.bucks < price) return;
        const placements = normalizePlacementBatch(placementPayload, quantity);
        economy.bucks = Math.round((economy.bucks - price) * 100) / 100;
        economy.animals[speciesId] = owned + quantity;
        rememberUnlockedAnimal(speciesId);
        economy.animalPlacements = Object.assign({}, economy.animalPlacements || {});
        for (let i = 0; i < quantity; i++) {
          const index = owned + 1 + i;
          const placement = placements[i] || placements[placements.length - 1] || {};
          economy.animalPlacements[speciesId + '-' + index] = placement;
        }
        await persistEconomy();
        if (typeof addScatterAnimalAt === 'function') {
          for (let i = 0; i < quantity; i++) {
            const index = owned + 1 + i;
            await addScatterAnimalAt(els.pigField, speciesId, index, placements[i] || placements[placements.length - 1]);
          }
        }
        syncAnimalNameAttributes();
        await renderStore();
      }
    });
    if (!started) await renderStore();
  }

  async function buyPen() {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before buy pen', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    if (isCompactLayout()) switchTab('farm');
    startPenPlacement({
      banner: (isCompactLayout() || document.documentElement.classList.contains('farm-tab'))
        ? t('placePenFarm')
        : t('placePen'),
      priceFn: penPriceForSize,
      formatPrice: function (p) { return formatCurrency(p); },
      onConfirm: async function (payload) {
        await accruePassiveIncome({ reason: 'place pen', renderStore: false });
        await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
        if (economy.bucks < payload.paid) return;
        economy.bucks = Math.round((economy.bucks - payload.paid) * 100) / 100;
        payload.id = generateId();
        economy.pens = (economy.pens || []).concat([payload]);
        await persistEconomy();
        renderPensAndTroughs(els.pigField);
        await renderStore();
      }
    });
  }

  async function buyTrough(event) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before buy trough', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const price = troughBuyPrice();
    if (economy.bucks < price) return;
    if (isCompactLayout()) switchTab('farm');
    const trough = { id: generateId(), paid: price, filledAt: Date.now() };
    const started = typeof startTroughPlacement === 'function' && startTroughPlacement(els.pigField, trough, {
      clientX: event && event.clientX,
      clientY: event && event.clientY,
      banner: t('placeStoreItem', { name: t('trough') }),
      priceText: formatCurrency(price),
      onConfirm: async function (placement) {
        await accruePassiveIncome({ reason: 'place trough', renderStore: false });
        if (economy.bucks < price) return;
        economy.bucks = Math.round((economy.bucks - price) * 100) / 100;
        economy.troughs = (economy.troughs || []).concat([Object.assign({}, trough, placement)]);
        await persistEconomy();
        renderPensAndTroughs(els.pigField);
        await renderStore();
      }
    });
    if (!started) await renderStore();
  }

  async function buyCoop(event) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before buy coop', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const price = coopBuyPrice();
    if (economy.bucks < price) return;
    if (isCompactLayout()) switchTab('farm');
    const coop = { id: generateId(), paid: price, eggValue: 0, eggCarry: 0, totalEggValue: 0, lastEggAt: Date.now() };
    const started = typeof startCoopPlacement === 'function' && startCoopPlacement(els.pigField, coop, {
      clientX: event && event.clientX,
      clientY: event && event.clientY,
      banner: t('placeStoreItem', { name: t('coop') }),
      priceText: formatCurrency(price),
      onConfirm: async function (placement) {
        await accruePassiveIncome({ reason: 'place coop', renderStore: false });
        await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
        if (economy.bucks < price) return;
        economy.bucks = Math.round((economy.bucks - price) * 100) / 100;
        economy.coops = (economy.coops || []).concat([Object.assign({}, coop, placement, { lastEggAt: Date.now() })]);
        await persistEconomy();
        renderPensAndTroughs(els.pigField);
        await renderStore();
      }
    });
    if (!started) await renderStore();
  }

  async function buyFlower(typeId, event, quantity) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before buy flower', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    quantity = Math.max(1, quantity || 1);
    const owned = flowerOwnedCount(typeId);
    const unitPrice = flowerPrice(typeId, owned);
    const price = storeBatchPrice(unitPrice, quantity);
    const spec = flowerSpec(typeId);
    if (!spec || economy.bucks < price) return;
    if (isCompactLayout()) switchTab('farm');
    const flower = { type: typeId, paid: unitPrice };
    const started = typeof startFlowerPlacement === 'function' && startFlowerPlacement(els.pigField, flower, {
      quantity: quantity,
      dragToPlace: quantity > 1,
      batchRadiusPx: quantity > 1 ? 30 : undefined,
      clientX: event && event.clientX,
      clientY: event && event.clientY,
      banner: t('placeStoreItem', { name: quantity > 1 ? t('storeItemQuantity', { n: quantity, name: t(spec.nameKey) }) : t(spec.nameKey) }),
      priceText: formatCurrency(price),
      onConfirm: async function (placementPayload) {
        await accruePassiveIncome({ reason: 'place flower', renderStore: false });
        if (economy.bucks < price) return;
        const placements = normalizePlacementBatch(placementPayload, quantity);
        const nextFlowers = placements.map(function (placement) {
          return Object.assign({ id: generateId(), type: typeId, paid: unitPrice }, placement || {});
        });
        economy.bucks = Math.round((economy.bucks - price) * 100) / 100;
        economy.flowers = (economy.flowers || []).concat(nextFlowers);
        await persistEconomy();
        renderPensAndTroughs(els.pigField);
        await renderStore();
      }
    });
    if (!started) await renderStore();
  }

  async function sellPen(penId) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell pen', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const pen = (economy.pens || []).find(function (p) { return p.id === penId; });
    if (!pen) return;
    const refund = Math.round((pen.paid || 0) * 0.5 * 100) / 100;
    economy.bucks = Math.round((economy.bucks + refund) * 100) / 100;
    showMoneyFloat(refund, null);
    removePen(els.pigField, penId);
    await persistEconomy();
    await renderStore();
  }

  async function sellTrough(troughId) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell trough', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const tr = (economy.troughs || []).find(function (p) { return p.id === troughId; });
    if (!tr) return;
    const refund = Math.round((tr.paid || 0) * 0.5 * 100) / 100;
    economy.bucks = Math.round((economy.bucks + refund) * 100) / 100;
    showMoneyFloat(refund, null);
    removeTrough(els.pigField, troughId);
    await persistEconomy();
    await renderStore();
  }

  async function sellCoop(coopId) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell coop', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const coop = (economy.coops || []).find(function (p) { return p.id === coopId; });
    if (!coop) return;
    const refund = Math.round((coop.paid || 0) * 0.5 * 100) / 100;
    const eggs = Math.round((coop.eggValue || 0) * 100) / 100;
    economy.bucks = Math.round((economy.bucks + refund + eggs) * 100) / 100;
    showMoneyFloat(refund + eggs, null);
    if (typeof removeCoop === 'function') removeCoop(els.pigField, coopId);
    await persistEconomy();
    await renderStore();
  }

  async function sellCoopEggs(coopId, source) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell eggs', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const eggs = Math.round((coopId
      ? ((economy.coops || []).find(function (coop) { return coop.id === coopId; }) || {}).eggValue
      : coopEggValue()) * 100) / 100;
    if (eggs <= 0) return;
    economy.bucks = Math.round((economy.bucks + eggs) * 100) / 100;
    economy.coops = (economy.coops || []).map(function (coop) {
      if (coopId && coop.id !== coopId) return coop;
      return Object.assign({}, coop, { eggValue: 0, eggCount: 0 });
    });
    showMoneyFloat(eggs, source || null);
    await persistEconomy();
    await renderStore();
  }

  async function sellFlower(flowerId) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell flower', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const fl = (economy.flowers || []).find(function (p) { return p.id === flowerId; });
    if (!fl) return;
    const refund = Math.round((fl.paid || 0) * 0.5 * 100) / 100;
    economy.bucks = Math.round((economy.bucks + refund) * 100) / 100;
    showMoneyFloat(refund, null);
    if (typeof removeFlower === 'function') removeFlower(els.pigField, flowerId);
    await persistEconomy();
    await renderStore();
  }

  async function sellAnimalInstance(speciesId, instanceId) {
    if (isSleepFocusActive()) return;
    await accruePassiveIncome({ reason: 'before sell animal', renderStore: false });
    await accrueCoopEggs({ reason: 'before mutation', renderStore: false, flush: false });
    const owned = economy.animals[speciesId] || 0;
    if (owned < 1) return;
    const refund = sellPrice(speciesId, owned);
    const parts = String(instanceId || '').split('-');
    const removedIndex = Number(parts[1]);
    economy.animals[speciesId] = owned - 1;
    economy.bucks = Math.round((economy.bucks + refund) * 100) / 100;
    showMoneyFloat(refund, null);
    if (Number.isInteger(removedIndex)) {
      economy.animalNames = compactAnimalNames(economy.animalNames, speciesId, removedIndex);
      economy.animalHappiness = compactAnimalHappiness(economy.animalHappiness, speciesId, removedIndex);
    }
    await persistEconomy();
    removeScatterAnimal(els.pigField, speciesId, instanceId);
    syncAnimalNameAttributes();
    const active = (els.tabBtns || []).find(function (b) { return b.classList.contains('active'); });
    if (active && active.dataset.tab === 'store') await renderStore();
  }

  let _sellTip = null;
  function hideSellTip() {
    if (_sellTip) _sellTip.hidden = true;
  }
  function positionSellTip(clientX, clientY) {
    if (!_sellTip || _sellTip.hidden) return;
    const pad = 12;
    const tw = _sellTip.offsetWidth || 80;
    const th = _sellTip.offsetHeight || 24;
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + tw > window.innerWidth - 8) x = clientX - tw - pad;
    if (x < 8) x = 8;
    if (y + th > window.innerHeight - 8) y = clientY - th - pad;
    if (y < 8) y = 8;
    _sellTip.style.left = x + 'px';
    _sellTip.style.top = y + 'px';
  }
  function bindAnimalSell() {
    if (!els.pigField || els.pigField.dataset.sellBound) return;
    els.pigField.dataset.sellBound = '1';

    els.pigField.addEventListener('mouseover', function (e) {
      if (!els.pigField.classList.contains('sell-mode')) return;
      const img = e.target.closest && e.target.closest('.animal-scatter');
      const penEl = e.target.closest && e.target.closest('.pen-fence');
      const troughEl = e.target.closest && e.target.closest('.trough-object');
      const coopEl = e.target.closest && e.target.closest('.coop-object');
      const flowerEl = e.target.closest && e.target.closest('.flower-object');
      let text = '';
      if (img) {
        const owned = economy.animals[img.dataset.species] || 0;
        text = t('sellPrice', { price: formatCurrency(sellPrice(img.dataset.species, owned)) });
      } else if (penEl) {
        const pen = (economy.pens || []).find(function (p) { return p.id === penEl.dataset.penId; });
        text = t('sellPen', { price: formatCurrency(Math.round((pen && pen.paid || 0) * 0.5 * 100) / 100) });
      } else if (troughEl) {
        const tr = (economy.troughs || []).find(function (p) { return p.id === troughEl.dataset.id; });
        text = t('sellTrough', { price: formatCurrency(Math.round((tr && tr.paid || 0) * 0.5 * 100) / 100) });
      } else if (coopEl) {
        const coop = (economy.coops || []).find(function (p) { return p.id === coopEl.dataset.id; });
        const value = Math.round((((coop && coop.paid) || 0) * 0.5 + ((coop && coop.eggValue) || 0)) * 100) / 100;
        text = t('sellCoop', { price: formatCurrency(value) });
      } else if (flowerEl) {
        const fl = (economy.flowers || []).find(function (p) { return p.id === flowerEl.dataset.id; });
        text = t('sellFlower', { price: formatCurrency(Math.round((fl && fl.paid || 0) * 0.5 * 100) / 100) });
      } else {
        return;
      }
      if (!_sellTip) {
        _sellTip = document.createElement('div');
        _sellTip.className = 'animal-sell-tip';
        document.body.appendChild(_sellTip);
      }
      _sellTip.textContent = text;
      _sellTip.hidden = false;
      positionSellTip(e.clientX, e.clientY);
    });
    els.pigField.addEventListener('mousemove', function (e) {
      if (!_sellTip || _sellTip.hidden) return;
      positionSellTip(e.clientX, e.clientY);
    });
    els.pigField.addEventListener('mouseout', function (e) {
      const hit = e.target.closest && e.target.closest('.animal-scatter, .pen-fence, .trough-object, .coop-object, .flower-object');
      if (!hit) return;
      if (e.relatedTarget && hit.contains(e.relatedTarget)) return;
      hideSellTip();
    });
    els.pigField.addEventListener('click', function (e) {
      if (!els.pigField.classList.contains('sell-mode')) return;
      if (window.StudyFieldGestureMoved) return;
      const img = e.target.closest && e.target.closest('.animal-scatter');
      const penEl = e.target.closest && e.target.closest('.pen-fence');
      const troughEl = e.target.closest && e.target.closest('.trough-object');
      const coopEl = e.target.closest && e.target.closest('.coop-object');
      const flowerEl = e.target.closest && e.target.closest('.flower-object');
      if (img) {
        e.preventDefault();
        sellAnimalInstance(img.dataset.species, img.dataset.instanceId);
        hideSellTip();
        return;
      }
      if (penEl) {
        e.preventDefault();
        sellPen(penEl.dataset.penId);
        hideSellTip();
        return;
      }
      if (troughEl) {
        e.preventDefault();
        sellTrough(troughEl.dataset.id);
        hideSellTip();
        return;
      }
      if (coopEl) {
        e.preventDefault();
        sellCoop(coopEl.dataset.id);
        hideSellTip();
        return;
      }
      if (flowerEl) {
        e.preventDefault();
        sellFlower(flowerEl.dataset.id);
        hideSellTip();
      }
    });
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
    if (isToday) return t('today');
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
      { label: t('totalReviews'), value: totalReviews },
      { label: t('retention30'), value: retention30.total > 0 ? Math.round(retention30.retentionRate * 100) + '%' : '—' },
      { label: t('dayStreak'), value: streak },
      { label: t('studiedToday'), value: studiedToday },
      { label: t('cardsDueNow'), value: dueNow },
      { label: t('totalCards'), value: cards.length }
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
      empty.textContent = t('noDecksYet');
      els.statsDeckBreakdown.appendChild(empty);
      return;
    }

    breakdown.forEach(function (d) {
      const row = document.createElement('div');
      row.className = 'stats-deck-row';

      const name = document.createElement('span');
      name.className = 'stats-deck-row-name';
      name.textContent = (d.deckId === DEFAULT_DECK_ID && (d.deckName === 'General' || d.deckName === 'Gaineral'))
        ? t('defaultDeck')
        : d.deckName;

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
      metric(t('total'), d.totalCards);
      metric(t('due'), d.dueNow);
      metric(t('reviews30'), d.reviews);
      metric(t('retention30short'), d.retentionRate !== null ? Math.round(d.retentionRate * 100) + '%' : '—');

      row.appendChild(name);
      row.appendChild(metrics);
      els.statsDeckBreakdown.appendChild(row);
    });
  }

  // ---------------- keyboard shortcuts help ----------------

  function bindShortcutsOverlay() {
    if (!els.shortcutsOverlay || els.shortcutsOverlay.dataset.bound) return;
    els.shortcutsOverlay.dataset.bound = '1';
    if (els.shortcutsBtn) {
      els.shortcutsBtn.addEventListener('click', function () {
        els.shortcutsOverlay.hidden = !els.shortcutsOverlay.hidden;
      });
    }
    if (els.shortcutsCloseBtn) {
      els.shortcutsCloseBtn.addEventListener('click', function () {
        els.shortcutsOverlay.hidden = true;
      });
    }
    els.shortcutsOverlay.addEventListener('mousedown', function (e) {
      if (e.target === els.shortcutsOverlay) els.shortcutsOverlay.hidden = true;
    });
  }

  // ---------------- keyboard shortcuts ----------------

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      // '?' toggles the shortcuts help panel from almost anywhere.
      if (!typing && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        if (els.shortcutsOverlay) els.shortcutsOverlay.hidden = !els.shortcutsOverlay.hidden;
        return;
      }
      if (e.key === 'Escape' && els.pigOverlay && !els.pigOverlay.hidden) {
        e.preventDefault();
        dismissPigEncouragement();
        return;
      }
      if (e.key === 'Escape' && els.shortcutsOverlay && !els.shortcutsOverlay.hidden) {
        els.shortcutsOverlay.hidden = true;
        return;
      }

      if (typing) return;
      if (els.pigOverlay && !els.pigOverlay.hidden) return;
      if (!els.shortcutsOverlay.hidden) return;
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
