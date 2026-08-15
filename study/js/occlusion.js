// occlusion.js — Image Occlusion cards: one image + a set of rectangular
// mask regions, studied as a single SRS item (not Anki's "one card per
// region" model). Two independent pieces live in this file:
//
//   1. Small global helpers app.js calls from the study renderer and the
//      Manage list row renderer (isOcclusionCard, renderOcclusionStudyCard,
//      revealAllOcclusionMasks, occlusionRowLabel).
//   2. A self-contained creation-mode editor (upload an image, click-drag to
//      draw mask regions, save) that binds its own DOM elements and its own
//      DOMContentLoaded listener — independent of app.js's init(), so this
//      feature needs almost no changes to app.js itself.
//
// Regions are stored as fractions (0–1) of the image's rendered box:
// {id, xPct, yPct, wPct, hPct}. Both the editor and the study renderer
// position mask/region divs with CSS percentages inside a wrapper that's
// sized to exactly match the <img>'s rendered box, so alignment stays
// correct across any render size/viewport width with zero resize listeners.

function isOcclusionCard(card) {
  return !!card && card.type === 'occlusion';
}

function occlusionRowLabel(card) {
  const n = (card && card.regions) ? card.regions.length : 0;
  return 'Image occlusion — ' + n + ' label' + (n === 1 ? '' : 's');
}

// Pure: converts a drag rectangle (two corner points in the same coordinate
// space as containerWidth/containerHeight, e.g. px offsets within a wrap
// element) into stored region fractions. Returns null for a degenerate/zero
// container so callers don't have to special-case that separately.
function _dragRectToRegion(x0, y0, x1, y1, containerWidth, containerHeight) {
  if (!containerWidth || !containerHeight) return null;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return {
    xPct: left / containerWidth,
    yPct: top / containerHeight,
    wPct: w / containerWidth,
    hPct: h / containerHeight
  };
}

// ---------------- study-mode rendering ----------------

// Builds the masked-image DOM for one occlusion card inside `container`
// (assumed empty/owned exclusively by this call). Rebuilding from scratch on
// every call is what gives each card view a fresh "everything masked" start
// — there's no separate reveal-state to reset elsewhere. Clicking a mask
// reveals just that region for the rest of this card view (one-way reveal).
function renderOcclusionStudyCard(card, container) {
  container.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'occlusion-study-image';
  img.alt = '';
  img.src = card.image || '';
  container.appendChild(img);

  (card.regions || []).forEach(function (region) {
    const mask = document.createElement('div');
    mask.className = 'occlusion-mask';
    mask.style.left = (region.xPct * 100) + '%';
    mask.style.top = (region.yPct * 100) + '%';
    mask.style.width = (region.wPct * 100) + '%';
    mask.style.height = (region.hPct * 100) + '%';
    mask.title = 'Click to reveal';
    mask.addEventListener('click', function () {
      mask.classList.add('revealed');
    });
    container.appendChild(mask);
  });
}

// Used by revealAnswer() for occlusion cards: reveals every mask still
// covered. Decision: "Show Answer" on an occlusion card reveals everything
// remaining (not just "proceed to rating as-is") — it stays a single,
// unambiguous action that matches what "Show Answer" means for every other
// card, and avoids a confusing half-revealed state right as rating buttons
// appear.
function revealAllOcclusionMasks(container) {
  if (!container) return;
  Array.prototype.slice.call(container.querySelectorAll('.occlusion-mask')).forEach(function (mask) {
    mask.classList.add('revealed');
  });
}

// ---------------- creation-mode editor ----------------

(function () {
  var OCCLUSION_IMAGE_MAX_DIM = 1400;
  var OCCLUSION_IMAGE_QUALITY = 0.85;

  var els = null;
  var regions = []; // { id, xPct, yPct, wPct, hPct }
  var drawing = null; // { startX, startY, rect, el, lastX, lastY } while dragging, px within editorWrap

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    els = {
      modeBasicBtn: document.getElementById('add-mode-basic-btn'),
      modeOcclusionBtn: document.getElementById('add-mode-occlusion-btn'),
      basicForm: document.getElementById('basic-add-form'),
      occlusionForm: document.getElementById('occlusion-add-form'),
      imageInput: document.getElementById('occlusion-image-input'),
      imageBtn: document.getElementById('occlusion-image-btn'),
      editorWrap: document.getElementById('occlusion-editor-wrap'),
      editorImage: document.getElementById('occlusion-editor-image'),
      regionCount: document.getElementById('occlusion-region-count'),
      saveBtn: document.getElementById('occlusion-save-btn')
    };
    // Keeps this file inert (e.g. under a plain node require for testing)
    // if the Add view markup isn't present.
    if (!els.modeOcclusionBtn) return;

    els.modeBasicBtn.addEventListener('click', function () { setAddMode('basic'); });
    els.modeOcclusionBtn.addEventListener('click', function () { setAddMode('occlusion'); });

    els.imageBtn.addEventListener('click', function () { els.imageInput.click(); });
    els.imageInput.addEventListener('change', onImageChosen);

    els.editorWrap.addEventListener('mousedown', onDrawStart);

    els.saveBtn.addEventListener('click', onSave);

    updateSaveState();
  }

  function setAddMode(mode) {
    const occlusion = mode === 'occlusion';
    els.modeBasicBtn.classList.toggle('active', !occlusion);
    els.modeOcclusionBtn.classList.toggle('active', occlusion);
    els.basicForm.hidden = occlusion;
    els.occlusionForm.hidden = !occlusion;
  }

  async function onImageChosen() {
    const file = els.imageInput.files[0];
    els.imageInput.value = '';
    if (!file) return;
    try {
      const dataUri = await fileToCompressedDataUri(file, OCCLUSION_IMAGE_MAX_DIM, OCCLUSION_IMAGE_QUALITY);
      regions = [];
      els.editorImage.src = dataUri;
      els.editorWrap.hidden = false;
      renderEditorRegions();
      updateSaveState();
    } catch (e) {
      // non-fatal — just skip attaching an image
    }
  }

  function onDrawStart(e) {
    if (els.editorWrap.hidden) return;
    // Don't start a new drag when the mousedown is on a region's delete
    // affordance — let its own click handler run instead.
    if (e.target.closest && e.target.closest('.occlusion-region-delete')) return;
    e.preventDefault();

    const rect = els.editorWrap.getBoundingClientRect();
    const startX = clamp(e.clientX - rect.left, 0, rect.width);
    const startY = clamp(e.clientY - rect.top, 0, rect.height);

    const drawEl = document.createElement('div');
    drawEl.className = 'occlusion-region-drawing';
    els.editorWrap.appendChild(drawEl);
    drawing = { startX: startX, startY: startY, rect: rect, el: drawEl, lastX: startX, lastY: startY };
    positionDrawBox(startX, startY, startX, startY);

    document.addEventListener('mousemove', onDrawMove);
    document.addEventListener('mouseup', onDrawEnd);
  }

  function onDrawMove(e) {
    if (!drawing) return;
    const rect = drawing.rect;
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    drawing.lastX = x;
    drawing.lastY = y;
    positionDrawBox(drawing.startX, drawing.startY, x, y);
  }

  function onDrawEnd() {
    if (!drawing) return;
    document.removeEventListener('mousemove', onDrawMove);
    document.removeEventListener('mouseup', onDrawEnd);

    const rect = drawing.rect;
    const w = Math.abs(drawing.lastX - drawing.startX);
    const h = Math.abs(drawing.lastY - drawing.startY);
    drawing.el.remove();

    const MIN_PX = 8; // ignore accidental clicks/tiny drags
    if (w >= MIN_PX && h >= MIN_PX) {
      const region = _dragRectToRegion(drawing.startX, drawing.startY, drawing.lastX, drawing.lastY, rect.width, rect.height);
      if (region) {
        region.id = generateId();
        regions.push(region);
      }
    }
    drawing = null;
    renderEditorRegions();
    updateSaveState();
  }

  function positionDrawBox(x0, y0, x1, y1) {
    drawing.el.style.left = Math.min(x0, x1) + 'px';
    drawing.el.style.top = Math.min(y0, y1) + 'px';
    drawing.el.style.width = Math.abs(x1 - x0) + 'px';
    drawing.el.style.height = Math.abs(y1 - y0) + 'px';
  }

  function renderEditorRegions() {
    Array.prototype.slice.call(els.editorWrap.querySelectorAll('.occlusion-region')).forEach(function (el) { el.remove(); });

    regions.forEach(function (region) {
      const box = document.createElement('div');
      box.className = 'occlusion-region';
      box.style.left = (region.xPct * 100) + '%';
      box.style.top = (region.yPct * 100) + '%';
      box.style.width = (region.wPct * 100) + '%';
      box.style.height = (region.hPct * 100) + '%';

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'occlusion-region-delete';
      del.textContent = '×';
      del.title = 'Delete region';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        regions = regions.filter(function (r) { return r.id !== region.id; });
        renderEditorRegions();
        updateSaveState();
      });
      box.appendChild(del);

      els.editorWrap.appendChild(box);
    });

    els.regionCount.textContent = regions.length === 0
      ? 'No regions yet — click and drag on the image to draw one.'
      : regions.length + ' region' + (regions.length === 1 ? '' : 's');
  }

  async function onSave() {
    if (regions.length === 0 || !els.editorImage.src || els.editorWrap.hidden) return;
    // The deck this editor targets is whatever deck app.js currently has
    // open in the Edit Daeck tab (no dropdown anymore — the deck is chosen
    // by context, exactly like the basic add-card form). app.js keeps this
    // global in sync whenever a deck is opened for editing.
    const deckId = (typeof window !== 'undefined' && window.activeAddDeckId) || DEFAULT_DECK_ID;

    els.saveBtn.disabled = true;
    try {
      await addOcclusionCard(els.editorImage.src, regions, deckId);
      resetEditor();
      const original = els.saveBtn.textContent;
      els.saveBtn.textContent = 'Added!';
      setTimeout(function () { els.saveBtn.textContent = original; }, 900);
    } finally {
      updateSaveState();
    }
  }

  function resetEditor() {
    regions = [];
    els.editorImage.removeAttribute('src');
    els.editorWrap.hidden = true;
    renderEditorRegions();
  }

  function updateSaveState() {
    els.saveBtn.disabled = regions.length === 0;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
})();
