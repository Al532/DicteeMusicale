import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PHRASE_RATINGS,
  DEFAULT_RATING_SCOPES,
} from "../data/default-ratings.js";
import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";
import {
  effectivePhraseRatings,
  mergePhraseRatings,
  pickRatingPhrase,
  ratingProtocolSummary,
} from "../src/ratings.js";

const EXPORTED_PERFORMERS = [
  "Benny Goodman",
  "Gerry Mulligan",
  "Lester Young",
  "Louis Armstrong",
  "Paul Desmond",
  "Red Garland",
];

test("les 209 notes exportées sont intégrées en dur", () => {
  assert.equal(Object.keys(DEFAULT_PHRASE_RATINGS).length, 209);
  assert.deepEqual(
    Object.values(DEFAULT_PHRASE_RATINGS).reduce(
      (counts, { rating }) => ({
        ...counts,
        [rating]: counts[rating] + 1,
      }),
      { 1: 0, 2: 0, 3: 0 },
    ),
    { 1: 75, 2: 58, 3: 76 },
  );
});

test("le protocole couvre le sous-ensemble connu et infère Alianca", () => {
  const summary = ratingProtocolSummary({
    phraseRatings: DEFAULT_PHRASE_RATINGS,
    fixedScopes: DEFAULT_RATING_SCOPES,
    selectedPerformers: EXPORTED_PERFORMERS,
  });
  assert.equal(summary.total, 547);
  assert.equal(summary.explicit, 209);
  assert.equal(summary.covered, 223);
  assert.equal(summary.remaining, 324);
  assert.equal(summary.tuneScopes.length, 1);
  assert.deepEqual(
    {
      scopeId: summary.tuneScopes[0].scopeId,
      rating: summary.tuneScopes[0].rating,
      sampleSize: summary.tuneScopes[0].sampleSize,
      total: summary.tuneScopes[0].total,
    },
    {
      scopeId: "Paul Desmond::Alianca",
      rating: 3,
      sampleSize: 9,
      total: 23,
    },
  );
});

test("une note directe prime sur une note globale de morceau", () => {
  const alianca = WJAZZD_SOLOS.filter(
    ({ performer, title }) =>
      performer === "Paul Desmond" && title === "Alianca",
  );
  const unratedPhrase = alianca
    .flatMap((solo) =>
      solo.phrases.map((phrase) => ({
        phraseKey: `${solo.id}:${phrase[2]}`,
        solo,
      })),
    )
    .find(({ phraseKey }) => !DEFAULT_PHRASE_RATINGS[phraseKey]);
  assert.ok(unratedPhrase);

  const summary = ratingProtocolSummary({
    phraseRatings: DEFAULT_PHRASE_RATINGS,
  });
  assert.equal(
    summary.effectiveRatings[unratedPhrase.phraseKey].rating,
    3,
  );
  assert.equal(
    summary.effectiveRatings[unratedPhrase.phraseKey].scope,
    "tune",
  );

  const overridden = effectivePhraseRatings(
    mergePhraseRatings(DEFAULT_PHRASE_RATINGS, {
      [unratedPhrase.phraseKey]: {
        rating: 1,
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
    }),
    summary.scopes,
  );
  assert.equal(overridden[unratedPhrase.phraseKey].rating, 1);
  assert.equal(overridden[unratedPhrase.phraseKey].scope, "phrase");
});

test("l’échantillonnage rapide équilibre les musiciens sélectionnés", () => {
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
