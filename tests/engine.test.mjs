import test from "node:test";
import assert from "node:assert/strict";

import {
  PARKER_INTERVAL_COUNTS,
  PARKER_INTERVAL_SAMPLE_SIZE,
  isCorrectPitchClass,
  makeSequence,
  pitchClass,
  summarizeRecords,
} from "../src/engine.js";

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("l’octave est ignorée lors de la correction", () => {
  assert.equal(isCorrectPitchClass(60, 72), true);
  assert.equal(isCorrectPitchClass(60, 61), false);
  assert.equal(pitchClass(-1), 11);
});

test("le mode aléatoire utilise les 1 584 intervalles intra-phrase du corpus", () => {
  assert.equal(PARKER_INTERVAL_SAMPLE_SIZE, 1584);
  for (const length of [3, 5, 10]) {
    const result = makeSequence({ length, mode: "random", random: seededRandom(length) });
    assert.equal(result.notes.length, length);
    assert.ok(result.notes.every((note) => note >= 48 && note <= 71));
    for (let index = 1; index < result.notes.length; index += 1) {
      const interval = result.notes[index] - result.notes[index - 1];
      assert.ok(PARKER_INTERVAL_COUNTS[interval] > 0);
    }
  }
});

test("un extrait Parker conserve une source précise", () => {
  const result = makeSequence({ length: 7, mode: "parker", random: seededRandom(7) });
  assert.equal(result.meta.source.kind, "transcription");
  assert.equal(result.meta.source.label.includes("Charlie Parker"), true);
  assert.equal(result.meta.source.url.startsWith("https://jazzomat.hfm-weimar.de/"), true);
  assert.ok(Number.isFinite(result.meta.source.barStart));
  assert.ok(Number.isFinite(result.meta.source.transposition));
  assert.ok(result.meta.source.phrase);
  assert.ok(Number.isFinite(result.meta.originalTempo));
  assert.equal(result.notes.length, result.meta.source.noteCount);
});

test("le mode Parker joue la phrase entière quelle que soit la longueur demandée", () => {
  const shortSetting = makeSequence({
    length: 3,
    mode: "parker",
    random: seededRandom(42),
  });
  const longSetting = makeSequence({
    length: 10,
    mode: "parker",
    random: seededRandom(42),
  });
  assert.deepEqual(shortSetting.notes, longSetting.notes);
  assert.equal(shortSetting.notes.length, shortSetting.meta.source.noteCount);
});

test("la transposition Parker est chromatique et garde la référence dans le clavier", () => {
  const results = Array.from({ length: 16 }, (_, index) =>
    makeSequence({ mode: "parker", random: seededRandom(index + 20) }),
  );
  assert.ok(results.every((result) => result.notes[0] >= 48 && result.notes[0] <= 71));
  assert.ok(results.every((result) => Number.isInteger(result.meta.source.transposition)));
  assert.ok(results.some((result) => Math.abs(result.meta.source.transposition) % 12 !== 0));
});

test("les rythmes Parker conservent durées, silences et départs de phrases annotés", () => {
  const results = Array.from({ length: 24 }, (_, index) =>
    makeSequence({ mode: "parker", random: seededRandom(index + 100) }),
  );
  for (const result of results) {
    assert.equal(result.timings.length, result.notes.length);
    assert.equal(result.timings[0].offset, 0);
    assert.ok(result.timings.every((timing) => timing.duration > 0));
    assert.ok(
      result.timings.every(
        (timing, index) => index === 0 || timing.offset >= result.timings[index - 1].offset,
      ),
    );
  }
  assert.ok(
    results.some((result) =>
      result.timings.slice(1).some((timing, index) => {
        const previous = result.timings[index];
        return timing.offset - (previous.offset + previous.duration) > 0.01;
      }),
    ),
  );
});

test("la longueur est bornée", () => {
  assert.equal(
    makeSequence({ length: 1, mode: "random", random: seededRandom() }).notes.length,
    3,
  );
  assert.equal(
    makeSequence({ length: 99, mode: "random", random: seededRandom() }).notes.length,
    10,
  );
});

test("les statistiques ne comptent que les phrases terminées", () => {
  const summary = summarizeRecords([
    {
      completedAt: "2026-07-26T12:00:00Z",
      attempts: [
        { interval: 2, guesses: [{ midi: 62 }], responseMs: 1000 },
        { interval: -1, guesses: [{ midi: 61 }, { midi: 60 }], responseMs: 2000 },
      ],
    },
    {
      completedAt: null,
      attempts: [{ interval: 5, guesses: [{ midi: 65 }], responseMs: 500 }],
    },
  ]);

  assert.equal(summary.exercises, 1);
  assert.equal(summary.notes, 2);
  assert.equal(summary.accuracy, 0.5);
  assert.equal(summary.averageResponseMs, 1500);
});
