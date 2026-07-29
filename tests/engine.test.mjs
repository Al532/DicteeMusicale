import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import {
  DEFAULT_PERFORMERS,
  WJAZZD_PERFORMERS,
  WJAZZD_SOLOS,
} from "../data/wjazzd-solos.js";
import { WJAZZD_CHORDS } from "../data/wjazzd-chords.js";

import {
  BASS_MAX_MIDI,
  BASS_MIN_MIDI,
  JAZZ_MARKOV_MAX_ORDER,
  JAZZ_MARKOV_MIN_CONTEXT_COUNT,
  bassPitchClassForChord,
  isCorrectMidi,
  jazzCorpusSummary,
  jazzPhraseCatalog,
  keyboardLayoutForNotes,
  makeJazzTranspositionCycle,
  makeSequence,
  normalizePerformerSelection,
  phraseRatingKey,
  pitchClass,
  playbackStartOnStrongBeat,
  randomDifferentJazzTransposition,
  randomJazzTransposition,
  voiceBassHits,
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

test("les fondamentales et renversements WJazzD sont interprétés", () => {
  assert.equal(bassPitchClassForChord("Fj7"), 5);
  assert.equal(bassPitchClassForChord("Eb-7"), 3);
  assert.equal(bassPitchClassForChord("F#7"), 6);
  assert.equal(bassPitchClassForChord("C-/Bb"), 10);
  assert.equal(bassPitchClassForChord("D7/F#"), 6);
  assert.equal(bassPitchClassForChord("NC"), null);
  assert.equal(bassPitchClassForChord(""), null);
});

test("la basse est transposée et conduite dans la tessiture des samples", () => {
  const hits = voiceBassHits(
    [
      { offset: 0, duration: 1, rootPitchClass: 0, chord: "Cj7" },
      { offset: 1, duration: 1, rootPitchClass: 5, chord: "F7" },
      { offset: 2, duration: 1, rootPitchClass: 11, chord: "B7" },
    ],
    2,
  );
  assert.deepEqual(
    hits.map(({ midi }) => pitchClass(midi)),
    [2, 7, 1],
  );
  assert.ok(
    hits.every(
      ({ midi }) => midi >= BASS_MIN_MIDI && midi <= BASS_MAX_MIDI,
    ),
  );
});

test("la lecture part du dernier temps fort de la mesure", () => {
  const fourFour = [
    [0, 1],
    [0.5, 2],
    [1, 3],
    [1.5, 4],
    [2, 1],
    [2.5, 2],
    [3, 3],
    [3.5, 4],
  ];
  assert.equal(playbackStartOnStrongBeat(fourFour, 0.8), 0);
  assert.equal(playbackStartOnStrongBeat(fourFour, 1), 1);
  assert.equal(playbackStartOnStrongBeat(fourFour, 1.4), 1);
  assert.equal(playbackStartOnStrongBeat(fourFour, 2.8), 2);

  const threeFour = [
    [0, 1],
    [0.5, 2],
    [1, 3],
    [1.5, 1],
    [2, 2],
    [2.5, 3],
  ];
  assert.equal(playbackStartOnStrongBeat(threeFour, 1.2), 0);
  assert.equal(playbackStartOnStrongBeat([], 1.2), 1.2);
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

test("le modèle Markov utilise tout le corpus malgré la sélection des musiciens", () => {
  const corpus = jazzCorpusSummary();
  assert.equal(corpus.performerCount, 78);
  assert.equal(corpus.soloCount, 456);
  assert.equal(corpus.phraseCount, 11_082);
  const generated = makeSequence({
    length: 10,
    mode: "random",
    selectedPerformers: ["Charlie Parker"],
    random: seededRandom(501),
  });
  assert.equal(generated.meta.source.performers.length, 78);
  assert.equal(
    generated.meta.source.intervalSampleSize,
    corpus.intervalSampleSize,
  );
  for (const interval of intervalsOf(generated.notes)) {
    assert.ok(corpus.intervalCounts[interval] > 0);
  }
});

test("le filtre d’étoiles restreint les phrases réelles et le corpus génératif", () => {
  const parker = WJAZZD_SOLOS.find(
    (solo) =>
      solo.performer === "Charlie Parker" &&
      solo.phrases.some(([start, end]) => end > start),
  );
  const coltrane = WJAZZD_SOLOS.find(
    (solo) =>
      solo.performer === "John Coltrane" &&
      solo.phrases.some(([start, end]) => end > start),
  );
  const parkerPhrase = parker.phrases.find(([start, end]) => end > start);
  const coltranePhrase = coltrane.phrases.find(([start, end]) => end > start);
  const parkerKey = phraseRatingKey(parker.id, parkerPhrase[2]);
  const coltraneKey = phraseRatingKey(coltrane.id, coltranePhrase[2]);
  const phraseRatings = {
    [parkerKey]: { rating: 3 },
    [coltraneKey]: { rating: 2 },
  };

  const filtered = jazzCorpusSummary({
    phraseRatings,
    minimumRating: 2,
  });
  assert.equal(filtered.performerCount, 2);
  assert.equal(filtered.phraseCount, 2);

  const complete = jazzCorpusSummary();
  const unrated = jazzCorpusSummary({
    phraseRatings,
    minimumRating: "unrated",
  });
  assert.equal(unrated.phraseCount, complete.phraseCount - 2);

  const real = makeSequence({
    mode: "jazz",
    selectedPerformers: ["Charlie Parker"],
    phraseRatings,
    minimumRating: 3,
    random: seededRandom(42),
  });
  assert.equal(real.meta.source.phraseKey, parkerKey);
  assert.equal(real.meta.source.rating, 3);

  const unratedReal = makeSequence({
    mode: "jazz",
    selectedPerformers: ["Charlie Parker"],
    phraseRatings,
    minimumRating: "unrated",
    random: seededRandom(42),
  });
  assert.notEqual(unratedReal.meta.source.phraseKey, parkerKey);
  assert.equal(unratedReal.meta.source.rating, 0);

  const unratedGenerated = makeSequence({
    mode: "random",
    phraseRatings,
    minimumRating: "unrated",
    random: seededRandom(43),
  });
  assert.equal(unratedGenerated.meta.source.minimumRating, "unrated");

  assert.throws(
    () =>
      makeSequence({
        mode: "jazz",
        selectedPerformers: ["John Coltrane"],
        phraseRatings,
        minimumRating: 3,
      }),
    /Aucune phrase/,
  );
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

test("la sélection vide est refusée seulement pour les phrases réelles", () => {
  assert.throws(
    () =>
      makeSequence({
        mode: "jazz",
        selectedPerformers: [],
        random: seededRandom(),
      }),
    /Sélectionne au moins un musicien/,
  );
  assert.equal(
    makeSequence({
      mode: "random",
      selectedPerformers: [],
      random: seededRandom(),
    }).meta.source.performers.length,
    78,
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

test("le mode réel reste limité à 5–20 notes", () => {
  const options = (maxNotes) => ({
    mode: "jazz",
    selectedPerformers: ["Charlie Parker"],
    random: seededRandom(42),
    ...(maxNotes === undefined ? {} : { maxNotes }),
  });
  const defaultLimit = makeSequence(options());
  const fiveNotes = makeSequence(options(5));
  const oversizedLimit = makeSequence(options(99));

  assert.equal(defaultLimit.notes.length, 20);
  assert.equal(defaultLimit.meta.source.maxNotes, 20);
  assert.deepEqual(fiveNotes.notes, defaultLimit.notes.slice(0, 5));
  assert.deepEqual(oversizedLimit.notes, defaultLimit.notes);
  assert.equal(fiveNotes.timings.length, fiveNotes.notes.length);
});

test("le protocole peut écouter une phrase précise en entier et dans le ton original", () => {
  const solo = WJAZZD_SOLOS.find(
    (candidate) =>
      candidate.performer === "Paul Desmond" &&
      candidate.phrases.some(([start, end]) => end - start + 1 > 20),
  );
  const phrase = solo.phrases.find(
    ([start, end]) => end - start + 1 > 20,
  );
  const phraseKey = phraseRatingKey(solo.id, phrase[2]);
  const result = makeSequence({
    mode: "jazz",
    selectedPerformers: [solo.performer],
    targetPhraseKey: phraseKey,
    fullPhrase: true,
    transpositionOverride: 0,
    random: seededRandom(91),
  });

  assert.equal(result.meta.source.phraseKey, phraseKey);
  assert.equal(result.meta.source.transposition, 0);
  assert.equal(result.notes.length, phrase[1] - phrase[0] + 1);
  assert.equal(result.meta.source.truncated, false);
});

test("les rythmes, transpositions, accords et chicks annotés sont conservés", () => {
  const results = Array.from({ length: 48 }, (_, index) =>
    makeSequence({
      mode: "jazz",
      selectedPerformers: DEFAULT_PERFORMERS,
      random: seededRandom(index + 900),
    }),
  );
  assert.ok(results.some((result) => result.chicks.length > 0));
  assert.ok(results.every((result) => result.bassHits.length > 0));
  assert.ok(results.some((result) => result.timings[0].offset > 0));
  assert.ok(
    results.some((result) => result.meta.source.transposition !== 0),
  );
  for (const result of results) {
    assert.ok(Math.abs(result.meta.source.transposition) <= 6);
    assert.equal(result.timings.length, result.notes.length);
    assert.ok(result.timings[0].offset >= 0);
    assert.equal(
      result.timings[0].offset,
      Number(
        (
          result.meta.source.phraseOnsetStart -
          result.meta.source.onsetStart
        ).toFixed(4),
      ),
    );
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
    assert.ok(
      result.bassHits.every(
        ({ offset, duration, midi, rootPitchClass, chord }) =>
          offset >= 0 &&
          offset < playbackEnd &&
          duration > 0 &&
          midi >= BASS_MIN_MIDI &&
          midi <= BASS_MAX_MIDI &&
          pitchClass(midi) ===
            pitchClass(rootPitchClass + result.meta.source.transposition) &&
          typeof chord === "string",
      ),
    );
  }
});

test("les 456 solos contiennent leur grille harmonique WJazzD", () => {
  assert.equal(WJAZZD_SOLOS.length, 456);
  assert.ok(WJAZZD_SOLOS.every((solo) => WJAZZD_CHORDS[solo.id].length > 0));
  assert.ok(
    Object.values(WJAZZD_CHORDS).reduce(
      (sum, chords) => sum + chords.length,
      0,
    ) > 30_000,
  );
});

test("les 21 samples chromatiques de basse sont présents", async () => {
  const sizes = await Promise.all(
    Array.from({ length: 21 }, (_, index) => index + BASS_MIN_MIDI).map(
      async (midi) => {
        const file = await stat(
          new URL(`../audio/bass/${midi}.mp3`, import.meta.url),
        );
        return file.size;
      },
    ),
  );
  assert.ok(sizes.every((size) => size > 20_000));
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

test("le catalogue public expose uniquement les phrases correspondant au filtre", () => {
  const ratings = {
    [phraseRatingKey(WJAZZD_SOLOS[0].id, WJAZZD_SOLOS[0].phrases[0][2])]: 3,
  };
  const catalog = jazzPhraseCatalog({
    phraseRatings: ratings,
    minimumRating: 3,
  });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].performer, WJAZZD_SOLOS[0].performer);
  assert.ok(catalog[0].noteCount >= 2);
});
