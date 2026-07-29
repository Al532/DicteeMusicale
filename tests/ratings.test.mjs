import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PHRASE_RATINGS,
  DEFAULT_RATING_SCOPES,
} from "../data/default-ratings.js";
import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";
import {
  STRUCTURAL_EXCLUSION_RULES,
  effectivePhraseRatings,
  mergePhraseRatings,
  pickRatingPhrase,
  ratingProtocolSummary,
  structuralPhraseExclusion,
} from "../src/ratings.js";

test("les 606 notes exportées sont intégrées en dur", () => {
  assert.equal(Object.keys(DEFAULT_PHRASE_RATINGS).length, 606);
  assert.deepEqual(
    Object.values(DEFAULT_PHRASE_RATINGS).reduce(
      (counts, { rating }) => ({
        ...counts,
        [rating]: counts[rating] + 1,
      }),
      { 1: 0, 2: 0, 3: 0 },
    ),
    { 1: 284, 2: 165, 3: 157 },
  );
});

test("le protocole couvre les notes et les exclusions structurelles", () => {
  const summary = ratingProtocolSummary({
    phraseRatings: DEFAULT_PHRASE_RATINGS,
    fixedScopes: DEFAULT_RATING_SCOPES,
  });
  assert.equal(summary.total, 11_082);
  assert.equal(summary.explicit, 606);
  assert.equal(summary.structuralExcluded, 3_416);
  assert.equal(summary.covered, 4_022);
  assert.equal(summary.remaining, 7_060);
  assert.deepEqual(summary.distribution, { 1: 3_700, 2: 165, 3: 157 });
  assert.deepEqual(
    summary.structuralRules.map(({ scopeId, sampleSize }) => ({
      scopeId,
      sampleSize,
    })),
    [
      { scopeId: "very-short-v1", sampleSize: 1_100 },
      { scopeId: "rapid-run-v1", sampleSize: 1_978 },
      { scopeId: "dense-burst-v1", sampleSize: 338 },
    ],
  );
  assert.equal(summary.tuneScopes.length, 0);
  assert.equal(summary.performerScopes.length, 0);
  assert.equal(DEFAULT_RATING_SCOPES.length, 0);
});

test("les exclusions structurelles cèdent toujours devant une note directe", () => {
  const entries = WJAZZD_SOLOS.flatMap((solo) =>
    solo.phrases.map((phrase) => ({
      solo,
      phrase,
      phraseKey: `${solo.id}:${phrase[2]}`,
      exclusion: structuralPhraseExclusion(solo, phrase),
    })),
  );
  const short = entries.find(
    ({ phraseKey, exclusion }) =>
      exclusion?.id === "very-short-v1" &&
      !DEFAULT_PHRASE_RATINGS[phraseKey],
  );
  const rapid = entries.find(
    ({ phraseKey, exclusion }) =>
      exclusion?.id === "rapid-run-v1" &&
      !DEFAULT_PHRASE_RATINGS[phraseKey],
  );
  const denseBurst = entries.find(
    ({ phraseKey, exclusion }) =>
      exclusion?.id === "dense-burst-v1" &&
      !DEFAULT_PHRASE_RATINGS[phraseKey],
  );
  const directException = entries.find(
    ({ phraseKey, exclusion }) =>
      exclusion && DEFAULT_PHRASE_RATINGS[phraseKey]?.rating === 3,
  );
  assert.ok(short);
  assert.ok(rapid);
  assert.ok(denseBurst);
  assert.ok(directException);
  assert.deepEqual(
    STRUCTURAL_EXCLUSION_RULES.map(({ id }) => id),
    ["very-short-v1", "rapid-run-v1", "dense-burst-v1"],
  );

  const effective = effectivePhraseRatings(
    DEFAULT_PHRASE_RATINGS,
    DEFAULT_RATING_SCOPES,
  );
  for (const { phraseKey } of [short, rapid, denseBurst]) {
    assert.equal(effective[phraseKey].rating, 1);
    assert.equal(effective[phraseKey].scope, "structural");
  }
  assert.equal(effective[directException.phraseKey].rating, 3);
  assert.equal(effective[directException.phraseKey].scope, "phrase");
});

test("les décisions globales sont limitées à 1 étoile", () => {
  const alianca = WJAZZD_SOLOS.filter(
    ({ performer, title }) =>
      performer === "Paul Desmond" && title === "Alianca",
  );
  const unratedPhrase = alianca
    .flatMap((solo) =>
      solo.phrases.map((phrase) => ({
        phraseKey: `${solo.id}:${phrase[2]}`,
        solo,
        phrase,
      })),
    )
    .find(
      ({ phraseKey, solo, phrase }) =>
        !DEFAULT_PHRASE_RATINGS[phraseKey] &&
        !structuralPhraseExclusion(solo, phrase),
    );
  assert.ok(unratedPhrase);

  const summary = ratingProtocolSummary({
    phraseRatings: DEFAULT_PHRASE_RATINGS,
  });
  assert.equal(summary.tuneScopes.length, 0);
  assert.equal(summary.effectiveRatings[unratedPhrase.phraseKey], undefined);

  const rejected = effectivePhraseRatings(DEFAULT_PHRASE_RATINGS, [
    {
      scope: "tune",
      scopeId: "Paul Desmond::Alianca",
      rating: 1,
      performer: "Paul Desmond",
      title: "Alianca",
      origin: "inferred",
    },
    {
      scope: "tune",
      scopeId: "Paul Desmond::Alianca",
      rating: 3,
      performer: "Paul Desmond",
      title: "Alianca",
      origin: "inferred",
      updatedAt: "2026-07-29T01:00:00.000Z",
    },
  ]);
  assert.equal(rejected[unratedPhrase.phraseKey].rating, 1);
  assert.equal(rejected[unratedPhrase.phraseKey].scope, "tune");

  const overridden = effectivePhraseRatings(
    mergePhraseRatings(DEFAULT_PHRASE_RATINGS, {
      [unratedPhrase.phraseKey]: {
        rating: 3,
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
    }),
    [{
      scope: "tune",
      scopeId: "Paul Desmond::Alianca",
      rating: 1,
    }],
  );
  assert.equal(overridden[unratedPhrase.phraseKey].rating, 3);
  assert.equal(overridden[unratedPhrase.phraseKey].scope, "phrase");
});

test("une tendance cohérente à 1 étoile peut encore écarter un morceau", () => {
  const tunes = new Map();
  for (const solo of WJAZZD_SOLOS) {
    const scopeId = `${solo.performer}::${solo.title}`;
    const entries = tunes.get(scopeId) ?? [];
    entries.push(
      ...solo.phrases.map((phrase) => ({
        phraseKey: `${solo.id}:${phrase[2]}`,
        solo,
      })),
    );
    tunes.set(scopeId, entries);
  }
  const [scopeId, entries] = [...tunes].find(
    ([, tuneEntries]) => tuneEntries.length >= 8,
  );
  const required = Math.max(8, Math.ceil(entries.length * 0.35));
  const phraseRatings = Object.fromEntries(
    entries.slice(0, required).map(({ phraseKey }) => [
      phraseKey,
      { rating: 1 },
    ]),
  );

  const summary = ratingProtocolSummary({ phraseRatings });
  assert.ok(
    summary.tuneScopes.some(
      (scope) => scope.scopeId === scopeId && scope.rating === 1,
    ),
  );
});

test("l’exploration équilibre les musiciens sélectionnés encore peu notés", () => {
  const selectedPerformers = ["Charlie Parker", "Miles Davis"];
  const history = [];
  const performerByPhrase = new Map(
    WJAZZD_SOLOS.flatMap((solo) =>
      solo.phrases.map((phrase) => [
        `${solo.id}:${phrase[2]}`,
        solo.performer,
      ]),
    ),
  );
  const random = () => 0;

  for (let index = 0; index < 12; index += 1) {
    const phraseKey = pickRatingPhrase({
      selectedPerformers,
      sessionHistory: history,
      random,
    });
    const performer = performerByPhrase.get(phraseKey);
    assert.ok(selectedPerformers.includes(performer));
    history.push({ performer });
  }

  const parkerCount = history.filter(
    ({ performer }) => performer === "Charlie Parker",
  ).length;
  const davisCount = history.length - parkerCount;
  assert.ok(Math.abs(parkerCount - davisCount) <= 1);
});

test("le tirage principal privilégie les musiciens produisant davantage de 3 étoiles", () => {
  const selectedPerformers = ["Paul Desmond", "Louis Armstrong"];
  const performerByPhrase = new Map(
    WJAZZD_SOLOS.flatMap((solo) =>
      solo.phrases.map((phrase) => [
        `${solo.id}:${phrase[2]}`,
        solo.performer,
      ]),
    ),
  );
  let seed = 0x532;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
  const counts = { "Paul Desmond": 0, "Louis Armstrong": 0 };

  for (let index = 0; index < 240; index += 1) {
    const phraseKey = pickRatingPhrase({
      phraseRatings: DEFAULT_PHRASE_RATINGS,
      selectedPerformers,
      random,
    });
    counts[performerByPhrase.get(phraseKey)] += 1;
  }

  assert.ok(counts["Paul Desmond"] > counts["Louis Armstrong"] * 2);
});

test("le tirage affine ensuite la préférence au niveau du morceau", () => {
  const performer = "Curtis Fuller";
  const entries = WJAZZD_SOLOS.filter(
    (solo) => solo.performer === performer,
  ).flatMap((solo) =>
    solo.phrases.map((phrase) => ({
      phraseKey: `${solo.id}:${phrase[2]}`,
      title: solo.title,
    })),
  );
  const byTune = new Map();
  for (const entry of entries) {
    const tuneEntries = byTune.get(entry.title) ?? [];
    tuneEntries.push(entry);
    byTune.set(entry.title, tuneEntries);
  }
  const goodTune = "Blue Train";
  const weakTune = "Down Under";
  const phraseRatings = Object.fromEntries([
    ...byTune.get(goodTune).slice(0, 6).map(({ phraseKey }) => [
      phraseKey,
      { rating: 3 },
    ]),
    ...byTune.get(weakTune).slice(0, 6).map(({ phraseKey }) => [
      phraseKey,
      { rating: 1 },
    ]),
  ]);
  const titleByPhrase = new Map(
    entries.map(({ phraseKey, title }) => [phraseKey, title]),
  );
  let seed = 0xcafe;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
  const counts = { [goodTune]: 0, [weakTune]: 0 };

  for (let index = 0; index < 200; index += 1) {
    const phraseKey = pickRatingPhrase({
      phraseRatings,
      selectedPerformers: [performer],
      random,
    });
    counts[titleByPhrase.get(phraseKey)] += 1;
  }

  assert.ok(counts[goodTune] > counts[weakTune] * 5);
});

test("une part du tirage découvre les musiciens encore trop peu notés", () => {
  const selectedPerformers = ["Paul Desmond", "Steve Coleman"];
  const performerByPhrase = new Map(
    WJAZZD_SOLOS.flatMap((solo) =>
      solo.phrases.map((phrase) => [
        `${solo.id}:${phrase[2]}`,
        solo.performer,
      ]),
    ),
  );
  const phraseKey = pickRatingPhrase({
    phraseRatings: DEFAULT_PHRASE_RATINGS,
    selectedPerformers,
    random: () => 0,
  });

  assert.equal(performerByPhrase.get(phraseKey), "Steve Coleman");
});
