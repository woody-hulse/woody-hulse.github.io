// pigs.js — pig image manifest, encouragement phrases, the spinning loading
// pig, and the scattered pigs that land randomly in the page's whitespace.

const PIG_BASE_PATH = 'resources/pigs/';

let _pigManifestPromise = null;

function _randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadPigManifest() {
  if (!_pigManifestPromise) {
    _pigManifestPromise = fetch(PIG_BASE_PATH + 'manifest.json').then(function (res) {
      if (!res.ok) throw new Error('Could not load pig manifest');
      return res.json();
    });
  }
  return _pigManifestPromise;
}

async function getRandomPhotoPath() {
  const manifest = await loadPigManifest();
  return PIG_BASE_PATH + _randomChoice(manifest.photos);
}

async function getRandomTransparentPigPath() {
  const manifest = await loadPigManifest();
  return PIG_BASE_PATH + _randomChoice(manifest.transparent);
}

async function getSpinnerImagePath() {
  const manifest = await loadPigManifest();
  return PIG_BASE_PATH + (manifest.spinner || manifest.transparent[0]);
}

async function setSpinnerImage(imgEl) {
  try {
    imgEl.src = await getSpinnerImagePath();
  } catch (e) {
    // non-critical — leave it blank rather than breaking the loading UI
  }
}

async function getMascotPath() {
  const manifest = await loadPigManifest();
  return PIG_BASE_PATH + (manifest.mascot || manifest.transparent[0]);
}

// ---------------------------------------------------------------------
// Encouragement phrases. {name} is swapped for the signed-in username
// (or "friend" if somehow empty) at render time.
// ---------------------------------------------------------------------

const PIG_ENCOURAGEMENTS = [
  "NIBE {name}",
  "{name}, you're on a rollb. Keep it op.",
  "Every card makes {name} limpto sharmper.",
  "Limpto staep, {name}.",
  "WAELL DON {name}!",
  "Keep gobing, {name} — you're building something rol.",
  "Good yobs {name}.",
  "{name}, smaell me?"
];

function getRandomEncouragement(name) {
  const displayName = name && name.trim() ? name.trim() : 'friend';
  return _randomChoice(PIG_ENCOURAGEMENTS).replace(/\{name\}/g, displayName);
}

// ---------------------------------------------------------------------
// Scattered pigs — dropped into random whitespace on the page (instead of
// a walking strip) every time the encouragement interval is hit. Purely
// decorative: pointer-events:none, so they never interfere with clicks.
// ---------------------------------------------------------------------

function _navHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-h');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 68;
}

// Deterministic PRNG (mulberry32) seeded from a pig's index, so pig #N
// always gets the same image/size/position/flip — on reload, on a fresh
// device, whenever — rather than reshuffling every time the page loads.
function _mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _rngForPigIndex(index) {
  // Knuth multiplicative hash of the index, so nearby indices don't
  // produce visibly-correlated seeds.
  const seed = Math.imul(index + 1, 2654435761) >>> 0;
  return _mulberry32(seed);
}

function _choiceWithRng(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function _pickScatterPosition(size, rng) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const navH = _navHeightPx();
  const top = navH + 10;
  const bottom = Math.max(top, vh - size - 10);

  let x;
  if (vw > 900) {
    // bias toward the side margins so pigs land beside the centered content
    // column rather than directly on top of it
    const marginW = Math.max(40, (vw - 680) / 2);
    if (marginW > size + 20) {
      const onLeft = rng() < 0.5;
      x = onLeft
        ? rng() * (marginW - size)
        : vw - marginW + rng() * (marginW - size);
    } else {
      x = rng() * Math.max(0, vw - size);
    }
  } else {
    x = rng() * Math.max(0, vw - size);
  }

  const y = top + rng() * (bottom - top);
  return { x: x, y: y };
}

// `index` is the pig's stable 1-based spawn number (i.e. what totalPigs
// becomes once this pig is counted) — the sole source of "randomness" for
// its look/placement, so the same index always renders identically.
function _spawnScatterPig(containerEl, index, opts) {
  opts = opts || {};
  const rng = _rngForPigIndex(index);
  const pool = opts.pool;
  const imgPath = _choiceWithRng(pool, rng);
  const size = 40 + rng() * 28;

  const img = document.createElement('img');
  img.src = PIG_BASE_PATH + imgPath;
  img.alt = '';
  img.className = 'pig-scatter' + (opts.falling ? ' falling' : '');
  img.style.height = size + 'px';

  // Position is stored in viewport-relative units (vw/vh) rather than px so
  // pigs stay put in the same on-screen spot when the page is zoomed — the
  // browser re-derives the pixel offset from the current viewport instead of
  // freezing the pixel value computed at spawn time.
  const pos = _pickScatterPosition(size, rng);
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  img.style.left = (pos.x / vw * 100) + 'vw';
  img.style.top = (pos.y / vh * 100) + 'vh';
  if (rng() < 0.5) img.style.transform = 'scaleX(-1)';

  containerEl.appendChild(img);

  if (opts.falling) {
    img.addEventListener('animationend', function onEnd() {
      img.removeEventListener('animationend', onEnd);
      img.classList.remove('falling');
    }, { once: true });
  }

  return img;
}

async function initScatteredPigs(containerEl, count) {
  containerEl.innerHTML = '';
  const manifest = await loadPigManifest();
  const pool = manifest.transparent && manifest.transparent.length ? manifest.transparent : [manifest.spinner];
  const n = Math.max(0, count || 0);
  for (let i = 1; i <= n; i++) {
    _spawnScatterPig(containerEl, i, { falling: false, pool: pool });
  }
}

// `index` is this new pig's stable spawn number (pass the post-increment
// totalPigs count) so it renders identically to how initScatteredPigs()
// would place pig #index on a future reload.
async function addScatterPig(containerEl, index) {
  const manifest = await loadPigManifest();
  const pool = manifest.transparent && manifest.transparent.length ? manifest.transparent : [manifest.spinner];
  return _spawnScatterPig(containerEl, index, { falling: true, pool: pool });
}
