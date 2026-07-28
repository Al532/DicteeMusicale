import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import {
  DEFAULT_PERFORMERS,
  WJAZZD_PERFORMERS,
  WJAZZD_SOLOS,
} from "../data/wjazzd-solos.js";

import {
  JAZZ_MARKOV_MAX_ORDER,
  JAZZ_MARKOV_MIN_CONTEXT_COUNT,
  isCorrectMidi,
  jazzCorpusSummary,
  keyboardLayoutForNotes,
  makeJazzTranspositionCycle,
  makeSequence,
  normalizePerformerSelection,
  pitchClass,
  randomDifferentJazzTransposition,
  randomJazzTransposition,
  summarizeRecords,
} from "../src/engine.js";

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function intervalsOf(notes) {
  return notes.slice(1).map((note, index) => note - notes[index]);
}

test("la correction exige la hauteur MIDI exacte", () => {
  assert.equal(isCorrectMidi(60, 60), true);
  assert.equal(isCorrectMidi(60, 72), false);
  assert.equal(isCorrectMidi(60, 61), false);
  assert.equal(pitchClass(-1), 11);
});

test("les 12 transpositions, dont la tonalité originale, sont équiprobables", () => {
  const shifts = Array.from({ length: 12 }, (_, bucket) =>
    randomJazzTransposition(() => (bucket + 0.25) / 12),
  );
  assert.deepEqual(
    [...new Set(shifts.map((shift) => pitchClass(shift)))].sort(
      (a, b) => a - b,
    ),
    Array.from({ length: 12 }, (_, index) => index),
  );
  assert.ok(shifts.every((shift) => shift >= -6 && shift <= 6));
  assert.ok(shifts.includes(0));

  let draw = 0;
  const negativeTritone = randomJazzTransposition(
    () => [6.25 / 12, 0.25][draw++],
  );
  draw = 0;
  const positiveTritone = randomJazzTransposition(
    () => [6.25 / 12, 0.75][draw++],
  );
  assert.equal(negativeTritone, -6);
  assert.equal(positiveTritone, 6);
});

test("une nouvelle transposition choisit uniformément l’un des 11 autres tons", () => {
  const shifts = Array.from({ length: 11 }, (_, bucket) =>
    randomDifferentJazzTransposition(0, () => (bucket + 0.25) / 11),
  );
  assert.deepEqual(
    [...new Set(shifts.map((shift) => pitchClass(shift)))].sort(
      (a, b) => a - b,
    ),
    Array.from({ length: 11 }, (_, index) => index + 1),
  );
});

test("les transpositions suivent des cycles complets sans répétition", () => {
  const initialTransposition = 4;
  const firstCycle = [
    initialTransposition,
    ...makeJazzTranspositionCycle({
      excludeTransposition: initialTransposition,
      random: seededRandom(42),
    }),
  ];
  assert.deepEqual(
    [...new Set(firstCycle.map((shift) => pitchClass(shift)))].sort(
      (a, b) => a - b,
    ),
    Array.from({ length: 12 }, (_, index) => index),
  );

  const lastTransposition = firstCycle.at(-1);
  const secondCycle = makeJazzTranspositionCycle({
    avoidFirstTransposition: lastTransposition,
    random: seededRandom(43),
  });
  assert.equal(secondCycle.length, 12);
  assert.equal(new Set(secondCycle.map((shift) => pitchClass(shift))).size, 12);
  assert.notEqual(
    pitchClass(secondCycle[0]),
    pitchClass(lastTransposition),
  );
});

test("le clavier glissant couvre la phrase avec au moins quatre chunks entiers", () => {
  for (const notes of [
    [60, 64, 67],
    [53, 76],
    [52, 77],
    [71, 59, 65],
  ]) {
    const layout = keyboardLayoutForNotes(notes);
    assert.ok(layout.chunkCount >= 4);
    assert.ok(
      notes.every(
        (note) => note >= layout.startMidi && note <= layout.endMidi,
      ),
    );
    assert.ok([0, 5].includes(pitchClass(layout.startMidi)));
    assert.ok([4, 11].includes(pitchClass(layout.endMidi)));
  }
});

test("le corpus navigateur contient toute la WJazzD et ses 78 musiciens", () => {
  assert.equal(WJAZZD_SOLOS.length, 456);
  assert.equal(WJAZZD_PERFORMERS.length, 78);
  assert.equal(
    WJAZZD_SOLOS.reduce((sum, solo) => sum + solo.events.length, 0),
    200_809,
  );
  assert.equal(
    WJAZZD_SOLOS.reduce((sum, solo) => sum + solo.phrases.length, 0),
    11_082,
  );
  assert.equal(
    WJAZZD_PERFORMERS.find(({ name }) => name === "John Coltrane")?.soloCount,
    20,
  );
  assert.equal(
    WJAZZD_PERFORMERS.find(({ name }) => name === "Charlie Parker")?.soloCount,
    17,
  );
  assert.equal(DEFAULT_PERFORMERS.length, 13);
  assert.deepEqual(
    normalizePerformerSelection(DEFAULT_PERFORMERS),
    WJAZZD_PERFORMERS
      .map(({ name }) => name)
      .filter((name) => DEFAULT_PERFORMERS.includes(name)),
  );
});

test("le modèle Markov est reconstruit selon les musiciens sélectionnés", () => {
  const parker = jazzCorpusSummary(["Charlie Parker"]);
  const coltrane = jazzCorpusSummary(["John Coltrane"]);
  assert.equal(parker.performerCount, 1);
  assert.equal(parker.soloCount, 17);
  assert.equal(coltrane.performerCount, 1);
  assert.equal(coltrane.soloCount, 20);
  assert.notEqual(parker.intervalSampleSize, coltrane.intervalSampleSize);

  const generated = makeSequence({
    length: 10,
    mode: "random",
    selectedPerformers: ["Charlie Parker"],
    random: seededRandom(501),
  });
  assert.deepEqual(generated.meta.source.performers, ["Charlie Parker"]);
  assert.equal(
    generated.meta.source.intervalSampleSize,
    parker.intervalSampleSize,
  );
  for (const interval of intervalsOf(generated.notes)) {
    assert.ok(parker.intervalCounts[interval] > 0);
  }
});

test("le Markov conserve un ordre variable borné à huit", () => {
  const results = Array.from({ length: 80 }, (_, index) =>
    makeSequence({
      length: 10,
      mode: "random",
      selectedPerformers: DEFAULT_PERFORMERS,
      random: seededRandom(index + 600),
    }),
  );
  let highestOrder = 0;
  for (const result of results) {
    assert.equal(result.meta.source.maxOrder, JAZZ_MARKOV_MAX_ORDER);
    assert.equal(
      result.meta.source.ordersUsed.length,
      result.notes.length - 1,
    );
    for (const order of result.meta.source.ordersUsed) {
      assert.ok(order >= 0 && order <= JAZZ_MARKOV_MAX_ORDER);
      highestOrder = Math.max(highestOrder, order);
    }
  }
  assert.equal(highestOrder, JAZZ_MARKOV_MAX_ORDER);
  assert.equal(JAZZ_MARKOV_MAX_ORDER, 8);
  assert.equal(JAZZ_MARKOV_MIN_CONTEXT_COUNT, 2);
});

test("les phrases réelles respectent strictement la sélection", () => {
  for (const performer of ["John Coltrane", "Louis Armstrong", "Chet Baker"]) {
    const result = makeSequence({
      mode: "jazz",
      selectedPerformers: [performer],
      random: seededRandom(performer.length),
    });
    assert.equal(result.meta.source.kind, "transcription");
    assert.match(result.meta.source.label, new RegExp(`^${performer}`));
    assert.deepEqual(result.meta.source.performers, [performer]);
    assert.equal(
      result.meta.source.url.startsWith(
        "https://jazzomat.hfm-weimar.de/",
      ),
      true,
    );
    assert.ok(Number.isFinite(result.meta.source.barStart));
    assert.ok(Number.isFinite(result.meta.source.transposition));
    assert.ok(result.meta.source.phrase);
    assert.ok(Number.isFinite(result.meta.originalTempo));
  }
});

test("les sélections vides sont refusées", () => {
  assert.throws(
    () =>
      makeSequence({
        mode: "random",
        selectedPerformers: [],
        random: seededRandom(),
      }),
    /Sélectionne au moins un musicien/,
  );
});

test("seuls les six solos calibrés exposent un enregistrement", async () => {
  const withAudio = WJAZZD_SOLOS.filter((solo) => solo.audioFile);
  assert.equal(withAudio.length, 6);
  assert.ok(withAudio.every((solo) => solo.performer === "Charlie Parker"));
  await Promise.all(
    withAudio.map(async (solo) => {
      assert.match(solo.audioFile, /^audio\/parker\/[a-z0-9-]+\.mp3$/);
      assert.match(
        solo.audioSourceUrl,
        /^https:\/\/www\.youtube\.com\/watch\?v=/,
      );
      assert.ok(Number.isFinite(solo.audioOffset));
      const file = await stat(new URL(`../${solo.audioFile}`, import.meta.url));
      assert.ok(file.size > 1_000_000);
    }),
  );
  assert.ok(
    WJAZZD_SOLOS
      .filter((solo) => !solo.audioFile)
      .every((solo) => solo.audioSourceUrl === undefined),
  );
});

test("le mode réel reste limité à 5–15 notes", () => {
  const options = (maxNotes) => ({
    mode: "jazz",
    selectedPerformers: ["Charlie Parker"],
    random: seededRandom(42),
    ...(maxNotes === undefined ? {} : { maxNotes }),
  });
  const defaultLimit = makeSequence(options());
  const fiveNotes = makeSequence(options(5));
  const oversizedLimit = makeSequence(options(99));

  assert.equal(defaultLimit.notes.length, 15);
  assert.equal(defaultLimit.meta.source.maxNotes, 15);
  assert.deepEqual(fiveNotes.notes, defaultLimit.notes.slice(0, 5));
  assert.deepEqual(oversizedLimit.notes, defaultLimit.notes);
  assert.equal(fiveNotes.timings.length, fiveNotes.notes.length);
});

test("les rythmes, transpositions et chicks annotés sont conservés", () => {
  const results = Array.from({ length: 48 }, (_, index) =>
    makeSequence({
      mode: "jazz",
      selectedPerformers: DEFAULT_PERFORMERS,
      random: seededRandom(index + 900),
    }),
  );
  assert.ok(results.some((result) => result.chicks.length > 0));
  assert.ok(
    results.some((result) => result.meta.source.transposition !== 0),
  );
  for (const result of results) {
    assert.ok(Math.abs(result.meta.source.transposition) <= 6);
    assert.equal(result.timings.length, result.notes.length);
    assert.equal(result.timings[0].offset, 0);
    assert.ok(result.timings.every((timing) => timing.duration > 0));
    assert.ok(
      result.timings.every(
        (timing, index) =>
          index === 0 || timing.offset >= result.timings[index - 1].offset,
      ),
    );
    const lastTiming = result.timings.at(-1);
    const playbackEnd = lastTiming.offset + lastTiming.duration;
    assert.ok(
      result.chicks.every(({ beat }) => beat === 2 || beat === 4),
    );
    assert.ok(
      result.chicks.every(
        ({ offset }) => offset >= 0 && offset < playbackEnd,
      ),
    );
  }
});

test("la longueur générée est bornée", () => {
  assert.equal(
    makeSequence({
      length: 1,
      mode: "random",
      selectedPerformers: ["Charlie Parker"],
      random: seededRandom(),
    }).notes.length,
    3,
  );
  assert.equal(
    makeSequence({
      length: 99,
      mode: "random",
      selectedPerformers: ["Charlie Parker"],
      random: seededRandom(),
    }).notes.length,
    15,
  );
});

test("les statistiques ne comptent que les phrases terminées", () => {
  const summary = summarizeRecords([
    {
      completedAt: "2026-07-26T12:00:00Z",
      attempts: [
        { interval: 2, guesses: [{ midi: 62 }], responseMs: 1000 },
        {
          interval: -1,
          guesses: [{ midi: 61 }, { midi: 60 }],
          responseMs: 2000,
        },
      ],
    },
    {
      completedAt: null,
      attempts: [
        { interval: 5, guesses: [{ midi: 65 }], responseMs: 500 },
      ],
    },
  ]);

  assert.equal(summary.exercises, 1);
  assert.equal(summary.notes, 2);
  assert.equal(summary.accuracy, 0.5);
  assert.equal(summary.averageResponseMs, 1500);
});

test("la première note compte comme saisie mais pas comme intervalle", () => {
  const summary = summarizeRecords([
    {
      completedAt: "2026-07-26T12:00:00Z",
      attempts: Array.from({ length: 3 }, () => ({
        interval: null,
        guesses: [{ midi: 60 }],
        responseMs: 500,
      })),
    },
  ]);
  assert.equal(summary.notes, 3);
  assert.equal(summary.weakIntervals.length, 0);
});
