import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { PARKER_SOLOS } from "../data/parker-solos.js";

import {
  PARKER_INTERVAL_COUNTS,
  PARKER_INTERVAL_SAMPLE_SIZE,
  PARKER_MARKOV_MAX_COPY_RUN,
  PARKER_MARKOV_MAX_ORDER,
  PARKER_MARKOV_MIN_CONTEXT_COUNT,
  isCorrectMidi,
  keyboardLayoutForNotes,
  makeSequence,
  pitchClass,
  randomParkerTransposition,
  summarizeRecords,
} from "../src/engine.js";

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const CORPUS_INTERVAL_SEQUENCES = PARKER_SOLOS.flatMap((solo) =>
  solo.phrases.map(([start, end]) => {
    const notes = solo.events.slice(start, end + 1).map(([midi]) => midi);
    return notes.slice(1).map((note, index) => note - notes[index]);
  }),
);

function intervalsOf(notes) {
  return notes.slice(1).map((note, index) => note - notes[index]);
}

function containsSubsequence(sequence, candidate) {
  if (candidate.length > sequence.length) return false;
  for (let start = 0; start <= sequence.length - candidate.length; start += 1) {
    if (candidate.every((interval, index) => interval === sequence[start + index])) {
      return true;
    }
  }
  return false;
}

function longestCorpusMatch(sequence) {
  for (let length = sequence.length; length > 0; length -= 1) {
    for (let start = 0; start <= sequence.length - length; start += 1) {
      const candidate = sequence.slice(start, start + length);
      if (CORPUS_INTERVAL_SEQUENCES.some((corpus) => containsSubsequence(corpus, candidate))) {
        return length;
      }
    }
  }
  return 0;
}

function contextSupport(context) {
  let count = 0;
  for (const sequence of CORPUS_INTERVAL_SEQUENCES) {
    for (let index = context.length; index < sequence.length; index += 1) {
      if (
        context.every(
          (interval, contextIndex) =>
            interval === sequence[index - context.length + contextIndex],
        )
      ) {
        count += 1;
      }
    }
  }
  return count;
}

test("la correction exige la hauteur MIDI exacte", () => {
  assert.equal(isCorrectMidi(60, 60), true);
  assert.equal(isCorrectMidi(60, 72), false);
  assert.equal(isCorrectMidi(60, 61), false);
  assert.equal(pitchClass(-1), 11);
});

test("les 12 transpositions, dont la tonalité originale, sont équiprobables", () => {
  const shifts = Array.from({ length: 12 }, (_, bucket) =>
    randomParkerTransposition(() => (bucket + 0.25) / 12),
  );
  assert.deepEqual(
    [...new Set(shifts.map((shift) => pitchClass(shift)))].sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, index) => index),
  );
  assert.ok(shifts.every((shift) => shift >= -6 && shift <= 6));
  assert.ok(shifts.includes(0));
  assert.equal(randomParkerTransposition(() => 0.01), 0);

  let draw = 0;
  const negativeTritone = randomParkerTransposition(() => [6.25 / 12, 0.25][draw++]);
  draw = 0;
  const positiveTritone = randomParkerTransposition(() => [6.25 / 12, 0.75][draw++]);
  assert.equal(negativeTritone, -6);
  assert.equal(positiveTritone, 6);
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
    assert.ok(notes.every((note) => note >= layout.startMidi && note <= layout.endMidi));
    assert.ok([0, 5].includes(pitchClass(layout.startMidi)));
    assert.ok([4, 11].includes(pitchClass(layout.endMidi)));
  }
});

test("les 104 phrases restent entièrement visibles dans les 13 transpositions signées", () => {
  const transpositions = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
  let checked = 0;
  for (const solo of PARKER_SOLOS) {
    for (const [start, end] of solo.phrases) {
      const original = solo.events.slice(start, end + 1).map(([midi]) => midi);
      for (const transposition of transpositions) {
        const notes = original.map((midi) => midi + transposition);
        const layout = keyboardLayoutForNotes(notes);
        assert.ok(notes.every((note) => note >= layout.startMidi && note <= layout.endMidi));
        assert.ok(layout.chunkCount >= 4 && layout.chunkCount <= 6);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 104 * 13);
});

test("le mode aléatoire Markov utilise les 1 584 intervalles intra-phrase du corpus", () => {
  assert.equal(PARKER_INTERVAL_SAMPLE_SIZE, 1584);
  for (const length of [3, 5, 10, 15]) {
    const result = makeSequence({ length, mode: "random", random: seededRandom(length) });
    assert.equal(result.notes.length, length);
    assert.ok(result.notes.every((note) => note >= 48 && note <= 71));
    assert.ok(
      result.notes.every(
        (note) => note >= result.keyboard.startMidi && note <= result.keyboard.endMidi,
      ),
    );
    for (let index = 1; index < result.notes.length; index += 1) {
      const interval = result.notes[index] - result.notes[index - 1];
      assert.ok(PARKER_INTERVAL_COUNTS[interval] > 0);
    }
    assert.equal(result.meta.source.model, "variable-order-markov");
    assert.equal(result.meta.source.maxOrder, 6);
  }
});

test("le Markov utilise le plus long contexte suffisamment représenté", () => {
  const results = Array.from({ length: 120 }, (_, index) =>
    makeSequence({ length: 10, mode: "random", random: seededRandom(index + 500) }),
  );
  let highestOrder = 0;

  for (const result of results) {
    const intervals = intervalsOf(result.notes);
    const orders = result.meta.source.ordersUsed;
    assert.equal(orders.length, intervals.length);
    assert.equal(orders[0], 0);
    for (let index = 0; index < orders.length; index += 1) {
      const order = orders[index];
      assert.ok(order >= 0 && order <= PARKER_MARKOV_MAX_ORDER);
      if (order > 0) {
        const context = intervals.slice(index - order, index);
        assert.ok(contextSupport(context) >= PARKER_MARKOV_MIN_CONTEXT_COUNT);
      }
      highestOrder = Math.max(highestOrder, order);
    }
  }

  assert.equal(highestOrder, PARKER_MARKOV_MAX_ORDER);
});

test("le Markov reste varié sans recopier une phrase ou un long fragment", () => {
  const generated = [];
  for (let length = 3; length <= 10; length += 1) {
    for (let seed = 1; seed <= 40; seed += 1) {
      generated.push(
        intervalsOf(
          makeSequence({
            length,
            mode: "random",
            random: seededRandom(length * 1000 + seed),
          }).notes,
        ),
      );
    }
  }

  assert.ok(new Set(generated.map((sequence) => sequence.join(","))).size > 250);
  for (const sequence of generated) {
    assert.ok(
      !CORPUS_INTERVAL_SEQUENCES.some(
        (corpus) =>
          corpus.length === sequence.length &&
          corpus.every((interval, index) => interval === sequence[index]),
      ),
    );
    assert.ok(longestCorpusMatch(sequence) <= PARKER_MARKOV_MAX_COPY_RUN);
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
  assert.match(result.meta.source.audioFile, /^audio\/parker\/.+\.mp3$/);
  assert.match(result.meta.source.audioSourceUrl, /^https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.ok(Number.isFinite(result.meta.source.audioOffset));
  assert.ok(result.meta.source.onsetEnd > result.meta.source.onsetStart);
  assert.equal(result.notes.length, result.meta.source.noteCount);
});

test("seules les phrases réelles disposent d’un enregistrement original", () => {
  const generated = makeSequence({
    length: 8,
    mode: "random",
    random: seededRandom(8),
  });
  const real = makeSequence({
    mode: "parker",
    random: seededRandom(8),
  });

  assert.equal(generated.meta.source.audioFile, undefined);
  assert.match(real.meta.source.audioFile, /^audio\/parker\/.+\.mp3$/);
});

test("les six enregistrements Parker sont présents sous leur nom stable", async () => {
  assert.equal(PARKER_SOLOS.length, 6);
  await Promise.all(
    PARKER_SOLOS.map(async (solo) => {
      assert.match(solo.audioFile, /^audio\/parker\/[a-z0-9-]+\.mp3$/);
      assert.match(solo.audioSourceUrl, /^https:\/\/www\.youtube\.com\/watch\?v=/);
      assert.ok(Number.isFinite(solo.audioOffset));
      const file = await stat(new URL(`../${solo.audioFile}`, import.meta.url));
      assert.ok(file.size > 1_000_000);
    }),
  );
});

test("le mode Parker est toujours limité à 5–15 notes", () => {
  const defaultLimit = makeSequence({
    mode: "parker",
    random: seededRandom(42),
  });
  const fiveNotes = makeSequence({
    mode: "parker",
    maxNotes: 5,
    random: seededRandom(42),
  });
  const oversizedLimit = makeSequence({
    mode: "parker",
    maxNotes: 99,
    random: seededRandom(42),
  });

  assert.equal(defaultLimit.notes.length, 15);
  assert.equal(defaultLimit.meta.source.maxNotes, 15);
  assert.deepEqual(fiveNotes.notes, defaultLimit.notes.slice(0, 5));
  assert.deepEqual(oversizedLimit.notes, defaultLimit.notes);
  assert.ok(fiveNotes.meta.source.fullPhraseNoteCount > 15);
  assert.equal(fiveNotes.meta.source.truncated, true);
  assert.equal(defaultLimit.meta.source.truncated, true);
  assert.equal(fiveNotes.timings.length, fiveNotes.notes.length);
  assert.equal(
    fiveNotes.meta.source.onsetEnd,
    fiveNotes.meta.source.onsetStart +
      fiveNotes.timings.at(-1).offset +
      fiveNotes.timings.at(-1).duration,
  );
});

test("la transposition Parker reste entre −6 et +6 et le clavier couvre toute la phrase", () => {
  const results = Array.from({ length: 48 }, (_, index) =>
    makeSequence({ mode: "parker", random: seededRandom(index + 20) }),
  );
  assert.ok(results.every((result) => Number.isInteger(result.meta.source.transposition)));
  assert.ok(results.every((result) => Math.abs(result.meta.source.transposition) <= 6));
  assert.ok(
    results.every((result) =>
      result.notes.every(
        (note) => note >= result.keyboard.startMidi && note <= result.keyboard.endMidi,
      ),
    ),
  );
  assert.ok(results.every((result) => result.keyboard.chunkCount >= 4));
  assert.ok(results.some((result) => result.meta.source.transposition !== 0));
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

test("les chicks Parker suivent les temps 2 et 4 sans dépasser la phrase", () => {
  assert.ok(PARKER_SOLOS.every((solo) => solo.beats.length > 0));
  const results = Array.from({ length: 48 }, (_, index) =>
    makeSequence({ mode: "parker", random: seededRandom(index + 200) }),
  );

  assert.ok(results.some((result) => result.chicks.length > 0));
  for (const result of results) {
    const lastTiming = result.timings.at(-1);
    const playbackEnd = lastTiming.offset + lastTiming.duration;
    assert.ok(result.chicks.every(({ beat }) => beat === 2 || beat === 4));
    assert.ok(result.chicks.every(({ offset }) => offset >= 0 && offset < playbackEnd));
  }
});

test("la longueur est bornée", () => {
  assert.equal(
    makeSequence({ length: 1, mode: "random", random: seededRandom() }).notes.length,
    3,
  );
  assert.equal(
    makeSequence({ length: 99, mode: "random", random: seededRandom() }).notes.length,
    15,
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
  assert.equal(summary.accuracy, 1);
  assert.deepEqual(summary.weakIntervals, []);
});
