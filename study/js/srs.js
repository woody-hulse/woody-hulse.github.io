// srs.js — pure spaced-repetition scheduling logic. No localStorage access, no side effects.

var DEFAULT_DECK_ID = 'default';

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// `extra` is an optional trailing bag for card-type-specific fields (added
// for image-occlusion cards) so the existing positional args stay stable for
// every pre-existing call site. extra.type defaults to 'basic'; when it's
// 'occlusion', extra.image (data: URI) and extra.regions (array of
// {id, xPct, yPct, wPct, hPct} fractions) are attached to the card.
function createCard(front, back, deckId, now, frontImage, backImage, extra) {
  now = now || Date.now();
  extra = extra || {};
  const card = {
    id: generateId(),
    deckId: deckId || DEFAULT_DECK_ID,
    type: extra.type || 'basic',
    front: front,
    back: back,
    frontImage: frontImage || null,
    backImage: backImage || null,
    createdAt: now,
    interval: 0,
    repetition: 0,
    easeFactor: 2.5,
    dueDate: now,
    lastReviewed: null
  };
  if (card.type === 'occlusion') {
    card.image = extra.image || null;
    card.regions = Array.isArray(extra.regions) ? extra.regions : [];
  }
  return card;
}

// `naistId`: the naist (organizational container) this deck lives directly
// inside, or null/undefined for a top-level deck (not inside any naist).
// Purely organizational — never consulted by scheduling logic.
function createDeck(name, naistId, now) {
  now = now || Date.now();
  return {
    id: generateId(),
    name: name,
    naistId: naistId || null,
    createdAt: now
  };
}

// A naist is a folder-like container decks (and other naists) can be
// organized into. `parentNaistId: null` means the naist itself sits at the
// top level. Naists carry no scheduling data whatsoever.
function createNaist(name, parentNaistId, now) {
  now = now || Date.now();
  return {
    id: generateId(),
    name: name,
    parentNaistId: parentNaistId || null,
    createdAt: now
  };
}

function isDue(card, now) {
  now = now || Date.now();
  return card.dueDate <= now;
}

// Fisher-Yates shuffle, in place.
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// `limit`, if a positive number, caps the queue size (Anki-style per-session
// card cap) — applied *after* shuffling so the cards shown are a random
// sample of what's due, not just the first N in storage order.
function buildStudyQueue(cards, now, deckId, limit) {
  const due = cards.filter(function (c) {
    return isDue(c, now) && (!deckId || c.deckId === deckId);
  });
  _shuffle(due);
  if (typeof limit === 'number' && limit > 0 && due.length > limit) {
    return due.slice(0, limit);
  }
  return due;
}

// Cram/browse queue: every card in the deck (or all decks), regardless of
// due date. Purely a read-side helper — nothing here touches scheduling
// data, so callers must not run scheduleReview()/updateCard() against
// cards pulled from this queue if they want cram sessions to stay
// non-destructive to real SRS state.
function buildCramQueue(cards, deckId) {
  const pool = cards.filter(function (c) { return !deckId || c.deckId === deckId; });
  return _shuffle(pool.slice());
}

// Simplified SM-2-family scheduler, in the spirit of Anki's classic algorithm.
function scheduleReview(card, rating, now) {
  now = now || Date.now();
  let { repetition, easeFactor, interval } = card;

  if (rating === 'again') {
    repetition = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.20);
    interval = 0; // due immediately — caller re-shows it later this session
  } else {
    if (rating === 'hard') easeFactor = Math.max(1.3, easeFactor - 0.15);
    else if (rating === 'easy') easeFactor = easeFactor + 0.15;
    // 'good' leaves easeFactor unchanged

    if (repetition === 0) {
      // Brand-new card: keep all four ratings meaningfully distinct.
      // Harb is an intentionally sub-day step (~6h) so it reads as "soon",
      // clearly shorter than Gob's 1 day, with Eaby jumping to 4 days.
      interval = rating === 'hard' ? 0.25 : rating === 'easy' ? 4 : 1;
    } else if (repetition === 1) {
      interval = rating === 'hard' ? 3 : rating === 'easy' ? 10 : 6;
    } else {
      const multiplier = rating === 'hard' ? Math.max(1.2, easeFactor - 0.3) : easeFactor;
      interval = Math.round(interval * multiplier * (rating === 'easy' ? 1.3 : 1));
    }
    repetition += 1;
  }

  const dueDate = now + interval * 24 * 60 * 60 * 1000;
  easeFactor = Math.round(easeFactor * 100) / 100;
  return { ...card, repetition, easeFactor, interval, dueDate, lastReviewed: now };
}
