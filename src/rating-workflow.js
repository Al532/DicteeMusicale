import {
  mergePhraseRatings,
  mergeRatingScopes,
  ratingProtocolSummary,
} from "./ratings.js";

function safeRating(value) {
  return Math.max(1, Math.min(3, Math.round(Number(value) || 0)));
}

export function createRatingWorkflow({
  embeddedRatings = {},
  embeddedScopes = [],
  localRatings = {},
  localScopes = [],
} = {}) {
  const localPhraseRatings = { ...localRatings };
  const storedScopes = [...localScopes];
  let phraseRatings;
  let fixedScopes;
  let protocolCache = null;
  let sessionBaselineScopes = new Set();
  let sessionHistory = [];
  let reviewKeys = [];
  let reviewIndex = 0;

  function refresh() {
    phraseRatings = mergePhraseRatings(
      embeddedRatings,
      localPhraseRatings,
    );
    fixedScopes = mergeRatingScopes(
      embeddedScopes,
      storedScopes,
    );
    protocolCache = null;
  }

  function protocol() {
    protocolCache ??= ratingProtocolSummary({
      phraseRatings,
      fixedScopes,
    });
    return protocolCache;
  }

  function beginRatingSession() {
    sessionHistory = [];
    sessionBaselineScopes = new Set(
      protocol().scopes.map(
        ({ scope, scopeId }) => `${scope}:${scopeId}`,
      ),
    );
  }

  function sessionSummary() {
    const distribution = { 1: 0, 2: 0, 3: 0 };
    for (const item of sessionHistory) {
      distribution[item.rating] += 1;
    }
    const currentProtocol = protocol();
    const newScopes = currentProtocol.scopes.filter(
      ({ scope, scopeId }) =>
        !sessionBaselineScopes.has(`${scope}:${scopeId}`),
    );
    return {
      count: sessionHistory.length,
      distribution,
      newScopes,
      protocol: currentProtocol,
    };
  }

  function rate(source, rating, { origin = "manual", now } = {}) {
    if (!source?.phraseKey) return null;
    const normalized = safeRating(rating);
    localPhraseRatings[source.phraseKey] = {
      rating: normalized,
      updatedAt: (now ?? new Date()).toISOString(),
      soloId: source.soloId,
      performer: source.performer,
      title: source.title,
      phrase: source.phrase,
      sourceUrl: source.url,
      origin,
    };
    refresh();
    return normalized;
  }

  function rateForSession(source, rating, options = {}) {
    const previousLocal =
      localPhraseRatings[source?.phraseKey] ?? null;
    const normalized = rate(source, rating, {
      ...options,
      origin: "protocol",
    });
    if (!normalized) return null;
    sessionHistory.push({
      phraseKey: source.phraseKey,
      performer: source.performer,
      title: source.title,
      phrase: source.phrase,
      rating: normalized,
      previousLocal,
    });
    return normalized;
  }

  function undoLastSessionRating() {
    const last = sessionHistory.pop();
    if (!last) return null;
    if (last.previousLocal) {
      localPhraseRatings[last.phraseKey] = last.previousLocal;
    } else {
      delete localPhraseRatings[last.phraseKey];
    }
    refresh();
    return last;
  }

  function ratingFor(phraseKey, fallback = 0) {
    const stored = phraseRatings[phraseKey];
    const rating = Number(
      stored && typeof stored === "object"
        ? stored.rating
        : stored,
    );
    return Number.isFinite(rating) ? rating : fallback;
  }

  function beginReview(keys) {
    reviewKeys = [...keys];
    reviewIndex = 0;
    return reviewState();
  }

  function refreshReview(keys) {
    reviewKeys = [...keys];
    reviewIndex = Math.min(
      reviewIndex,
      Math.max(0, reviewKeys.length - 1),
    );
    return reviewState();
  }

  function moveReview(offset) {
    if (!reviewKeys.length) return null;
    const nextIndex = Math.max(
      0,
      Math.min(
        reviewKeys.length - 1,
        reviewIndex + Number(offset),
      ),
    );
    if (nextIndex === reviewIndex) return null;
    reviewIndex = nextIndex;
    return reviewKeys[reviewIndex];
  }

  function reviewState() {
    return {
      currentKey: reviewKeys[reviewIndex] ?? null,
      index: reviewIndex,
      keys: [...reviewKeys],
      total: reviewKeys.length,
    };
  }

  refresh();

  return Object.freeze({
    beginRatingSession,
    beginReview,
    effectiveRatings: () => protocol().effectiveRatings,
    fixedScopes: () => fixedScopes,
    localRatings: () => localPhraseRatings,
    localScopes: () => storedScopes,
    moveReview,
    phraseRatings: () => phraseRatings,
    protocol,
    rate,
    rateForSession,
    ratingFor,
    refreshReview,
    reviewState,
    sessionHistory: () => sessionHistory,
    sessionSummary,
    undoLastSessionRating,
  });
}
