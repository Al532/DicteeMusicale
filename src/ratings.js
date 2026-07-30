import {
  WJAZZD_PERFORMERS,
  phraseIndexEntries,
} from "./corpus-loader.js";

export const RATING_PROTOCOL_VERSION = 4;
export const RATING_REPORT_INTERVAL = 10;

export const STRUCTURAL_EXCLUSION_RULES = Object.freeze([
  Object.freeze({
    id: "very-short-v1",
    label: "4 notes ou moins",
    maximumNotes: 4,
  }),
  Object.freeze({
    id: "rapid-run-v1",
    label: "14 notes rapides consécutives (180 ms au plus entre attaques)",
    maximumInterOnsetSeconds: 0.18,
    minimumRunNotes: 14,
  }),
  Object.freeze({
    id: "dense-burst-v1",
    label: "7 notes en 500 ms",
    maximumWindowSeconds: 0.5,
    minimumWindowNotes: 7,
  }),
]);

export const RATING_SAMPLING_POLICY = Object.freeze({
  performerExplorationRate: 0.2,
  performerDiscoverySample: 6,
  performerPriorSample: 6,
  tunePriorSample: 4,
  preferenceFloor: 0.02,
  preferenceExponent: 2,
});

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
  return [...phraseIndexEntries(selectedPerformers)].map((entry) => ({
    solo: {
      id: entry.soloId,
      performer: entry.performer,
      title: entry.title,
      sourceUrl: entry.sourceUrl,
    },
    phrase: [null, null, entry.phrase],
    phraseKey: entry.phraseKey,
    structuralExclusion: entry.structuralExclusion,
  }));
}

function maximumRapidRun(events, maximumInterOnsetSeconds) {
  let maximum = events.length ? 1 : 0;
  let current = maximum;
  for (let index = 1; index < events.length; index += 1) {
    const interOnsetSeconds = events[index][1] - events[index - 1][1];
    if (interOnsetSeconds <= maximumInterOnsetSeconds + Number.EPSILON) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 1;
    }
  }
  return maximum;
}

function maximumNotesInWindow(events, maximumWindowSeconds) {
  let maximum = 0;
  let start = 0;
  for (let end = 0; end < events.length; end += 1) {
    while (
      start < end &&
      events[end][1] - events[start][1] >
        maximumWindowSeconds + Number.EPSILON
    ) {
      start += 1;
    }
    maximum = Math.max(maximum, end - start + 1);
  }
  return maximum;
}

export function structuralPhraseExclusion(solo, phrase) {
  if (!solo || !Array.isArray(phrase)) return null;
  const events = solo.events.slice(phrase[0], phrase[1] + 1);
  const [shortRule, rapidRule, denseBurstRule] = STRUCTURAL_EXCLUSION_RULES;
  if (events.length <= shortRule.maximumNotes) {
    return {
      ...shortRule,
      noteCount: events.length,
    };
  }
  const rapidRunNotes = maximumRapidRun(
    events,
    rapidRule.maximumInterOnsetSeconds,
  );
  if (rapidRunNotes >= rapidRule.minimumRunNotes) {
    return {
      ...rapidRule,
      noteCount: events.length,
      rapidRunNotes,
    };
  }
  const rapidWindowNotes = maximumNotesInWindow(
    events,
    denseBurstRule.maximumWindowSeconds,
  );
  if (rapidWindowNotes >= denseBurstRule.minimumWindowNotes) {
    return {
      ...denseBurstRule,
      noteCount: events.length,
      rapidWindowNotes,
    };
  }
  return null;
}

function indexedStructuralExclusion(entry) {
  const indexed = entry?.structuralExclusion;
  if (!indexed?.id) return null;
  const rule = STRUCTURAL_EXCLUSION_RULES.find(
    ({ id }) => id === indexed.id,
  );
  return rule
    ? {
        ...rule,
        noteCount: indexed.noteCount,
        rapidRunNotes: indexed.rapidRunNotes ?? null,
        rapidWindowNotes: indexed.rapidWindowNotes ?? null,
      }
    : null;
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
      rating !== 1
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
    if (!evidence.qualifies || evidence.rating !== 1) continue;
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

  for (const performer of WJAZZD_PERFORMERS.map(({ name }) => name)) {
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
    if (!evidence.qualifies || evidence.rating !== 1) continue;
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

  for (const entry of phraseEntries()) {
    const { solo, phrase, phraseKey } = entry;
    if (ratingValue(merged[phraseKey])) {
      merged[phraseKey] = {
        ...merged[phraseKey],
        scope: "phrase",
        scopeId: phraseKey,
      };
      continue;
    }
    const exclusion = indexedStructuralExclusion(entry);
    if (exclusion) {
      merged[phraseKey] = {
        rating: 1,
        scope: "structural",
        scopeId: exclusion.id,
        origin: "structural",
        updatedAt: null,
        soloId: solo.id,
        performer: solo.performer,
        title: solo.title,
        phrase: phrase[2],
        sourceUrl: solo.sourceUrl,
        exclusionLabel: exclusion.label,
        noteCount: exclusion.noteCount,
        rapidRunNotes: exclusion.rapidRunNotes ?? null,
        rapidWindowNotes: exclusion.rapidWindowNotes ?? null,
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
  const structuralExclusions = entries.filter(
    ({ phraseKey }) => effective[phraseKey]?.scope === "structural",
  );
  const distribution = { 1: 0, 2: 0, 3: 0 };
  for (const { phraseKey } of covered) {
    distribution[ratingValue(effective[phraseKey])] += 1;
  }
  const selected = selectedPerformers ? new Set(selectedPerformers) : null;
  const relevantScopes = scopes.filter(
    (scope) => !selected || selected.has(scope.performer),
  );
  const structuralRules = STRUCTURAL_EXCLUSION_RULES.map((rule) => {
    const sampleSize = structuralExclusions.filter(
      ({ phraseKey }) => effective[phraseKey]?.scopeId === rule.id,
    ).length;
    return {
      scope: "rule",
      scopeId: rule.id,
      rating: 1,
      performer: null,
      title: rule.label,
      origin: "structural",
      sampleSize,
      agreement: null,
      coverage: entries.length ? sampleSize / entries.length : 0,
      updatedAt: null,
    };
  });

  return {
    protocolVersion: RATING_PROTOCOL_VERSION,
    total: entries.length,
    explicit: explicit.length,
    covered: covered.length,
    remaining: entries.length - covered.length,
    distribution,
    structuralExcluded: structuralExclusions.length,
    structuralRules,
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

function weightedChoice(items, weightFor, random) {
  const weighted = items.map((item) => ({
    item,
    weight: Math.max(0, Number(weightFor(item)) || 0),
  }));
  const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
  if (!total) return randomChoice(items, random);
  let target = random() * total;
  for (const { item, weight } of weighted) {
    target -= weight;
    if (target < 0) return item;
  }
  return weighted.at(-1).item;
}

function directRatingStats(entries, phraseRatings) {
  const stats = { sampleSize: 0, threeStars: 0 };
  for (const { phraseKey } of entries) {
    const rating = ratingValue(phraseRatings[phraseKey]);
    if (!rating) continue;
    stats.sampleSize += 1;
    if (rating === 3) stats.threeStars += 1;
  }
  return stats;
}

function smoothedThreeStarRate(
  entries,
  phraseRatings,
  priorProbability,
  priorSample,
) {
  const stats = directRatingStats(entries, phraseRatings);
  return {
    ...stats,
    probability:
      (stats.threeStars + priorProbability * priorSample) /
      (stats.sampleSize + priorSample),
  };
}

function preferenceWeight(probability) {
  return (
    RATING_SAMPLING_POLICY.preferenceFloor +
    probability ** RATING_SAMPLING_POLICY.preferenceExponent
  );
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

  const performerHistoryCounts = new Map();
  const tuneHistoryCounts = new Map();
  for (const item of sessionHistory) {
    performerHistoryCounts.set(
      item.performer,
      (performerHistoryCounts.get(item.performer) ?? 0) + 1,
    );
    const scopeId = tuneRatingScopeId(item.performer, item.title);
    tuneHistoryCounts.set(scopeId, (tuneHistoryCounts.get(scopeId) ?? 0) + 1);
  }
  const availablePerformers = [...new Set(
    candidates.map(({ solo }) => solo.performer),
  )];
  const allEntriesByPerformer = new Map(
    availablePerformers.map((performer) => [
      performer,
      phraseEntries([performer]),
    ]),
  );
  const performerEvidence = new Map(
    availablePerformers.map((performer) => [
      performer,
      smoothedThreeStarRate(
        allEntriesByPerformer.get(performer),
        phraseRatings,
        1 / 3,
        RATING_SAMPLING_POLICY.performerPriorSample,
      ),
    ]),
  );
  const discoveryPerformers = availablePerformers.filter(
    (performer) =>
      performerEvidence.get(performer).sampleSize <
      RATING_SAMPLING_POLICY.performerDiscoverySample,
  );
  const isDiscovery =
    discoveryPerformers.length > 0 &&
    random() < RATING_SAMPLING_POLICY.performerExplorationRate;

  let performer;
  if (isDiscovery) {
    const minimumSample = Math.min(
      ...discoveryPerformers.map(
        (candidate) => performerEvidence.get(candidate).sampleSize,
      ),
    );
    const leastRated = discoveryPerformers.filter(
      (candidate) =>
        performerEvidence.get(candidate).sampleSize === minimumSample,
    );
    const minimumSessionCount = Math.min(
      ...leastRated.map(
        (candidate) => performerHistoryCounts.get(candidate) ?? 0,
      ),
    );
    performer = randomChoice(
      leastRated.filter(
        (candidate) =>
          (performerHistoryCounts.get(candidate) ?? 0) === minimumSessionCount,
      ),
      random,
    );
  } else {
    performer = weightedChoice(
      availablePerformers,
      (candidate) =>
        preferenceWeight(performerEvidence.get(candidate).probability),
      random,
    );
  }

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

  const performerProbability = performerEvidence.get(performer).probability;
  const rankedTunes = [...byTune.entries()].map(([scopeId, entries]) => {
    const allEntries = allEntriesByPerformer.get(performer).filter(
      ({ solo }) =>
        tuneRatingScopeId(solo.performer, solo.title) === scopeId,
    );
    const evidence = smoothedThreeStarRate(
      allEntries,
      phraseRatings,
      performerProbability,
      RATING_SAMPLING_POLICY.tunePriorSample,
    );
    return { scopeId, entries, evidence };
  });
  let tune;
  if (isDiscovery) {
    const minimumSample = Math.min(
      ...rankedTunes.map(({ evidence }) => evidence.sampleSize),
    );
    const leastRated = rankedTunes.filter(
      ({ evidence }) => evidence.sampleSize === minimumSample,
    );
    const minimumSessionCount = Math.min(
      ...leastRated.map(
        ({ scopeId }) => tuneHistoryCounts.get(scopeId) ?? 0,
      ),
    );
    tune = randomChoice(
      leastRated.filter(
        ({ scopeId }) =>
          (tuneHistoryCounts.get(scopeId) ?? 0) === minimumSessionCount,
      ),
      random,
    );
  } else {
    tune = weightedChoice(
      rankedTunes,
      ({ evidence }) => preferenceWeight(evidence.probability),
      random,
    );
  }
  return randomChoice(tune.entries, random).phraseKey;
}
