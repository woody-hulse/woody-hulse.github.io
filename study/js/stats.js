// stats.js — pure functions that turn the review log (from storage.js) and
// the current cards/decks into the numbers shown on the Stats view. No
// localStorage access, no DOM access, no side effects — mirrors the
// separation of concerns in srs.js.

const STATS_DAY_MS = 24 * 60 * 60 * 1000;

function _startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function _dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// Ratings that count as "retained" vs the total graded — used for the
// retention-rate stat. `opts.sinceTs` filters to reviews at/after a
// timestamp; `opts.deckId` filters to one deck.
function computeRetention(log, opts) {
  opts = opts || {};
  const sinceTs = opts.sinceTs || 0;
  const deckId = opts.deckId || null;
  let again = 0, hard = 0, good = 0, easy = 0;

  log.forEach(function (e) {
    if (e.timestamp < sinceTs) return;
    if (deckId && e.deckId !== deckId) return;
    if (e.rating === 'again') again++;
    else if (e.rating === 'hard') hard++;
    else if (e.rating === 'good') good++;
    else if (e.rating === 'easy') easy++;
  });

  const total = again + hard + good + easy;
  const retained = hard + good + easy;
  return {
    total: total,
    again: again,
    hard: hard,
    good: good,
    easy: easy,
    retentionRate: total > 0 ? retained / total : null
  };
}

// Consecutive-day streak of at least one logged review, walking backward
// from today. A day with zero reviews so far doesn't break the streak
// until it actually passes (so "0 reviews today" still shows yesterday's
// streak intact).
function computeStreak(log, now) {
  now = now || Date.now();
  const days = {};
  log.forEach(function (e) { days[_dayKey(e.timestamp)] = true; });

  let cursor = now;
  if (!days[_dayKey(now)]) cursor = now - STATS_DAY_MS;

  let streak = 0;
  while (days[_dayKey(cursor)]) {
    streak++;
    cursor -= STATS_DAY_MS;
  }
  return streak;
}

// Reviews per calendar day for the last `days` days, oldest first, today last.
function computeReviewsPerDay(log, days, now) {
  now = now || Date.now();
  days = days || 14;
  const counts = {};
  log.forEach(function (e) {
    const key = _dayKey(e.timestamp);
    counts[key] = (counts[key] || 0) + 1;
  });

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * STATS_DAY_MS;
    const key = _dayKey(ts);
    result.push({ date: key, count: counts[key] || 0 });
  }
  return result;
}

// Due-card forecast for the next `days` days, today first. Bucket 0
// ("Today") absorbs anything already overdue as well as anything due later
// today, matching what the deck picker's "N due" badge would show right now.
function computeDueForecast(cards, days, now) {
  now = now || Date.now();
  days = days || 7;
  const todayStart = _startOfDay(now);

  const buckets = [];
  for (let i = 0; i < days; i++) {
    const dateStart = todayStart + i * STATS_DAY_MS;
    buckets.push({ date: _dayKey(dateStart), dateStart: dateStart, count: 0 });
  }

  cards.forEach(function (c) {
    const dueStart = _startOfDay(c.dueDate);
    let idx = Math.round((dueStart - todayStart) / STATS_DAY_MS);
    if (idx < 0) idx = 0;
    if (idx < days) buckets[idx].count++;
  });

  return buckets;
}

// Per-deck rollup: card counts plus a retention window (default 30 days).
function computeDeckBreakdown(log, cards, decks, now, windowDays) {
  now = now || Date.now();
  windowDays = windowDays || 30;
  const sinceTs = now - windowDays * STATS_DAY_MS;

  return decks.map(function (deck) {
    const deckCards = cards.filter(function (c) { return c.deckId === deck.id; });
    const dueNow = deckCards.filter(function (c) { return isDue(c, now); }).length;
    const retention = computeRetention(log, { sinceTs: sinceTs, deckId: deck.id });
    return {
      deckId: deck.id,
      deckName: deck.name,
      totalCards: deckCards.length,
      dueNow: dueNow,
      reviews: retention.total,
      retentionRate: retention.retentionRate
    };
  });
}
