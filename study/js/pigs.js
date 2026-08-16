// pigs.js — animal image manifests, the spinning loading pig, and the
// scattered farm animals that land in the page's side gutters.
//
// Position AND size use vw/vh so browser zoom does not change on-screen
// size or placement. Pixel units would grow/shrink with zoom; viewport
// units stay visually constant. Saved placements are also stored as vw/vh.

const PIG_BASE_PATH = 'resources/pigs/';
const ANIMAL_SPECIES_ORDER = ['chickens', 'sheep', 'ducks', 'retrievers', 'pigs', 'fish'];
const ANIMAL_BASE_PATHS = {
  chickens: 'resources/chickens/',
  sheep: 'resources/sheep/',
  ducks: 'resources/ducks/',
  retrievers: 'resources/retrievers/',
  pigs: 'resources/pigs/',
  fish: 'resources/fish/'
};

let _pigManifestPromise = null;
const _speciesManifestPromises = {};
let _placementLookup = function () { return {}; };
let _onPlacementChange = null;
let _animalDrag = null;
let _penTroughLookup = function () { return { pens: [], troughs: [] }; };
let _onPensChange = null;
let _onTroughsChange = null;
let _penPlacing = null;
let _fieldDrag = null;

// Characteristic on-screen size (longer side) in vw. Bands sit below the
// old ~4vw default so even a large sheep/pig reads smaller than today.
const SPECIES_HEIGHT_VW = {
  chickens: { min: 1.35, max: 1.75 },
  ducks: { min: 1.75, max: 2.20 },
  fish: { min: 1.75, max: 2.20 },
  retrievers: { min: 2.20, max: 2.65 },
  pigs: { min: 2.55, max: 3.05 },
  sheep: { min: 2.55, max: 3.05 }
};
const TROUGH_HEIGHT_VW = 1.72;
const TROUGH_ASPECT = 2.05;

function _speciesHeightVw(species, rng) {
  const band = SPECIES_HEIGHT_VW[species] || { min: 1.8, max: 2.3 };
  return band.min + rng() * (band.max - band.min);
}

function _instanceSizeVw(species, rng, saved) {
  const band = SPECIES_HEIGHT_VW[species] || { min: 1.8, max: 2.3 };
  const rolled = _speciesHeightVw(species, rng);
  if (!saved || typeof saved.heightVw !== 'number' || !isFinite(saved.heightVw)) return rolled;
  const h = saved.heightVw;
  if (h >= band.min * 0.92 && h <= band.max * 1.08) return h;
  return rolled;
}

function _fitSpriteToSize(img, sizeVw) {
  img.dataset.sizeVw = String(sizeVw);
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw && nh && nw >= nh) {
    img.style.width = sizeVw + 'vw';
    img.style.height = 'auto';
  } else {
    img.style.height = sizeVw + 'vw';
    img.style.width = 'auto';
  }
}

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

async function loadSpeciesManifest(species) {
  if (!_speciesManifestPromises[species]) {
    const base = ANIMAL_BASE_PATHS[species] || PIG_BASE_PATH;
    _speciesManifestPromises[species] = fetch(base + 'manifest.json').then(function (res) {
      if (!res.ok) throw new Error('Could not load ' + species + ' manifest');
      return res.json();
    }).then(function (json) {
      return { base: base, files: (json.transparent && json.transparent.length) ? json.transparent : [] };
    }).catch(function () {
      return { base: base, files: [] };
    });
  }
  return _speciesManifestPromises[species];
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

const PIG_ENCOURAGEMENTS_EN = [
  '{name}, you\'re on a roll. Keep it up.',
  'Every card makes {name} a little sharper.',
  'Little steps, {name}.',
  'Well done, {name}!',
  'Keep going, {name} — you\'re building something real.',
  'Good job, {name}.',
  'Nice work, {name}.',
  'You\'ve got this, {name}.'
];
const PIG_ENCOURAGEMENTS_FARM = [
  'NIBE {name}',
  '{name}, you\'re on a rollb. Keep it op.',
  'Every cnarb makes {name} limpto sharmper.',
  'Limpto staep, {name}.',
  'WAELL DON {name}!',
  'Keep gobing, {name} — you\'re building something rol.',
  'Good yobs {name}.',
  '{name}, smaell me?'
];

function getRandomEncouragement(name) {
  const displayName = name && String(name).trim() ? String(name).trim() : (typeof t === 'function' ? t('friend') : 'friend');
  const pack = (typeof isFunSpellings === 'function' && isFunSpellings()) ? PIG_ENCOURAGEMENTS_FARM : PIG_ENCOURAGEMENTS_EN;
  return _randomChoice(pack).replace(/\{name\}/g, displayName);
}

function setAnimalPlacementHooks(lookup, onChange) {
  _placementLookup = typeof lookup === 'function' ? lookup : function () { return {}; };
  _onPlacementChange = typeof onChange === 'function' ? onChange : null;
}

function setPenTroughHooks(lookup, onPens, onTroughs) {
  _penTroughLookup = typeof lookup === 'function' ? lookup : function () { return { pens: [], troughs: [] }; };
  _onPensChange = typeof onPens === 'function' ? onPens : null;
  _onTroughsChange = typeof onTroughs === 'function' ? onTroughs : null;
}

function isCompactLayout() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
}

// One persisted farm: canonical x is 0–100 with 0–50 = left gutter and
// 50–100 = right gutter. Desktop draws those as the two side strips with
// the content column as a gap. Compact looks like one continuous field,
// but the same divide sits at the midline (zero-width gap) so a pen
// cannot straddle both gutter worlds.
const FIELD_DRAG_SLOP_SQ = 64;

function _stripMetrics() {
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const contentW = _contentWidthPx();
  if (isCompactLayout()) {
    const half = vw / 2;
    return {
      left: { x: 0, w: half },
      gap: { x: half, w: 0 },
      right: { x: half, w: Math.max(0, vw - half) },
      vw: vw,
      vh: vh
    };
  }
  const gutter = Math.max(12, (vw - contentW) / 2);
  return {
    left: { x: 0, w: gutter },
    gap: { x: gutter, w: Math.max(0, vw - 2 * gutter) },
    right: { x: vw - gutter, w: gutter },
    vw: vw,
    vh: vh
  };
}

function _sideForX(xPx) {
  const m = _stripMetrics();
  return xPx < m.gap.x + m.gap.w / 2 ? m.left : m.right;
}

function syncFarmGap() {
  const gap = document.getElementById('farm-split-gap');
  if (gap) gap.hidden = true;
}

function _canXToPx(canX, widthPx) {
  const m = _stripMetrics();
  const onLeft = canX < 50;
  const side = onLeft ? m.left : m.right;
  const u = Math.max(0, Math.min(1, onLeft ? canX / 50 : (canX - 50) / 50));
  const usable = Math.max(0, side.w - widthPx - 8);
  return side.x + 4 + u * usable;
}

function _pxToCanX(xPx, widthPx) {
  widthPx = widthPx || 0;
  const m = _stripMetrics();
  const cx = xPx + widthPx / 2;
  const onLeft = cx < m.gap.x + m.gap.w / 2;
  const side = onLeft ? m.left : m.right;
  const usable = Math.max(1, side.w - widthPx - 8);
  const u = Math.max(0, Math.min(1, (xPx - side.x - 4) / usable));
  return onLeft ? Math.min(49.9999, u * 50) : 50 + u * 50;
}

function _canWToPx(canW, canX) {
  const m = _stripMetrics();
  const side = canX < 50 ? m.left : m.right;
  return Math.max(8, (Math.max(0, Number(canW) || 0) / 50) * side.w);
}

function _pxWToCan(widthPx, xPx) {
  const m = _stripMetrics();
  const cx = xPx + widthPx / 2;
  const side = cx < m.gap.x + m.gap.w / 2 ? m.left : m.right;
  return Math.max(1, (widthPx / Math.max(1, side.w)) * 50);
}

function _penDisplayRect(pen) {
  const wPx = _canWToPx(pen.widthVw, pen.leftVw);
  const xPx = _canXToPx(pen.leftVw, wPx);
  return {
    x: xPx,
    y: _vhToPx(pen.topVh),
    w: wPx,
    h: _vhToPx(pen.heightVh)
  };
}

function _navHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-h');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 68;
}

function _contentWidthPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--content-width');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 640;
}

function _mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _rngForAnimal(species, index) {
  const speciesCode = ANIMAL_SPECIES_ORDER.indexOf(species) + 1;
  const seed = Math.imul(speciesCode * 100003 + index + 1, 2654435761) >>> 0;
  return _mulberry32(seed);
}

function _choiceWithRng(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function _instanceId(species, index) {
  return species + '-' + index;
}

function _pxToVw(x) {
  const vw = window.innerWidth || 1;
  return (x / vw) * 100;
}

function _pxToVh(y) {
  const vh = window.innerHeight || 1;
  return (y / vh) * 100;
}

function _vwToPx(vw) {
  return (Number(vw) || 0) / 100 * (window.innerWidth || 1);
}

function _vhToPx(vh) {
  return (Number(vh) || 0) / 100 * (window.innerHeight || 1);
}

function _clampX(xPx, widthPx) {
  const m = _stripMetrics();
  const leftMin = m.left.x + 4;
  const leftMax = m.left.x + Math.max(4, m.left.w - widthPx - 4);
  const rightMin = m.right.x + 4;
  const rightMax = m.right.x + Math.max(4, m.right.w - widthPx - 4);
  if (xPx <= leftMax) return Math.max(leftMin, Math.min(xPx, leftMax));
  if (xPx >= rightMin) return Math.max(rightMin, Math.min(xPx, rightMax));
  return (xPx - leftMax) <= (rightMin - xPx) ? leftMax : rightMin;
}

function _clampY(yPx, heightPx) {
  const vh = window.innerHeight || 1;
  const top = _navHeightPx() + 10;
  const bottom = Math.max(top, vh - heightPx - 10);
  return Math.max(top, Math.min(yPx, bottom));
}

function _clampPoint(xPx, yPx, widthPx, heightPx) {
  heightPx = heightPx == null ? widthPx : heightPx;
  return { x: _clampX(xPx, widthPx), y: _clampY(yPx, heightPx) };
}

function _pickScatterCanonical(sizePx, rng) {
  const onLeft = rng() < 0.5;
  const canX = (onLeft ? 0 : 50) + rng() * 50;
  const vh = window.innerHeight;
  const top = _navHeightPx() + 10;
  const bottom = Math.max(top, vh - sizePx - 10);
  const y = top + rng() * Math.max(0, bottom - top);
  return { leftVw: canX, topVh: _pxToVh(y) };
}

function _applyFlip(img, flip) {
  img.dataset.flip = flip ? '1' : '0';
  img.style.transform = flip ? 'scaleX(-1)' : '';
}

function _applyCanonicalPlacement(img, leftVw, topVh, heightVw, flip) {
  img.dataset.canX = String(leftVw);
  img.dataset.topVh = String(topVh);
  _fitSpriteToSize(img, heightVw);
  const boxW = img.offsetWidth || _vwToPx(heightVw);
  const boxH = img.offsetHeight || boxW;
  const xPx = _clampX(_canXToPx(leftVw, boxW), boxW);
  const yPx = _clampY(_vhToPx(topVh), boxH);
  img.style.left = _pxToVw(xPx) + 'vw';
  img.style.top = _pxToVh(yPx) + 'vh';
  _applyFlip(img, !!flip);
  if (img.parentNode) sortFieldByY(img.parentNode);
}

function _readPlacement(img) {
  const box = img.getBoundingClientRect();
  const w = box.width || img.offsetWidth;
  return {
    leftVw: _pxToCanX(img.offsetLeft, w),
    topVh: _pxToVh(img.offsetTop),
    heightVw: parseFloat(img.dataset.sizeVw) || parseFloat(img.style.height) || _pxToVw(Math.max(img.offsetHeight, img.offsetWidth)),
    flip: img.dataset.flip === '1'
  };
}

function _savePlacement(img) {
  if (!_onPlacementChange) return;
  const map = Object.assign({}, _placementLookup() || {});
  map[img.dataset.instanceId] = _readPlacement(img);
  _onPlacementChange(map);
}

function sortFieldByY(containerEl) {
  if (!containerEl) return;
  const nodes = Array.prototype.slice.call(containerEl.querySelectorAll('.field-object, .animal-scatter'));
  nodes.sort(function (a, b) {
    const ay = a.getBoundingClientRect().bottom;
    const by = b.getBoundingClientRect().bottom;
    return ay - by;
  });
  nodes.forEach(function (node, i) {
    node.style.zIndex = String(10 + i);
  });
  updatePenBoostChips(containerEl);
}

function _spawnScatterAnimal(containerEl, species, index, opts) {
  opts = opts || {};
  const rng = _rngForAnimal(species, index);
  const pool = opts.pool;
  if (!pool || !pool.length) return null;
  const imgPath = _choiceWithRng(pool, rng);
  const id = _instanceId(species, index);
  const saved = (_placementLookup() || {})[id];
  const heightVw = _instanceSizeVw(species, rng, saved);
  const sizePx = _vwToPx(heightVw);

  const img = document.createElement('img');
  img.src = (opts.base || '') + imgPath;
  img.alt = '';
  img.className = 'pig-scatter animal-scatter field-object' + (opts.falling ? ' falling' : '');
  img.dataset.species = species;
  img.dataset.index = String(index);
  img.dataset.instanceId = id;
  img.dataset.kind = 'animal';

  if (saved && typeof saved.leftVw === 'number' && typeof saved.topVh === 'number') {
    _applyCanonicalPlacement(img, saved.leftVw, saved.topVh, heightVw, saved.flip);
  } else {
    const pos = _pickScatterCanonical(sizePx, rng);
    _applyCanonicalPlacement(img, pos.leftVw, pos.topVh, heightVw, rng() < 0.5);
  }

  containerEl.appendChild(img);
  img.addEventListener('load', function () {
    _fitSpriteToSize(img, heightVw);
    const canX = parseFloat(img.dataset.canX);
    const topVh = parseFloat(img.dataset.topVh);
    if (isFinite(canX) && isFinite(topVh)) {
      _applyCanonicalPlacement(img, canX, topVh, heightVw, img.dataset.flip === '1');
    }
    sortFieldByY(containerEl);
  });

  if (opts.falling) {
    img.addEventListener('animationend', function onEnd() {
      img.removeEventListener('animationend', onEnd);
      img.classList.remove('falling');
      _applyFlip(img, img.dataset.flip === '1');
      sortFieldByY(containerEl);
    }, { once: true });
  }

  return img;
}

async function initScatteredAnimals(containerEl, animals) {
  containerEl.innerHTML = '';
  const counts = animals || {};
  for (let s = 0; s < ANIMAL_SPECIES_ORDER.length; s++) {
    const species = ANIMAL_SPECIES_ORDER[s];
    const n = Math.max(0, counts[species] || 0);
    if (!n) continue;
    const manifest = await loadSpeciesManifest(species);
    if (!manifest.files.length) continue;
    for (let i = 1; i <= n; i++) {
      _spawnScatterAnimal(containerEl, species, i, {
        falling: false,
        pool: manifest.files,
        base: manifest.base
      });
    }
  }
  sortFieldByY(containerEl);
  renderPensAndTroughs(containerEl);
}

async function addScatterAnimal(containerEl, species, index) {
  const manifest = await loadSpeciesManifest(species);
  if (!manifest.files.length) return null;
  const img = _spawnScatterAnimal(containerEl, species, index, {
    falling: true,
    pool: manifest.files,
    base: manifest.base
  });
  sortFieldByY(containerEl);
  return img;
}

function compactAnimalPlacements(placements, species, removedIndex) {
  const next = {};
  Object.keys(placements || {}).forEach(function (key) {
    const parts = key.split('-');
    const spec = parts[0];
    const idx = parseInt(parts[1], 10);
    if (spec !== species) {
      next[key] = placements[key];
      return;
    }
    if (!Number.isFinite(idx) || idx === removedIndex) return;
    if (idx > removedIndex) next[_instanceId(species, idx - 1)] = placements[key];
    else next[key] = placements[key];
  });
  return next;
}

function removeScatterAnimal(containerEl, species, instanceId) {
  if (!containerEl) return false;
  let node = null;
  if (instanceId) {
    node = containerEl.querySelector('.animal-scatter[data-instance-id="' + instanceId + '"]');
  }
  if (!node) {
    const nodes = containerEl.querySelectorAll('.animal-scatter[data-species="' + species + '"]');
    node = nodes.length ? nodes[nodes.length - 1] : null;
  }
  if (!node || !node.parentNode) return false;
  const removedIndex = parseInt(node.dataset.index, 10);
  node.parentNode.removeChild(node);
  if (Number.isFinite(removedIndex)) {
    const remain = containerEl.querySelectorAll('.animal-scatter[data-species="' + species + '"]');
    Array.prototype.forEach.call(remain, function (el) {
      const idx = parseInt(el.dataset.index, 10);
      if (idx > removedIndex) {
        el.dataset.index = String(idx - 1);
        el.dataset.instanceId = _instanceId(species, idx - 1);
      }
    });
    if (_onPlacementChange) {
      _onPlacementChange(compactAnimalPlacements(_placementLookup() || {}, species, removedIndex));
    }
  }
  sortFieldByY(containerEl);
  return true;
}

function _uiBlocksFieldPointer(target) {
  if (!target || !target.closest) return false;
  return !!target.closest('#top-nav, #tab-row, #tab-nav, #auth-screen, .overlay-card, #shortcuts-overlay, #new-deck-overlay, #text-prompt-overlay, #settings-overlay, #loading-overlay, #pig-encouragement-overlay, button, a, input, textarea, select, label');
}

function _inCenterColumn(clientX) {
  if (isCompactLayout() && !document.documentElement.classList.contains('farm-tab')) return true;
  const m = _stripMetrics();
  if (m.gap.w <= 0) return false;
  return clientX >= m.gap.x && clientX <= m.gap.x + m.gap.w;
}

function _animalAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden')) return null;
  const nodes = field.querySelectorAll('.animal-scatter');
  let hit = null;
  Array.prototype.forEach.call(nodes, function (el) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
  });
  return hit;
}

function _troughAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden')) return null;
  let hit = null;
  Array.prototype.forEach.call(field.querySelectorAll('.trough-object'), function (el) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
  });
  return hit;
}

function _penFenceAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden')) return null;
  let hit = null;
  Array.prototype.forEach.call(field.querySelectorAll('.pen-fence'), function (el) {
    const r = el.getBoundingClientRect();
    const pad = 12;
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) hit = el;
  });
  return hit;
}

function _endAnimalDrag(save) {
  if (!_animalDrag) return;
  const img = _animalDrag.img;
  const moved = _animalDrag.moved;
  img.classList.remove('dragging');
  if (save && moved) _savePlacement(img);
  sortFieldByY(img.parentNode);
  _animalDrag = null;
}

function _endFieldDrag(save) {
  if (!_fieldDrag) return;
  const drag = _fieldDrag;
  _fieldDrag = null;
  if (drag.kind === 'trough') {
    drag.el.classList.remove('dragging');
    if (save && drag.moved && _onTroughsChange) {
      const state = _penTroughLookup() || {};
      const troughs = (state.troughs || []).map(function (tr) {
        if (tr.id !== drag.id) return tr;
        return {
          id: tr.id,
          leftVw: _pxToCanX(drag.el.offsetLeft, drag.widthPx),
          topVh: _pxToVh(drag.el.offsetTop),
          heightVw: parseFloat(drag.el.dataset.sizeVw) || parseFloat(drag.el.style.height) || tr.heightVw,
          paid: tr.paid
        };
      });
      _onTroughsChange(troughs);
    }
    sortFieldByY(drag.el.parentNode);
    return;
  }
  if (drag.kind === 'pen' && save && drag.moved && _onPensChange) {
    const state = _penTroughLookup() || {};
    const pens = (state.pens || []).map(function (p) {
      if (p.id !== drag.id) return p;
      return {
        id: p.id,
        leftVw: _pxToCanX(drag.origLeftPx + (drag.lastDx || 0), _canWToPx(p.widthVw, p.leftVw)),
        topVh: _pxToVh(drag.origTopPx + (drag.lastDy || 0)),
        widthVw: p.widthVw,
        heightVh: p.heightVh,
        paid: p.paid
      };
    });
    _onPensChange(pens);
    const field = document.getElementById('pig-field');
    renderPensAndTroughs(field);
  }
}

function _penIdAtClient(x, y) {
  const state = _penTroughLookup() || {};
  const pens = state.pens || [];
  let hit = null;
  pens.forEach(function (pen) {
    const r = _penDisplayRect(pen);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = pen.id;
  });
  return hit;
}

function _setVisiblePenChip(penId) {
  const field = document.getElementById('pig-field');
  if (!field) return;
  Array.prototype.forEach.call(field.querySelectorAll('.pen-boost-chip'), function (el) {
    el.classList.toggle('is-visible', !!penId && el.dataset.penId === penId);
  });
}

function bindPenChipHover() {
  if (document.documentElement.dataset.penChipHoverBound) return;
  document.documentElement.dataset.penChipHoverBound = '1';
  window.addEventListener('pointermove', function (e) {
    const field = document.getElementById('pig-field');
    if (!field || field.classList.contains('focus-hidden')) {
      _setVisiblePenChip(null);
      return;
    }
    _setVisiblePenChip(_penIdAtClient(e.clientX, e.clientY));
  }, { passive: true });
}

function bindAnimalFieldDrag() {
  if (document.documentElement.dataset.animalDragBound) return;
  document.documentElement.dataset.animalDragBound = '1';
  bindPenChipHover();

  if (!document.documentElement.dataset.fieldRelayoutBound) {
    document.documentElement.dataset.fieldRelayoutBound = '1';
    let _relayoutTimer = null;
    window.addEventListener('resize', function () {
      if (_relayoutTimer) clearTimeout(_relayoutTimer);
      _relayoutTimer = setTimeout(function () { relayoutField(); }, 80);
    });
  }

  window.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    if (_penPlacing) return;
    window.StudyFieldGestureMoved = false;
    if (_uiBlocksFieldPointer(e.target)) return;
    // Sprites are pointer-events:none so the event target is usually
    // full-width #main-content. Hit-test by coordinates instead, but never
    // steal clicks that land in the centered column.
    if (_inCenterColumn(e.clientX)) return;
    const img = _animalAtPoint(e.clientX, e.clientY);
    if (img) {
      const box = img.getBoundingClientRect();
      _animalDrag = {
        img: img,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: img.offsetLeft,
        origTop: img.offsetTop,
        widthPx: box.width || img.offsetWidth,
        heightPx: box.height || img.offsetHeight,
        pointerId: e.pointerId,
        moved: false
      };
      return;
    }
    const trough = _troughAtPoint(e.clientX, e.clientY);
    if (trough) {
      const box = trough.getBoundingClientRect();
      _fieldDrag = {
        kind: 'trough',
        el: trough,
        id: trough.dataset.id,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: trough.offsetLeft,
        origTop: trough.offsetTop,
        widthPx: box.width,
        heightPx: box.height,
        pointerId: e.pointerId,
        moved: false
      };
      return;
    }
    const fence = _penFenceAtPoint(e.clientX, e.clientY);
    if (fence) {
      const penId = fence.dataset.penId;
      const field = document.getElementById('pig-field');
      const fences = field.querySelectorAll('.pen-fence[data-pen-id="' + penId + '"]');
      let minL = Infinity;
      let minT = Infinity;
      Array.prototype.forEach.call(fences, function (el) {
        minL = Math.min(minL, el.offsetLeft);
        minT = Math.min(minT, el.offsetTop);
      });
      _fieldDrag = {
        kind: 'pen',
        id: penId,
        fences: fences,
        startX: e.clientX,
        startY: e.clientY,
        origLeftPx: minL,
        origTopPx: minT,
        lastDx: 0,
        lastDy: 0,
        pointerId: e.pointerId,
        moved: false
      };
    }
  }, { capture: true, passive: false });

  window.addEventListener('pointermove', function (e) {
    if (_animalDrag) {
      if (_animalDrag.pointerId != null && e.pointerId !== _animalDrag.pointerId) return;
      const dx = e.clientX - _animalDrag.startX;
      const dy = e.clientY - _animalDrag.startY;
      if (!_animalDrag.moved && (dx * dx + dy * dy) < FIELD_DRAG_SLOP_SQ) return;
      _animalDrag.moved = true;
      window.StudyFieldGestureMoved = true;
      e.preventDefault();
      _animalDrag.img.classList.add('dragging');
      const clamped = _clampPoint(
        _animalDrag.origLeft + dx,
        _animalDrag.origTop + dy,
        _animalDrag.widthPx,
        _animalDrag.heightPx
      );
      const img = _animalDrag.img;
      img.style.left = _pxToVw(clamped.x) + 'vw';
      img.style.top = _pxToVh(clamped.y) + 'vh';
      sortFieldByY(img.parentNode);
      return;
    }
    if (!_fieldDrag) return;
    if (_fieldDrag.pointerId != null && e.pointerId !== _fieldDrag.pointerId) return;
    const dx = e.clientX - _fieldDrag.startX;
    const dy = e.clientY - _fieldDrag.startY;
    if (!_fieldDrag.moved && (dx * dx + dy * dy) < FIELD_DRAG_SLOP_SQ) return;
    _fieldDrag.moved = true;
    window.StudyFieldGestureMoved = true;
    e.preventDefault();
    if (_fieldDrag.kind === 'trough') {
      _fieldDrag.el.classList.add('dragging');
      const clamped = _clampPoint(
        _fieldDrag.origLeft + dx,
        _fieldDrag.origTop + dy,
        _fieldDrag.widthPx,
        _fieldDrag.heightPx
      );
      _fieldDrag.el.style.left = _pxToVw(clamped.x) + 'vw';
      _fieldDrag.el.style.top = _pxToVh(clamped.y) + 'vh';
      sortFieldByY(_fieldDrag.el.parentNode);
    } else if (_fieldDrag.kind === 'pen') {
      const state = _penTroughLookup() || {};
      const pen = (state.pens || []).find(function (p) { return p.id === _fieldDrag.id; });
      if (!pen) return;
      const wPx = _canWToPx(pen.widthVw, pen.leftVw);
      const hPx = _vhToPx(pen.heightVh);
      const lock = _sideForX(_fieldDrag.origLeftPx + wPx / 2);
      const clamped = _clampPenRectPx(_fieldDrag.origLeftPx + dx, _fieldDrag.origTopPx + dy, wPx, hPx, lock);
      _fieldDrag.lastDx = clamped.x - _fieldDrag.origLeftPx;
      _fieldDrag.lastDy = clamped.y - _fieldDrag.origTopPx;
      _applyPenRect(document.getElementById('pig-field'), {
        id: pen.id,
        leftVw: _pxToCanX(clamped.x, wPx),
        topVh: _pxToVh(clamped.y),
        widthVw: pen.widthVw,
        heightVh: pen.heightVh
      });
    }
  }, { capture: true, passive: false });

  window.addEventListener('pointerup', function (e) {
    if (_animalDrag) {
      if (_animalDrag.pointerId != null && e.pointerId !== _animalDrag.pointerId) return;
      _endAnimalDrag(true);
      return;
    }
    if (!_fieldDrag) return;
    if (_fieldDrag.pointerId != null && e.pointerId !== _fieldDrag.pointerId) return;
    _endFieldDrag(true);
  }, { capture: true });

  window.addEventListener('pointercancel', function () {
    _endAnimalDrag(true);
    _endFieldDrag(true);
  }, { capture: true });
}

const PEN_POST_SPACING_VW = 1.85;
const FENCE_POST_VW = 0.22;
const FENCE_H_VW = 2.05;
const FENCE_V_VW = FENCE_POST_VW;

function _postCount(lengthVw) {
  return Math.max(2, Math.round(lengthVw / PEN_POST_SPACING_VW) + 1);
}

function _hFenceSvg(lengthVw) {
  const L = Math.max(2, lengthVw);
  const H = FENCE_H_VW;
  const n = _postCount(L);
  const postW = FENCE_POST_VW;
  const parts = [];
  const railH = 0.3;
  [0.42, 0.9, 1.38].forEach(function (y) {
    parts.push('<rect x="0" y="' + y + '" width="' + L + '" height="' + railH + '" rx="0.04" fill="#8b5a2b"/>');
    parts.push('<rect x="0" y="' + y + '" width="' + L + '" height="0.07" fill="#a56b38"/>');
  });
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (L - postW) / 2 : (i / (n - 1)) * (L - postW);
    parts.push('<rect x="' + x + '" y="0.08" width="' + postW + '" height="' + (H - 0.16) + '" rx="0.04" fill="#5c3a1e"/>');
    parts.push('<rect x="' + x + '" y="0.08" width="0.06" height="' + (H - 0.16) + '" fill="#7a4e28"/>');
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + parts.join('') + '</svg>';
}

function _vFenceSvg(lengthVw, side) {
  const D = Math.max(2, lengthVw);
  const W = FENCE_POST_VW;
  const n = _postCount(D);
  const postW = FENCE_POST_VW;
  const spacing = n === 1 ? D : (D - 0.08) / (n - 1);
  const postH = Math.min(1.28, Math.max(0.7, spacing * 0.62));
  const parts = [];
  const railW = 0.05;
  [0.03, 0.085, 0.14].forEach(function (x) {
    parts.push('<rect x="' + x + '" y="0" width="' + railW + '" height="' + D + '" rx="0.02" fill="#8b5a2b"/>');
  });
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? (D - postH) / 2 : (i / (n - 1)) * (D - postH);
    parts.push('<rect x="0" y="' + y + '" width="' + postW + '" height="' + postH + '" rx="0.03" fill="#5c3a1e"/>');
    const hx = side === 'right' ? postW - 0.06 : 0;
    parts.push('<rect x="' + hx + '" y="' + y + '" width="0.06" height="' + postH + '" fill="#7a4e28"/>');
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + D + '" preserveAspectRatio="none" aria-hidden="true">' + parts.join('') + '</svg>';
}

function _fenceSvg(kind, lengthVw) {
  if (kind === 'left' || kind === 'right') return _vFenceSvg(lengthVw, kind);
  return _hFenceSvg(lengthVw);
}

function _troughSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110" aria-hidden="true">' +
    '<rect x="40" y="56" width="11" height="46" rx="1.5" fill="#4a2e18"/>' +
    '<rect x="169" y="56" width="11" height="46" rx="1.5" fill="#4a2e18"/>' +
    '<rect x="24" y="46" width="172" height="28" rx="2" fill="#6e4526"/>' +
    '<rect x="24" y="54" width="172" height="3" fill="#5c3a1e"/>' +
    '<rect x="24" y="64" width="172" height="3" fill="#5c3a1e"/>' +
    '<path d="M36 48 C36 66 64 80 110 80 C156 80 184 66 184 48 L184 42 C184 56 156 68 110 68 C64 68 36 56 36 42 Z" fill="#8a939b"/>' +
    '<ellipse cx="110" cy="40" rx="74" ry="15" fill="#6e787f"/>' +
    '<path d="M48 42 C62 52 86 56 110 56 C134 56 158 52 172 42" fill="none" stroke="#5c666d" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M56 45 C70 53 90 56 110 56 C130 56 150 53 164 45" fill="none" stroke="#555e65" stroke-width="1.1" stroke-linecap="round"/>' +
    '<ellipse cx="110" cy="44" rx="44" ry="6" fill="#c2d0d8"/>' +
    '<ellipse cx="110" cy="38" rx="76" ry="16.5" fill="none" stroke="#d8dde2" stroke-width="4.5"/>' +
    '<ellipse cx="110" cy="36.6" rx="76" ry="16.5" fill="none" stroke="#f3f5f7" stroke-width="1.4"/>' +
    '<ellipse cx="110" cy="39.4" rx="76" ry="16.5" fill="none" stroke="#7e868e" stroke-width="1.2"/>' +
    '<rect x="20" y="50" width="180" height="22" rx="2" fill="#8b5a2b"/>' +
    '<rect x="20" y="50" width="180" height="6" fill="#a56b38"/>' +
    '<rect x="20" y="66" width="180" height="4" fill="#6e4526"/>' +
    '<rect x="22" y="54" width="13" height="50" rx="1.6" fill="#5c3a1e"/>' +
    '<rect x="22" y="54" width="3.5" height="50" fill="#7a4e28"/>' +
    '<rect x="185" y="54" width="13" height="50" rx="1.6" fill="#5c3a1e"/>' +
    '<rect x="185" y="54" width="3.5" height="50" fill="#7a4e28"/>' +
    '</svg>';
}

function _applyPenRect(container, pen) {
  if (!container) return;
  const preview = container.id === 'pen-preview';
  const disp = preview
    ? { x: 0, y: 0, w: container.offsetWidth || 8, h: container.offsetHeight || 8 }
    : _penDisplayRect(pen);
  const leftVw = _pxToVw(disp.x);
  const topVh = _pxToVh(disp.y);
  const widthVw = _pxToVw(disp.w);
  const heightVh = preview ? _pxToVh(disp.h) : pen.heightVh;
  const existing = container.querySelectorAll('.pen-fence[data-pen-id="' + pen.id + '"]');
  const map = {};
  Array.prototype.forEach.call(existing, function (el) { map[el.dataset.side] = el; });
  const thickVh = FENCE_H_VW * ((window.innerWidth || 1) / (window.innerHeight || 1));
  const postPx = _vwToPx(FENCE_V_VW);
  const railPx = _vwToPx(FENCE_H_VW);
  const sides = [
    { side: 'top', left: leftVw, top: topVh, width: widthVw, height: FENCE_H_VW },
    { side: 'bottom', left: leftVw, top: topVh + heightVh - thickVh, width: widthVw, height: FENCE_H_VW },
    { side: 'left', left: leftVw, top: topVh, width: FENCE_V_VW, heightVh: heightVh },
    { side: 'right', left: leftVw + widthVw - FENCE_V_VW, top: topVh, width: FENCE_V_VW, heightVh: heightVh }
  ];
  sides.forEach(function (s) {
    let el = map[s.side];
    if (!el) {
      el = document.createElement('div');
      el.className = 'pen-fence field-object';
      el.dataset.kind = 'pen';
      el.dataset.side = s.side;
      el.dataset.penId = pen.id;
      container.appendChild(el);
    }
    if (preview) {
      el.style.left = (s.side === 'right' ? Math.max(0, disp.w - postPx) : 0) + 'px';
      el.style.top = (s.side === 'bottom' ? Math.max(0, disp.h - railPx) : 0) + 'px';
      el.style.width = (s.side === 'left' || s.side === 'right') ? postPx + 'px' : disp.w + 'px';
      el.style.height = (s.side === 'left' || s.side === 'right') ? disp.h + 'px' : railPx + 'px';
    } else {
      el.style.left = s.left + 'vw';
      el.style.top = s.top + 'vh';
      el.style.width = s.width + 'vw';
      if (s.heightVh != null) el.style.height = s.heightVh + 'vh';
      else el.style.height = s.height + 'vw';
    }
    const len = (s.side === 'left' || s.side === 'right')
      ? heightVh * ((window.innerHeight || 1) / (window.innerWidth || 1))
      : widthVw;
    el.innerHTML = _fenceSvg(s.side, len);
    el.dataset.posts = String(_postCount(len));
  });
  updatePenBoostChips(container, pen);
}

function renderPensAndTroughs(containerEl) {
  if (!containerEl) return;
  Array.prototype.forEach.call(containerEl.querySelectorAll('.pen-fence, .trough-object, .pen-boost-chip'), function (el) {
    el.parentNode.removeChild(el);
  });
  const state = _penTroughLookup() || {};
  (state.pens || []).forEach(function (pen) { _applyPenRect(containerEl, pen); });
  (state.troughs || []).forEach(function (tr) {
    const el = document.createElement('div');
    el.className = 'trough-object field-object';
    el.dataset.kind = 'trough';
    el.dataset.id = tr.id;
    const hVw = (typeof tr.heightVw === 'number' && tr.heightVw <= 2.2) ? tr.heightVw : TROUGH_HEIGHT_VW;
    const wPx = _vwToPx(hVw * TROUGH_ASPECT);
    el.style.left = _pxToVw(_canXToPx(tr.leftVw, wPx)) + 'vw';
    el.style.top = tr.topVh + 'vh';
    el.style.height = hVw + 'vw';
    el.style.width = (hVw * TROUGH_ASPECT) + 'vw';
    el.innerHTML = _troughSvg();
    containerEl.appendChild(el);
  });
  sortFieldByY(containerEl);
}

function pointInPenPx(x, y, pen) {
  const r = _penDisplayRect(pen);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function troughWeight(T) {
  // w(1)=1, w(2)=1.25, w(3)=1.375, … → 1.5
  if (T < 1) return 0;
  return 1 + 0.5 * (1 - Math.pow(0.5, T - 1));
}

const TROUGH_BOOST_PER = 0.18;
const SAME_SPECIES_BOOST_PER = 0.15;

function _elCenterPx(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function _troughCenterPx(tr) {
  const h = tr.heightVw || TROUGH_HEIGHT_VW;
  const wPx = _vwToPx(h * TROUGH_ASPECT);
  const hPx = _vwToPx(h);
  return {
    x: _canXToPx(tr.leftVw, wPx) + wPx / 2,
    y: _vhToPx(tr.topVh) + hPx / 2
  };
}

function _troughCountInPen(pen, troughs) {
  let T = 0;
  (troughs || []).forEach(function (tr) {
    const c = _troughCenterPx(tr);
    if (pointInPenPx(c.x, c.y, pen)) T += 1;
  });
  return T;
}

function _animalsInPen(containerEl, pen) {
  const out = [];
  if (!containerEl) return out;
  Array.prototype.forEach.call(containerEl.querySelectorAll('.animal-scatter'), function (el) {
    const c = _elCenterPx(el);
    if (pointInPenPx(c.x, c.y, pen)) out.push(el);
  });
  return out;
}

function _penIsHomogeneous(animals) {
  if (!animals.length) return false;
  const species = animals[0].dataset.species;
  if (!species) return false;
  for (let i = 1; i < animals.length; i++) {
    if (animals[i].dataset.species !== species) return false;
  }
  return true;
}

// Per-pen added productivity (bonus vs unpenned). Summed into M:
//   payout = round(base * M, 2),  M = 1 + Σ contrib(pen)
//   For each animal whose center is in the pen:
//     + TROUGH_BOOST_PER * w(T)   T = troughs whose center is in this pen
//     + SAME_SPECIES_BOOST_PER    if ≥1 animal and every animal is the same species
//   Empty pen: 0. Mixed species: troughs only (no same-species term).
function penAddedProductivity(containerEl, pen, troughs) {
  const animals = _animalsInPen(containerEl, pen);
  const T = _troughCountInPen(pen, troughs);
  const w = troughWeight(T);
  const homo = _penIsHomogeneous(animals);
  let added = 0;
  for (let i = 0; i < animals.length; i++) {
    added += TROUGH_BOOST_PER * w;
    if (homo) added += SAME_SPECIES_BOOST_PER;
  }
  return added;
}

function formatPenBoostChip(added) {
  const pct = Math.round(added * 100);
  return (pct > 0 ? '+' : '') + pct + '%';
}

function updatePenBoostChips(containerEl, livePen) {
  if (!containerEl || containerEl.id !== 'pig-field') return;
  const state = _penTroughLookup() || {};
  const pens = state.pens || [];
  const troughs = state.troughs || [];
  const existing = {};
  Array.prototype.forEach.call(containerEl.querySelectorAll('.pen-boost-chip'), function (el) {
    existing[el.dataset.penId] = el;
  });
  const seen = {};
  pens.forEach(function (pen) {
    const rect = (livePen && livePen.id === pen.id) ? livePen : pen;
    seen[pen.id] = true;
    let el = existing[pen.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'pen-boost-chip';
      el.dataset.penId = pen.id;
      el.setAttribute('aria-hidden', 'true');
      containerEl.appendChild(el);
    }
    const added = penAddedProductivity(containerEl, rect, troughs);
    el.textContent = formatPenBoostChip(added);
    el.classList.toggle('is-zero', added <= 0);
    const d = _penDisplayRect(rect);
    el.style.left = _pxToVw(d.x) + 'vw';
    el.style.top = _pxToVh(d.y) + 'vh';
  });
  Object.keys(existing).forEach(function (id) {
    if (!seen[id] && existing[id].parentNode) existing[id].parentNode.removeChild(existing[id]);
  });
}

function computeTroughBoost(containerEl, pens, troughs) {
  pens = pens || [];
  troughs = troughs || [];
  if (!containerEl || !pens.length) return 1;
  let added = 0;
  pens.forEach(function (pen) {
    added += penAddedProductivity(containerEl, pen, troughs);
  });
  return 1 + added;
}

function removePen(containerEl, penId) {
  const state = _penTroughLookup() || {};
  const pens = (state.pens || []).filter(function (p) { return p.id !== penId; });
  if (_onPensChange) _onPensChange(pens);
  renderPensAndTroughs(containerEl);
}

function removeTrough(containerEl, troughId) {
  const state = _penTroughLookup() || {};
  const troughs = (state.troughs || []).filter(function (tr) { return tr.id !== troughId; });
  if (_onTroughsChange) _onTroughsChange(troughs);
  renderPensAndTroughs(containerEl);
}

function addTroughAtDefault(containerEl, trough) {
  const rng = _mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  const heightVw = TROUGH_HEIGHT_VW;
  const sizePx = _vwToPx(heightVw);
  const pos = _pickScatterCanonical(sizePx, rng);
  trough.leftVw = pos.leftVw;
  trough.topVh = pos.topVh;
  trough.heightVw = heightVw;
  const state = _penTroughLookup() || {};
  const troughs = (state.troughs || []).concat([trough]);
  if (_onTroughsChange) _onTroughsChange(troughs);
  renderPensAndTroughs(containerEl);
}

function _clampPenRectPx(x, y, w, h, lockSide) {
  const vh = window.innerHeight || 1;
  const nav = _navHeightPx() + 8;
  const cx = x + w / 2;
  const side = lockSide || _sideForX(cx);
  w = Math.max(_vwToPx(6), Math.min(w, Math.max(20, side.w - 16)));
  h = Math.max(_vhToPx(8), Math.min(h, vh - nav - 16));
  x = Math.max(side.x + 4, Math.min(x, side.x + side.w - w - 4));
  y = Math.max(nav, Math.min(y, vh - h - 8));
  return { x: x, y: y, w: w, h: h };
}

function cancelPenPlacement() {
  if (!_penPlacing) return;
  const cb = _penPlacing.onCancel;
  _penPlacing = null;
  const layer = document.getElementById('field-place-layer');
  if (layer) layer.hidden = true;
  const preview = document.getElementById('pen-preview');
  if (preview) { preview.hidden = true; preview.innerHTML = ''; }
  const priceEl = document.getElementById('field-place-price');
  if (priceEl) priceEl.hidden = true;
  if (cb) cb();
}

function startPenPlacement(opts) {
  opts = opts || {};
  cancelPenPlacement();
  const layer = document.getElementById('field-place-layer');
  const preview = document.getElementById('pen-preview');
  const priceEl = document.getElementById('field-place-price');
  const banner = document.getElementById('field-place-banner');
  if (!layer || !preview) return;
  if (document.documentElement.classList.contains('focus-mode')) return;
  layer.hidden = false;
  preview.hidden = true;
  if (priceEl) priceEl.hidden = true;
  if (banner) banner.textContent = opts.banner || '';
  _penPlacing = { opts: opts, start: null };

  function onDown(e) {
    if (!_penPlacing) return;
    if (e.button != null && e.button !== 0) return;
    if (_uiBlocksFieldPointer(e.target) && e.target !== layer && !e.target.closest('#field-place-layer')) return;
    if (_inCenterColumn(e.clientX)) return;
    _penPlacing.start = { x: e.clientX, y: e.clientY };
    _penPlacing.side = _sideForX(e.clientX);
    preview.hidden = false;
    e.preventDefault();
  }
  function onMove(e) {
    if (!_penPlacing || !_penPlacing.start) return;
    const x0 = Math.min(_penPlacing.start.x, e.clientX);
    const y0 = Math.min(_penPlacing.start.y, e.clientY);
    const x1 = Math.max(_penPlacing.start.x, e.clientX);
    const y1 = Math.max(_penPlacing.start.y, e.clientY);
    const rect = _clampPenRectPx(x0, y0, x1 - x0, y1 - y0, _penPlacing.side);
    preview.style.left = rect.x + 'px';
    preview.style.top = rect.y + 'px';
    preview.style.width = rect.w + 'px';
    preview.style.height = rect.h + 'px';
    const fake = {
      id: 'preview',
      leftVw: 0,
      topVh: 0,
      widthVw: _pxWToCan(rect.w, rect.x),
      heightVh: _pxToVh(rect.h)
    };
    preview.innerHTML = '';
    _applyPenRect(preview, fake);
    Array.prototype.forEach.call(preview.querySelectorAll('.pen-fence'), function (el) {
      el.style.position = 'absolute';
    });
    if (priceEl && opts.priceFn) {
      const price = opts.priceFn(_pxToVw(rect.w), _pxToVh(rect.h));
      priceEl.hidden = false;
      priceEl.textContent = opts.formatPrice ? opts.formatPrice(price) : String(price);
      priceEl.style.left = (rect.x + rect.w / 2) + 'px';
      priceEl.style.top = Math.max(8, rect.y - 28) + 'px';
    }
  }
  function onUp(e) {
    if (!_penPlacing || !_penPlacing.start) return;
    const x0 = Math.min(_penPlacing.start.x, e.clientX);
    const y0 = Math.min(_penPlacing.start.y, e.clientY);
    const x1 = Math.max(_penPlacing.start.x, e.clientX);
    const y1 = Math.max(_penPlacing.start.y, e.clientY);
    const rect = _clampPenRectPx(x0, y0, Math.max(8, x1 - x0), Math.max(8, y1 - y0), _penPlacing.side);
    const widthCan = _pxWToCan(rect.w, rect.x);
    const heightVh = _pxToVh(rect.h);
    const confirm = _penPlacing.opts.onConfirm;
    const priceFn = _penPlacing.opts.priceFn;
    layer.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (widthCan < 4 || heightVh < 7) {
      cancelPenPlacement();
      return;
    }
    const price = priceFn ? priceFn(_pxToVw(rect.w), heightVh) : 0;
    const payload = {
      leftVw: _pxToCanX(rect.x, rect.w),
      topVh: _pxToVh(rect.y),
      widthVw: widthCan,
      heightVh: heightVh,
      paid: price
    };
    _penPlacing = null;
    layer.hidden = true;
    preview.hidden = true;
    preview.innerHTML = '';
    if (priceEl) priceEl.hidden = true;
    if (confirm) confirm(payload);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      layer.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      cancelPenPlacement();
    }
  }
  layer.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
}

function relayoutField(containerEl) {
  containerEl = containerEl || document.getElementById('pig-field');
  syncFarmGap();
  if (!containerEl) return;
  const map = _placementLookup() || {};
  Array.prototype.forEach.call(containerEl.querySelectorAll('.animal-scatter'), function (img) {
    const saved = map[img.dataset.instanceId];
    const heightVw = parseFloat(img.dataset.sizeVw) || (saved && saved.heightVw);
    if (!isFinite(heightVw)) return;
    const canX = saved && isFinite(saved.leftVw) ? saved.leftVw : parseFloat(img.dataset.canX);
    const topVh = saved && isFinite(saved.topVh) ? saved.topVh : parseFloat(img.dataset.topVh);
    if (!isFinite(canX) || !isFinite(topVh)) return;
    const flip = saved ? !!saved.flip : img.dataset.flip === '1';
    _applyCanonicalPlacement(img, canX, topVh, heightVw, flip);
  });
  renderPensAndTroughs(containerEl);
}

async function initScatteredPigs(containerEl, count) {
  return initScatteredAnimals(containerEl, { pigs: count || 0 });
}

async function addScatterPig(containerEl, index) {
  return addScatterAnimal(containerEl, 'pigs', index);
}

