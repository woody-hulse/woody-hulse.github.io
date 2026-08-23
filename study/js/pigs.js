// pigs.js — pixel farm animals, the loading pig, and the generated pasture
// objects that land in the page's side gutters.
//
// Position AND size use vw/vh so browser zoom does not change on-screen
// size or placement. Pixel units would grow/shrink with zoom; viewport
// units stay visually constant. Saved placements are also stored as vw/vh.

const ANIMAL_SPECIES_ORDER = ['chickens', 'sheep', 'ducks', 'retrievers', 'pigs', 'fish', 'bison', 'horse', 'squid', 'giraffe', 'cat', 'lizard'];

let _placementLookup = function () { return {}; };
let _onPlacementChange = null;
let _animalDrag = null;
let _penTroughLookup = function () { return { pens: [], troughs: [] }; };
let _onPensChange = null;
let _onTroughsChange = null;
let _onFlowersChange = null;
let _penPlacing = null;
let _storePlacing = null;
let _fieldDrag = null;
let _farmFocusMode = 'roam';

// Characteristic on-screen size (longer side) in vw. Bands sit below the
// old ~4vw default so even a large sheep/pig reads smaller than today.
const SPECIES_HEIGHT_VW = {
  chickens: { min: 1.35, max: 1.75 },
  ducks: { min: 1.75, max: 2.20 },
  fish: { min: 1.75, max: 2.20 },
  retrievers: { min: 2.20, max: 2.65 },
  cats: { min: 1.75, max: 2.15 },
  cat: { min: 1.75, max: 2.15 },
  lizard: { min: 1.55, max: 1.95 },
  squid: { min: 2.00, max: 2.45 },
  pigs: { min: 2.55, max: 3.05 },
  sheep: { min: 2.55, max: 3.05 },
  horse: { min: 2.75, max: 3.35 },
  bison: { min: 2.85, max: 3.45 },
  giraffe: { min: 3.15, max: 3.85 }
};
const TROUGH_HEIGHT_VW = 1.72;
const TROUGH_ASPECT = 2.05;
const FLOWER_FALLBACK_HEIGHT_VW = 1.9;
const FLOWER_FALLBACK_ASPECT = 18 / 16;

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
  if (img.classList && img.classList.contains('pixel-animal')) {
    const aspect = parseFloat(img.dataset.spriteAspect) || 1.125;
    img.style.height = sizeVw + 'vw';
    img.style.width = (sizeVw * aspect) + 'vw';
    return;
  }
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

async function setSpinnerImage(imgEl) {
  if (imgEl && window.PixelSprites && window.PixelSprites.paintAnimal) {
    window.PixelSprites.paintAnimal(imgEl, 'pigs', { state: 'walk', variant: 0 });
    window.PixelSprites.animate(imgEl, 'walk', 5);
  }
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

function setPenTroughHooks(lookup, onPens, onTroughs, onFlowers) {
  _penTroughLookup = typeof lookup === 'function' ? lookup : function () { return { pens: [], troughs: [] }; };
  _onPensChange = typeof onPens === 'function' ? onPens : null;
  _onTroughsChange = typeof onTroughs === 'function' ? onTroughs : null;
  _onFlowersChange = typeof onFlowers === 'function' ? onFlowers : null;
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

function _hasPixelSprites() {
  return !!(window.PixelSprites && window.PixelSprites.renderAnimal && window.PixelSprites.paintAnimal);
}

function _clearAnimalLife(el) {
  if (!el) return;
  _clearAnimalTimer(el);
  if (window.PixelSprites && window.PixelSprites.stop) window.PixelSprites.stop(el);
  el.classList.remove('walking', 'resting');
  el.style.transition = '';
}

function _clearAnimalTimer(el) {
  if (!el) return;
  if (el._animalLifeTimer) {
    clearTimeout(el._animalLifeTimer);
    el._animalLifeTimer = null;
  }
}

function _setAnimalSpriteState(el, state, frame) {
  if (!el || !_hasPixelSprites() || !el.classList.contains('pixel-animal')) return;
  if (window.PixelSprites.stop) window.PixelSprites.stop(el);
  window.PixelSprites.paintAnimal(el, el.dataset.species || 'pigs', {
    state: state,
    frame: frame || 0,
    variant: el.dataset.variant || el.dataset.index || 0
  });
  if (state === 'walk') window.PixelSprites.animate(el, 'walk', 4);
}

function _movementBoundsForAnimal(el) {
  const box = el.getBoundingClientRect();
  const w = box.width || el.offsetWidth || _vwToPx(parseFloat(el.dataset.sizeVw) || 2);
  const h = box.height || el.offsetHeight || w;
  const cx = box.left + w / 2;
  const cy = box.top + h / 2;
  const state = _penTroughLookup() || {};
  const pens = state.pens || [];
  for (let i = 0; i < pens.length; i++) {
    if (pointInPenPx(cx, cy, pens[i])) {
      const r = _penDisplayRect(pens[i]);
      const pad = Math.max(6, _vwToPx(0.45));
      return {
        minX: r.x + pad,
        maxX: Math.max(r.x + pad, r.x + r.w - w - pad),
        minY: r.y + pad,
        maxY: Math.max(r.y + pad, r.y + r.h - h - pad)
      };
    }
  }
  const side = _sideForX(cx);
  const top = _navHeightPx() + 10;
  const bottom = (window.innerHeight || 1) - h - 10;
  return {
    minX: side.x + 4,
    maxX: Math.max(side.x + 4, side.x + side.w - w - 4),
    minY: top,
    maxY: Math.max(top, bottom)
  };
}

function _walkAnimal(el) {
  if (!el || !el.parentNode || _farmFocusMode !== 'roam') return;
  const bounds = _movementBoundsForAnimal(el);
  const fromX = el.offsetLeft;
  const fromY = el.offsetTop;
  const seed = (parseInt(el.dataset.index, 10) || 1) + Date.now();
  const rng = _mulberry32(seed >>> 0);
  const dx = (rng() - 0.5) * Math.min(110, Math.max(24, bounds.maxX - bounds.minX));
  const dy = (rng() - 0.5) * Math.min(70, Math.max(20, bounds.maxY - bounds.minY));
  const x = Math.max(bounds.minX, Math.min(bounds.maxX, fromX + dx));
  const y = Math.max(bounds.minY, Math.min(bounds.maxY, fromY + dy));
  const duration = 1400 + Math.round(rng() * 900);
  if (Math.abs(x - fromX) < 3 && Math.abs(y - fromY) < 3) {
    _scheduleAnimalLife(el, 900);
    return;
  }
  _applyFlip(el, x < fromX);
  el.classList.add('walking');
  _setAnimalSpriteState(el, 'walk', 0);
  el.style.transition = 'left ' + duration + 'ms steps(10, end), top ' + duration + 'ms steps(10, end)';
  el.style.left = _pxToVw(x) + 'vw';
  el.style.top = _pxToVh(y) + 'vh';
  sortFieldByY(el.parentNode);
  el._animalLifeTimer = setTimeout(function () {
    el.classList.remove('walking');
    el.style.transition = '';
    _setAnimalSpriteState(el, 'stand', 0);
    sortFieldByY(el.parentNode);
    _scheduleAnimalLife(el, 900 + Math.round(rng() * 1600));
  }, duration + 40);
}

function _scheduleAnimalLife(el, delay) {
  if (!el || !el.parentNode || !el.classList.contains('pixel-animal')) return;
  if (_farmFocusMode === 'sleep') {
    _clearAnimalLife(el);
    _setAnimalSpriteState(el, 'sleep', 0);
    el.classList.add('resting');
    return;
  }
  if (_farmFocusMode === 'sit') {
    _clearAnimalLife(el);
    const state = (parseInt(el.dataset.index, 10) || 0) % 2 === 0 ? 'lie' : 'sit';
    _setAnimalSpriteState(el, state, 0);
    el.classList.add('resting');
    return;
  }
  _clearAnimalTimer(el);
  if (delay === 0) {
    el.classList.remove('walking', 'resting');
    _setAnimalSpriteState(el, 'stand', 0);
  }
  el._animalLifeTimer = setTimeout(function () {
    if (!el.parentNode || _farmFocusMode !== 'roam') return;
    const rng = _mulberry32((Date.now() + (parseInt(el.dataset.index, 10) || 1) * 97) >>> 0);
    const roll = rng();
    if (roll < 0.34) {
      _walkAnimal(el);
    } else {
      const state = roll < 0.50 ? 'stand' : (roll < 0.72 ? 'sit' : 'lie');
      _setAnimalSpriteState(el, state, 0);
      el.classList.toggle('resting', state !== 'stand');
      const nextDelay = state === 'lie'
        ? 6500 + Math.round(rng() * 8500)
        : (state === 'sit' ? 3600 + Math.round(rng() * 5200) : 1500 + Math.round(rng() * 2600));
      _scheduleAnimalLife(el, nextDelay);
    }
  }, delay == null ? 600 : delay);
}

function setFarmFocusMode(mode) {
  _farmFocusMode = (mode === 'sit' || mode === 'sleep') ? mode : 'roam';
  const field = document.getElementById('pig-field');
  if (_farmFocusMode === 'sleep') _cancelActiveFieldInteraction();
  if (field) {
    field.dataset.farmMode = _farmFocusMode;
    Array.prototype.forEach.call(field.querySelectorAll('.animal-scatter'), function (el) {
      _scheduleAnimalLife(el, 0);
    });
  }
}

function _spawnScatterAnimal(containerEl, species, index, opts) {
  opts = opts || {};
  if (!_hasPixelSprites()) return null;
  const rng = _rngForAnimal(species, index);
  const id = _instanceId(species, index);
  const saved = (_placementLookup() || {})[id];
  const placement = opts.placement || saved;
  const heightVw = _instanceSizeVw(species, rng, placement);
  const sizePx = _vwToPx(heightVw);

  const img = window.PixelSprites.renderAnimal(species, { state: 'stand', variant: index });
  img.alt = '';
  img.className = (img.className ? img.className + ' ' : '') + 'pig-scatter animal-scatter field-object';
  img.dataset.species = species;
  img.dataset.index = String(index);
  img.dataset.instanceId = id;
  img.dataset.kind = 'animal';

  if (placement && typeof placement.leftVw === 'number' && typeof placement.topVh === 'number') {
    _applyCanonicalPlacement(img, placement.leftVw, placement.topVh, heightVw, placement.flip);
  } else {
    const pos = _pickScatterCanonical(sizePx, rng);
    _applyCanonicalPlacement(img, pos.leftVw, pos.topVh, heightVw, rng() < 0.5);
  }

  containerEl.appendChild(img);
  _fitSpriteToSize(img, heightVw);
  _applyCanonicalPlacement(img, parseFloat(img.dataset.canX), parseFloat(img.dataset.topVh), heightVw, img.dataset.flip === '1');
  sortFieldByY(containerEl);
  _scheduleAnimalLife(img, 300 + Math.round(rng() * 1200));

  return img;
}

async function initScatteredAnimals(containerEl, animals) {
  containerEl.innerHTML = '';
  if (!_hasPixelSprites()) return;
  const counts = animals || {};
  for (let s = 0; s < ANIMAL_SPECIES_ORDER.length; s++) {
    const species = ANIMAL_SPECIES_ORDER[s];
    const n = Math.max(0, counts[species] || 0);
    if (!n) continue;
    for (let i = 1; i <= n; i++) {
      _spawnScatterAnimal(containerEl, species, i);
    }
  }
  sortFieldByY(containerEl);
  renderPensAndTroughs(containerEl);
  setFarmFocusMode(_farmFocusMode);
}

async function addScatterAnimal(containerEl, species, index) {
  if (!_hasPixelSprites()) return null;
  const img = _spawnScatterAnimal(containerEl, species, index);
  sortFieldByY(containerEl);
  return img;
}

async function addScatterAnimalAt(containerEl, species, index, placement) {
  if (!_hasPixelSprites()) return null;
  const img = _spawnScatterAnimal(containerEl, species, index, {
    placement: placement
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
  _clearAnimalLife(node);
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
  return !!target.closest('#top-nav, #tab-row, #tab-nav, #auth-screen, .overlay-card, #shortcuts-overlay, #new-deck-overlay, #text-prompt-overlay, #pixel-modal-overlay, #settings-overlay, #loading-overlay, #pig-encouragement-overlay, button, a, input, textarea, select, label');
}

function _fieldInteractionLocked() {
  return document.documentElement.classList.contains('focus-mode-sleep') ||
    document.documentElement.dataset.focusMode === 'sleep';
}

function _cancelActiveFieldInteraction() {
  _endAnimalDrag(false);
  _endFieldDrag(false);
  cancelStorePlacement();
  cancelPenPlacement();
  _setVisiblePenChip(null);
  const field = document.getElementById('pig-field');
  if (field) {
    renderPensAndTroughs(field);
    relayoutField(field);
  }
  window.StudyFieldGestureMoved = false;
}

function _inCenterColumn(clientX) {
  if (isCompactLayout() && !document.documentElement.classList.contains('farm-tab')) return true;
  const m = _stripMetrics();
  if (m.gap.w <= 0) return false;
  return clientX >= m.gap.x && clientX <= m.gap.x + m.gap.w;
}

function _animalAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden') || _fieldInteractionLocked()) return null;
  const nodes = field.querySelectorAll('.animal-scatter');
  let hit = null;
  Array.prototype.forEach.call(nodes, function (el) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
  });
  return hit;
}

function fieldAnimalAtPoint(x, y) {
  return _animalAtPoint(x, y);
}

function _troughAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden') || _fieldInteractionLocked()) return null;
  let hit = null;
  Array.prototype.forEach.call(field.querySelectorAll('.trough-object'), function (el) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
  });
  return hit;
}

function _flowerAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden') || _fieldInteractionLocked()) return null;
  let hit = null;
  Array.prototype.forEach.call(field.querySelectorAll('.flower-object'), function (el) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
  });
  return hit;
}

function _penFenceAtPoint(x, y) {
  const field = document.getElementById('pig-field');
  if (!field || field.classList.contains('focus-hidden') || _fieldInteractionLocked()) return null;
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
  _scheduleAnimalLife(img, 600);
  _animalDrag = null;
}

function _endFieldDrag(save) {
  if (!_fieldDrag) return;
  const drag = _fieldDrag;
  _fieldDrag = null;
  if (drag.kind === 'trough' || drag.kind === 'flower') {
    drag.el.classList.remove('dragging');
    if (drag.kind === 'trough' && save && drag.moved && _onTroughsChange) {
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
    if (drag.kind === 'flower' && save && drag.moved && _onFlowersChange) {
      const state = _penTroughLookup() || {};
      const flowers = (state.flowers || []).map(function (fl) {
        if (fl.id !== drag.id) return fl;
        return {
          id: fl.id,
          type: fl.type,
          leftVw: _pxToCanX(drag.el.offsetLeft, drag.widthPx),
          topVh: _pxToVh(drag.el.offsetTop),
          heightVw: parseFloat(drag.el.dataset.sizeVw) || parseFloat(drag.el.style.height) || fl.heightVw,
          paid: fl.paid
        };
      });
      _onFlowersChange(flowers);
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
    if (!field || field.classList.contains('focus-hidden') || _fieldInteractionLocked()) {
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
    if (_fieldInteractionLocked()) {
      _cancelActiveFieldInteraction();
      return;
    }
    if (_penPlacing) return;
    window.StudyFieldGestureMoved = false;
    if (_uiBlocksFieldPointer(e.target)) return;
    // Sprites are pointer-events:none so the event target is usually
    // full-width #main-content. Hit-test by coordinates instead, but never
    // steal clicks that land in the centered column.
    if (_inCenterColumn(e.clientX)) return;
    const img = _animalAtPoint(e.clientX, e.clientY);
    if (img) {
      _clearAnimalLife(img);
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
    const flower = _flowerAtPoint(e.clientX, e.clientY);
    if (flower) {
      const box = flower.getBoundingClientRect();
      _fieldDrag = {
        kind: 'flower',
        el: flower,
        id: flower.dataset.id,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: flower.offsetLeft,
        origTop: flower.offsetTop,
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
    if (_fieldInteractionLocked()) {
      _cancelActiveFieldInteraction();
      return;
    }
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
    if (_fieldDrag.kind === 'trough' || _fieldDrag.kind === 'flower') {
      _fieldDrag.el.classList.add('dragging');
      const clamped = _clampPoint(
        _fieldDrag.origLeft + dx,
        _fieldDrag.origTop + dy,
        _fieldDrag.widthPx,
        _fieldDrag.heightPx
      );
      _fieldDrag.el.style.left = _pxToVw(clamped.x) + 'vw';
      _fieldDrag.el.style.top = _pxToVh(clamped.y) + 'vh';
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
  const n = _postCount(L);
  const parts = [];
  parts.push('<span class="pixel-fence-art pixel-fence-horizontal" aria-hidden="true">');
  [34, 68].forEach(function (y, i) {
    parts.push('<span class="pixel-fence-rail rail-' + i + '" style="top:' + y + '%"></span>');
  });
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    parts.push('<span class="pixel-fence-post" style="left:' + x + '%"></span>');
  }
  parts.push('</span>');
  return parts.join('');
}

function _vFenceSvg(lengthVw, side) {
  const D = Math.max(2, lengthVw);
  const n = _postCount(D);
  const parts = [];
  parts.push('<span class="pixel-fence-art pixel-fence-vertical pixel-fence-' + side + '" aria-hidden="true">');
  [34, 66].forEach(function (x, i) {
    parts.push('<span class="pixel-fence-rail rail-' + i + '" style="left:' + x + '%"></span>');
  });
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 50 : (i / (n - 1)) * 100;
    parts.push('<span class="pixel-fence-post" style="top:' + y + '%"></span>');
  }
  parts.push('</span>');
  return parts.join('');
}

function _fenceSvg(kind, lengthVw) {
  if (kind === 'left' || kind === 'right') return _vFenceSvg(lengthVw, kind);
  return _hFenceSvg(lengthVw);
}

function _troughSvg() {
  return '<span class="pixel-trough-art" aria-hidden="true">' +
    '<span class="trough-leg leg-left"></span>' +
    '<span class="trough-leg leg-right"></span>' +
    '<span class="trough-bowl"></span>' +
    '<span class="trough-water water-a"></span>' +
    '<span class="trough-water water-b"></span>' +
    '<span class="trough-rim rim-top"></span>' +
    '<span class="trough-rim rim-front"></span>' +
    '</span>';
}

function _flowerSize(type) {
  const size = window.StudyFlowers && window.StudyFlowers.sizeFor
    ? window.StudyFlowers.sizeFor(type)
    : null;
  return {
    heightVw: (size && size.heightVw) || FLOWER_FALLBACK_HEIGHT_VW,
    aspect: (size && size.aspect) || FLOWER_FALLBACK_ASPECT
  };
}

function _paintFlower(el, type) {
  if (window.StudyFlowers && window.StudyFlowers.paint) {
    window.StudyFlowers.paint(el, type);
  } else {
    el.textContent = '*';
  }
}

function _setStorePreviewAt(x, y) {
  if (!_storePlacing || !_storePlacing.preview) return;
  const preview = _storePlacing.preview;
  const width = preview.offsetWidth || _storePlacing.widthPx || 32;
  const height = preview.offsetHeight || _storePlacing.heightPx || width;
  const clamped = _clampPoint(x - width / 2, y - height / 2, width, height);
  preview.style.left = clamped.x + 'px';
  preview.style.top = clamped.y + 'px';
  preview.classList.toggle('placement-invalid', _inCenterColumn(x));
  _storePlacing.last = {
    x: clamped.x,
    y: clamped.y,
    widthPx: width,
    heightPx: height
  };
  const priceEl = document.getElementById('field-place-price');
  if (priceEl && _storePlacing.priceText) {
    priceEl.hidden = false;
    priceEl.textContent = _storePlacing.priceText;
    priceEl.style.left = (clamped.x + width / 2) + 'px';
    priceEl.style.top = Math.max(8, clamped.y - 30) + 'px';
  }
}

function _placementPayload(extra) {
  const last = _storePlacing && _storePlacing.last;
  if (!last) return null;
  return Object.assign({
    leftVw: _pxToCanX(last.x, last.widthPx),
    topVh: _pxToVh(last.y),
    heightVw: _storePlacing.heightVw
  }, extra || {});
}

function cancelStorePlacement() {
  if (!_storePlacing) return;
  const placing = _storePlacing;
  _storePlacing = null;
  window.removeEventListener('pointermove', placing.onMove);
  window.removeEventListener('pointerdown', placing.onDown, true);
  window.removeEventListener('keydown', placing.onKey);
  const layer = document.getElementById('field-place-layer');
  if (layer) layer.hidden = true;
  const banner = document.getElementById('field-place-banner');
  if (banner) banner.textContent = '';
  const priceEl = document.getElementById('field-place-price');
  if (priceEl) priceEl.hidden = true;
  if (placing.preview && placing.preview.parentNode) placing.preview.parentNode.removeChild(placing.preview);
  if (placing.cancelled !== false && placing.onCancel) placing.onCancel();
}

function _startStorePlacement(opts) {
  opts = opts || {};
  cancelPenPlacement();
  cancelStorePlacement();
  const layer = document.getElementById('field-place-layer');
  const banner = document.getElementById('field-place-banner');
  const priceEl = document.getElementById('field-place-price');
  if (!layer || !opts.preview || document.documentElement.classList.contains('focus-mode')) return false;
  layer.hidden = false;
  if (banner) banner.textContent = opts.banner || '';
  if (priceEl) priceEl.hidden = true;
  opts.preview.classList.add('store-place-preview');
  opts.preview.setAttribute('aria-hidden', 'true');
  layer.appendChild(opts.preview);
  _storePlacing = {
    preview: opts.preview,
    heightVw: opts.heightVw,
    priceText: opts.priceText,
    onConfirm: opts.onConfirm,
    onCancel: opts.onCancel,
    last: null
  };
  _storePlacing.onMove = function (e) {
    _setStorePreviewAt(e.clientX, e.clientY);
  };
  _storePlacing.onDown = function (e) {
    if (!_storePlacing) return;
    if (e.button != null && e.button !== 0) return;
    if (e.clientY < _navHeightPx() + 8) return;
    if (_inCenterColumn(e.clientX)) {
      _setStorePreviewAt(e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    const placing = _storePlacing;
    const payload = _placementPayload(opts.payload);
    placing.cancelled = false;
    cancelStorePlacement();
    if (payload && placing.onConfirm) placing.onConfirm(payload);
  };
  _storePlacing.onKey = function (e) {
    if (e.key === 'Escape') cancelStorePlacement();
  };
  window.addEventListener('pointermove', _storePlacing.onMove);
  window.addEventListener('pointerdown', _storePlacing.onDown, true);
  window.addEventListener('keydown', _storePlacing.onKey);
  _setStorePreviewAt(opts.clientX || (window.innerWidth || 1) / 2, opts.clientY || (_navHeightPx() + 80));
  return true;
}

function startAnimalPlacement(containerEl, species, index, opts) {
  if (!containerEl || !_hasPixelSprites()) return false;
  opts = opts || {};
  const rng = _rngForAnimal(species, index);
  const heightVw = _instanceSizeVw(species, rng, null);
  const preview = window.PixelSprites.renderAnimal(species, { state: 'stand', variant: index });
  preview.className = (preview.className ? preview.className + ' ' : '') + 'animal-placement-preview field-object';
  _fitSpriteToSize(preview, heightVw);
  return _startStorePlacement({
    preview: preview,
    heightVw: heightVw,
    clientX: opts.clientX,
    clientY: opts.clientY,
    banner: opts.banner,
    priceText: opts.priceText,
    onConfirm: opts.onConfirm,
    onCancel: opts.onCancel,
    payload: { flip: rng() < 0.5 }
  });
}

function startTroughPlacement(containerEl, trough, opts) {
  if (!containerEl) return false;
  opts = opts || {};
  const heightVw = TROUGH_HEIGHT_VW;
  const preview = document.createElement('div');
  preview.className = 'trough-object field-object';
  preview.style.height = heightVw + 'vw';
  preview.style.width = (heightVw * TROUGH_ASPECT) + 'vw';
  preview.innerHTML = _troughSvg();
  return _startStorePlacement({
    preview: preview,
    heightVw: heightVw,
    clientX: opts.clientX,
    clientY: opts.clientY,
    banner: opts.banner,
    priceText: opts.priceText,
    onConfirm: opts.onConfirm,
    onCancel: opts.onCancel,
    payload: { id: trough && trough.id, paid: trough && trough.paid }
  });
}

function startFlowerPlacement(containerEl, flower, opts) {
  if (!containerEl) return false;
  flower = flower || {};
  opts = opts || {};
  const size = _flowerSize(flower.type);
  const heightVw = size.heightVw;
  const preview = document.createElement('span');
  preview.className = 'flower-object field-object';
  preview.style.height = heightVw + 'vw';
  preview.style.width = (heightVw * (size.aspect || FLOWER_FALLBACK_ASPECT)) + 'vw';
  _paintFlower(preview, flower.type);
  return _startStorePlacement({
    preview: preview,
    heightVw: heightVw,
    clientX: opts.clientX,
    clientY: opts.clientY,
    banner: opts.banner,
    priceText: opts.priceText,
    onConfirm: opts.onConfirm,
    onCancel: opts.onCancel,
    payload: { id: flower.id, type: flower.type, paid: flower.paid }
  });
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
  Array.prototype.forEach.call(containerEl.querySelectorAll('.pen-fence, .trough-object, .flower-object, .pen-boost-chip'), function (el) {
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
  (state.flowers || []).forEach(function (fl) {
    const size = _flowerSize(fl.type);
    const hVw = size.heightVw;
    const aspect = size.aspect || FLOWER_FALLBACK_ASPECT;
    const wPx = _vwToPx(hVw * aspect);
    const el = document.createElement('span');
    el.className = 'flower-object field-object';
    el.dataset.kind = 'flower';
    el.dataset.id = fl.id;
    el.dataset.flowerType = fl.type;
    el.dataset.sizeVw = String(hVw);
    el.style.left = _pxToVw(_canXToPx(fl.leftVw, wPx)) + 'vw';
    el.style.top = fl.topVh + 'vh';
    el.style.height = hVw + 'vw';
    el.style.width = (hVw * aspect) + 'vw';
    _paintFlower(el, fl.type);
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

function removeFlower(containerEl, flowerId) {
  const state = _penTroughLookup() || {};
  const flowers = (state.flowers || []).filter(function (fl) { return fl.id !== flowerId; });
  if (_onFlowersChange) _onFlowersChange(flowers);
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

function addFlowerAtDefault(containerEl, flower) {
  flower = flower || {};
  const rng = _mulberry32((Date.now() ^ 0x85ebca6b) >>> 0);
  const size = _flowerSize(flower.type);
  const heightVw = size.heightVw;
  const sizePx = _vwToPx(heightVw * (size.aspect || FLOWER_FALLBACK_ASPECT));
  const pos = _pickScatterCanonical(sizePx, rng);
  flower.leftVw = pos.leftVw;
  flower.topVh = pos.topVh;
  flower.heightVw = heightVw;
  const state = _penTroughLookup() || {};
  const flowers = (state.flowers || []).concat([flower]);
  if (_onFlowersChange) _onFlowersChange(flowers);
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
  cancelStorePlacement();
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
    const onConfirm = _penPlacing.opts.onConfirm;
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
    if (onConfirm) onConfirm(payload);
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
