import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";

export const RATING_PROTOCOL_VERSION = 1;
export const RATING_REPORT_INTERVAL = 10;

const TUNE_RULE = Object.freeze({
  minimumSample: 8,
  minimumCoverage: 0.35,
  minimumAgreement: 0.75,
  maximumMeanDistance: 0.35,
});
const PERFORMER_RULE = Object.freeze({
  minimumSample: 40,
  minimumCoverage: 0.15,
  minimumAgreement: 0.75,
  maximumMeanDistance: 0.3,
  minimumTunes: 4,
});

function ratingValue(stored) {
  const rating = Number(
    stored && typeof stored === "object" ? stored.rating : stored,
  );
  return [1, 2, 3].includes(rating) ? rating : 0;
}

function recordDate(stored) {
  return stored && typeof stored === "object"
    ? String(stored.updatedAt ?? "")
    : "";
}

export function mergePhraseRatings(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [phraseKey, stored] of Object.entries(source)) {
      const rating = ratingValue(stored);
      if (!phraseKey.includes(":") || !rating) continue;
      const entry =
        stored && typeof stored === "object" ? { ...stored, rating } : { rating };
      const current = merged[phraseKey];
      if (!current || recordDate(entry) >= recordDate(current)) {
        merged[phraseKey] = entry;
      }
    }
  }
  return merged;
}

function phraseEntries(selectedPerformers = null) {
  const selected = selectedPerformers
    ? new Set(selectedPerformers)
    : null;
  return WJAZZD_SOLOS.flatMap((solo) => {
    if (selected && !selected.has(solo.performer)) return [];
    return solo.phrases.map((phrase) => ({
      solo,
      phrase,
      phraseKey: `${solo.id}:${phrase[2]}`,
    }));
  });
}

export function tuneRatingScopeId(performer, title) {
  return `${performer}::${title}`;
}

function sampleRequirement(total, rule) {
  return Math.min(
    total,
    Math.max(
      rule.minimumSample,
      Math.ceil(total * rule.minimumCoverage),
    ),
  );
}

function evaluateEvidence(entries, phraseRatings, rule) {
  const evidence = entries.flatMap(({ phraseKey }) => {
    const rating = ratingValue(phraseRatings[phraseKey]);
    return rating ? [{ rating, stored: phraseRatings[phraseKey] }] : [];
  });
  const required = sampleRequirement(entries.length, rule);
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const { rating } of evidence) counts[rating] += 1;
  const dominantRating = [1, 2, 3].reduce((best, candidate) =>
    counts[candidate] > counts[best] ? candidate : best,
  );
  const sampleSize = evidence.length;
  const agreement = sampleSize ? counts[dominantRating] / sampleSize : 0;
  const mean = sampleSize
    ? evidence.reduce((sum, { rating }) => sum + rating, 0) / sampleSize
    : 0;
  const coverage = entries.length ? sampleSize / entries.length : 0;
  const latestDate = evidence
    .map(({ stored }) => recordDate(stored))
    .sort()
    .at(-1) || null;
  const qualifies =
    sampleSize >= required &&
    agreement >= rule.minimumAgreement &&
    Math.abs(mean - dominantRating) <= rule.maximumMeanDistance;

  return {
    rating: dominantRating,
    sampleSize,
    total: entries.length,
    required,
    agreement,
    coverage,
    mean,
    latestDate,
    qualifies,
  };
}

function normalizedFixedScopes(fixedScopes) {
  if (!Array.isArray(fixedScopes)) return [];
  return fixedScopes.flatMap((scope) => {
    const rating = ratingValue(scope);
    if (
      !scope ||
      !["tune", "performer"].includes(scope.scope) ||
      !scope.scopeId ||
      !rating
    ) {
      return [];
    }
    return [{ ...scope, rating, origin: scope.origin ?? "embedded" }];
  });
}

export function mergeRatingScopes(...sources) {
  const merged = new Map();
  for (const source of sources) {
    for (const scope of normalizedFixedScopes(source)) {
      const key = `${scope.scope}:${scope.scopeId}`;
      const current = merged.get(key);
      if (!current || recordDate(scope) >= recordDate(current)) {
        merged.set(key, scope);
      }
    }
  }
  return [...merged.values()];
}

export function deriveRatingScopes(phraseRatings, fixedScopes = []) {
  const fixed = mergeRatingScopes(fixedScopes);
  const fixedKeys = new Set(
    fixed.map((scope) => `${scope.scope}:${scope.scopeId}`),
  );
  const inferred = [];

  const tunes = new Map();
  for (const entry of phraseEntries()) {
    const scopeId = tuneRatingScopeId(
      entry.solo.performer,
      entry.solo.title,
    );
    const entries = tunes.get(scopeId) ?? [];
    entries.push(entry);
    tunes.set(scopeId, entries);
  }
  for (const [scopeId, entries] of tunes) {
    if (fixedKeys.has(`tune:${scopeId}`)) continue;
    const { solo } = entries[0];
    const evidence = evaluateEvidence(entries, phraseRatings, TUNE_RULE);
    if (!evidence.qualifies) continue;
    inferred.push({
      scope: "tune",
      scopeId,
      rating: evidence.rating,
      performer: solo.performer,
      title: solo.title,
      origin: "inferred",
      sampleSize: evidence.sampleSize,
      total: evidence.total,
      agreement: evidence.agreement,
      coverage: evidence.coverage,
      mean: evidence.mean,
      updatedAt: evidence.latestDate,
    });
  }

  for (const performer of new Set(WJAZZD_SOLOS.map((solo) => solo.performer))) {
    if (fixedKeys.has(`performer:${performer}`)) continue;
    const entries = phraseEntries([performer]);
    const ratedTunes = new Set(
      entries.flatMap(({ solo, phraseKey }) =>
        ratingValue(phraseRatings[phraseKey])
          ? [tuneRatingScopeId(solo.performer, solo.title)]
          : [],
      ),
    );
    if (ratedTunes.size < PERFORMER_RULE.minimumTunes) continue;
    const evidence = evaluateEvidence(entries, phraseRatings, PERFORMER_RULE);
    if (!evidence.qualifies) continue;
    inferred.push({
      scope: "performer",
      scopeId: performer,
      rating: evidence.rating,
      performer,
      title: null,
      origin: "inferred",
      sampleSize: evidence.sampleSize,
      total: evidence.total,
      agreement: evidence.agreement,
      coverage: evidence.coverage,
      mean: evidence.mean,
      updatedAt: evidence.latestDate,
    });
  }

  return [...fixed, ...inferred].sort((left, right) =>
    `${left.scope}:${left.scopeId}`.localeCompare(
      `${right.scope}:${right.scopeId}`,
      "fr",
    ),
  );
}

export function effectivePhraseRatings(phraseRatings, ratingScopes = []) {
  const merged = mergePhraseRatings(phraseRatings);
  const tuneScopes = new Map();
  const performerScopes = new Map();
  for (const scope of normalizedFixedScopes(ratingScopes)) {
    if (scope.scope === "tune") tuneScopes.set(scope.scopeId, scope);
    else performerScopes.set(scope.scopeId, scope);
  }

  for (const { solo, phrase, phraseKey } of phraseEntries()) {
    if (ratingValue(merged[phraseKey])) {
      merged[phraseKey] = {
        ...merged[phraseKey],
        scope: "phrase",
        scopeId: phraseKey,
      };
      continue;
    }
    const scope =
      tuneScopes.get(tuneRatingScopeId(solo.performer, solo.title)) ??
      performerScopes.get(solo.performer);
    if (!scope) continue;
    merged[phraseKey] = {
      rating: scope.rating,
      scope: scope.scope,
      scopeId: scope.scopeId,
      origin: scope.origin,
      updatedAt: scope.updatedAt ?? null,
      soloId: solo.id,
      performer: solo.performer,
      title: solo.title,
      phrase: phrase[2],
      sourceUrl: solo.sourceUrl,
    };
  }
  return merged;
}

export function ratingProtocolSummary({
  phraseRatings = {},
  fixedScopes = [],
  selectedPerformers = null,
} = {}) {
  const scopes = deriveRatingScopes(phraseRatings, fixedScopes);
  const effective = effectivePhraseRatings(phraseRatings, scopes);
  const entries = phraseEntries(selectedPerformers);
  const explicit = entries.filter(({ phraseKey }) =>
    ratingValue(phraseRatings[phraseKey]),
  );
  const covered = entries.filter(({ phraseKey }) =>
    ratingValue(effective[phraseKey]),
  );
  const distribution = { 1: 0, 2: 0, 3: 0 };
  for (const { phraseKey } of covered) {
    distribution[ratingValue(effective[phraseKey])] += 1;
  }
  const selected = selectedPerformers ? new Set(selectedPerformers) : null;
  const relevantScopes = scopes.filter(
    (scope) => !selected || selected.has(scope.performer),
  );

  return {
    protocolVersion: RATING_PROTOCOL_VERSION,
    total: entries.length,
    explicit: explicit.length,
    covered: covered.length,
    remaining: entries.length - covered.length,
    distribution,
    scopes: relevantScopes,
    tuneScopes: relevantScopes.filter((scope) => scope.scope === "tune"),
    performerScopes: relevantScopes.filter(
      (scope) => scope.scope === "performer",
    ),
    effectiveRatings: effective,
  };
}

function randomChoice(items, random) {
  return items[Math.floor(random() * items.length)];
}

export function pickRatingPhrase({
  phraseRatings = {},
  fixedScopes = [],
  selectedPerformers = [],
  sessionHistory = [],
  random = Math.random,
} = {}) {
  const scopes = deriveRatingScopes(phraseRatings, fixedScopes);
  const effective = effectivePhraseRatings(phraseRatings, scopes);
  const candidates = phraseEntries(selectedPerformers).filter(
    ({ phraseKey }) => !ratingValue(effective[phraseKey]),
  );
  if (!candidates.length) return null;

  const historyCounts = new Map();
  for (const item of sessionHistory) {
    historyCounts.set(
      item.performer,
      (historyCounts.get(item.performer) ?? 0) + 1,
    );
  }
  const availablePerformers = [...new Set(
    candidates.map(({ solo }) => solo.performer),
  )];
  const minimumCount = Math.min(
    ...availablePerformers.map((performer) => historyCounts.get(performer) ?? 0),
  );
  const performer = randomChoice(
    availablePerformers.filter(
      (candidate) => (historyCounts.get(candidate) ?? 0) === minimumCount,
    ),
    random,
  );
  const performerCandidates = candidates.filter(
    ({ solo }) => solo.performer === performer,
  );
  const byTune = new Map();
  for (const entry of performerCandidates) {
    const scopeId = tuneRatingScopeId(
      entry.solo.performer,
      entry.solo.title,
    );
    const entries = byTune.get(scopeId) ?? [];
    entries.push(entry);
    byTune.set(scopeId, entries);
  }

  const rankedTunes = [...byTune.entries()].map(([scopeId, entries]) => {
    const allEntries = phraseEntries([performer]).filter(
      ({ solo }) =>
        tuneRatingScopeId(solo.performer, solo.title) === scopeId,
    );
    const evidence = evaluateEvidence(allEntries, phraseRatings, TUNE_RULE);
    const stage =
      evidence.sampleSize > 0 && evidence.sampleSize < evidence.required
        ? 0
        : evidence.sampleSize === 0
          ? 1
          : 2;
    const distance =
      stage === 0 ? evidence.required - evidence.sampleSize : evidence.sampleSize;
    return { entries, stage, distance };
  });
  const bestStage = Math.min(...rankedTunes.map(({ stage }) => stage));
  const stageCandidates = rankedTunes.filter(({ stage }) => stage === bestStage);
  const bestDistance = Math.min(
    ...stageCandidates.map(({ distance }) => distance),
  );
  const solo = randomChoice(
    stageCandidates.filter(({ distance }) => distance === bestDistance),
    random,
  );
  return randomChoice(solo.entries, random).phraseKey;
}
