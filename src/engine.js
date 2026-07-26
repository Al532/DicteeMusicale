import { PARKER_SOLOS } from "../data/parker-solos.js";

export const NOTE_NAMES = [
  "Do",
  "Do♯",
  "Ré",
  "Mi♭",
  "Mi",
  "Fa",
  "Fa♯",
  "Sol",
  "La♭",
  "La",
  "Si♭",
  "Si",
];

const MIN_MIDI = 48;
const MAX_MIDI = 71;

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function isCorrectMidi(targetMidi, guessMidi) {
  return targetMidi === guessMidi;
}

function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomChoice(items, random) {
  return items[Math.floor(random() * items.length)];
}

export function randomParkerTransposition(random = Math.random) {
  const pitchClassShift = randomInt(0, 11, random);
  if (pitchClassShift === 6) return random() < 0.5 ? -6 : 6;
  return pitchClassShift > 6 ? pitchClassShift - 12 : pitchClassShift;
}

function chunkIndex(midi) {
  const octave = Math.floor(midi / 12);
  return octave * 2 + (pitchClass(midi) >= 5 ? 1 : 0);
}

function chunkBounds(index) {
  const octave = Math.floor(index / 2);
  const isFaChunk = index % 2 === 1;
  return isFaChunk
    ? { start: octave * 12 + 5, end: octave * 12 + 11 }
    : { start: octave * 12, end: octave * 12 + 4 };
}

export function keyboardLayoutForNotes(notes, minimumChunks = 4) {
  if (!notes.length) throw new Error("Une phrase est nécessaire pour construire le clavier.");
  const phraseMin = Math.min(...notes);
  const phraseMax = Math.max(...notes);
  const phraseCenter = (phraseMin + phraseMax) / 2;
  let firstChunk = chunkIndex(phraseMin);
  let lastChunk = chunkIndex(phraseMax);

  while (lastChunk - firstChunk + 1 < minimumChunks) {
    const leftStart = chunkBounds(firstChunk - 1).start;
    const currentEnd = chunkBounds(lastChunk).end;
    const currentStart = chunkBounds(firstChunk).start;
    const rightEnd = chunkBounds(lastChunk + 1).end;
    const leftDistance = Math.abs((leftStart + currentEnd) / 2 - phraseCenter);
    const rightDistance = Math.abs((currentStart + rightEnd) / 2 - phraseCenter);
    if (leftDistance <= rightDistance) firstChunk -= 1;
    else lastChunk += 1;
  }

  return {
    startMidi: chunkBounds(firstChunk).start,
    endMidi: chunkBounds(lastChunk).end,
    chunkCount: lastChunk - firstChunk + 1,
    firstChunk,
    lastChunk,
  };
}

function buildParkerIntervalPool() {
  const intervals = [];
  for (const solo of PARKER_SOLOS) {
    for (const [start, end] of solo.phrases) {
      for (let index = start + 1; index <= end; index += 1) {
        const previous = solo.events[index - 1]?.[0];
        const current = solo.events[index]?.[0];
        if (Number.isFinite(previous) && Number.isFinite(current)) {
          intervals.push(current - previous);
        }
      }
    }
  }
  return intervals;
}

const PARKER_INTERVAL_POOL = buildParkerIntervalPool();

export const PARKER_INTERVAL_SAMPLE_SIZE = PARKER_INTERVAL_POOL.length;
export const PARKER_INTERVAL_COUNTS = Object.freeze(
  PARKER_INTERVAL_POOL.reduce((counts, interval) => {
    counts[interval] = (counts[interval] ?? 0) + 1;
    return counts;
  }, {}),
);

function randomSequence(length, random) {
  const notes = [randomInt(53, 65, random)];

  while (notes.length < length) {
    const previous = notes.at(-1);
    const availableIntervals = PARKER_INTERVAL_POOL.filter((interval) => {
      const candidate = previous + interval;
      return candidate >= MIN_MIDI && candidate <= MAX_MIDI;
    });
    notes.push(previous + randomChoice(availableIntervals, random));
  }

  return {
    notes,
    meta: {
      label: "Aléatoire — statistiques Parker",
      source: {
        kind: "generated",
        label: `Générée par tirage dans ${PARKER_INTERVAL_SAMPLE_SIZE} intervalles Parker`,
      },
    },
  };
}

function parkerSequence(random) {
  const candidates = [];
  for (const solo of PARKER_SOLOS) {
    for (const phrase of solo.phrases) {
      const [start, end] = phrase;
      const events = solo.events.slice(start, end + 1);
      const notes = events.map(([midi]) => midi);
      if (notes.length < 2) continue;
      candidates.push({ solo, phrase, events, notes });
    }
  }

  const excerpt = randomChoice(candidates, random);
  const transposition = randomParkerTransposition(random);
  const transposedNotes = excerpt.notes.map((note) => note + transposition);
  const firstOnset = excerpt.events[0][1];
  const timings = excerpt.events.map((event) => ({
    offset: Number((event[1] - firstOnset).toFixed(4)),
    duration: event[2],
  }));
  const firstBar = excerpt.events[0][3];
  const lastBar = excerpt.events.at(-1)[3];
  const barLabel =
    firstBar === lastBar ? `mesure ${firstBar}` : `mesures ${firstBar}–${lastBar}`;

  return {
    notes: transposedNotes,
    timings,
    meta: {
      label: `${excerpt.solo.performer} — ${excerpt.solo.title}`,
      originalTempo: excerpt.solo.originalTempo,
      source: {
        kind: "transcription",
        label: `${excerpt.solo.performer}, « ${excerpt.solo.title} », phrase ${excerpt.phrase[2]}, ${barLabel}`,
        dataset: excerpt.solo.dataset,
        url: excerpt.solo.sourceUrl,
        recordingDate: excerpt.solo.recordingDate,
        phrase: excerpt.phrase[2],
        noteCount: transposedNotes.length,
        barStart: firstBar,
        barEnd: lastBar,
        onsetStart: excerpt.events[0][1],
        onsetEnd: excerpt.events.at(-1)[1],
        originalTempo: excerpt.solo.originalTempo,
        transposition,
      },
    },
  };
}

export function makeSequence({ length = 5, mode = "random", random = Math.random } = {}) {
  const safeLength = Math.max(3, Math.min(10, Math.round(length)));
  const sequence =
    mode === "parker" || mode === "jazz"
      ? parkerSequence(random)
      : randomSequence(safeLength, random);
  return {
    ...sequence,
    keyboard: keyboardLayoutForNotes(sequence.notes),
  };
}

export function intervalLabel(semitones) {
  if (semitones === 0) return "unisson";
  const names = {
    1: "2de mineure",
    2: "2de majeure",
    3: "3ce mineure",
    4: "3ce majeure",
    5: "4te juste",
    6: "triton",
    7: "5te juste",
    8: "6te mineure",
    9: "6te majeure",
    10: "7e mineure",
    11: "7e majeure",
    12: "octave",
  };
  const direction = semitones > 0 ? "↑" : "↓";
  const size = Math.abs(semitones);
  return `${direction} ${names[size] ?? `${size} demi-tons`}`;
}

export function summarizeRecords(records) {
  const completed = records.filter((record) => record.completedAt);
  const noteAttempts = completed.flatMap((record) => record.attempts ?? []);
  const firstTry = noteAttempts.filter((attempt) => attempt.guesses?.length === 1).length;
  const responseTimes = noteAttempts
    .map((attempt) => attempt.responseMs)
    .filter((value) => Number.isFinite(value) && value >= 0);

  const intervalMap = new Map();
  for (const record of completed) {
    for (const attempt of record.attempts ?? []) {
      const key = String(attempt.interval);
      const bucket = intervalMap.get(key) ?? {
        interval: attempt.interval,
        total: 0,
        firstTry: 0,
      };
      bucket.total += 1;
      if (attempt.guesses?.length === 1) bucket.firstTry += 1;
      intervalMap.set(key, bucket);
    }
  }

  const weakIntervals = [...intervalMap.values()]
    .filter((bucket) => bucket.total >= 3)
    .map((bucket) => ({
      ...bucket,
      accuracy: bucket.firstTry / bucket.total,
      label: intervalLabel(bucket.interval),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 3);

  return {
    exercises: completed.length,
    notes: noteAttempts.length,
    accuracy: noteAttempts.length ? firstTry / noteAttempts.length : null,
    averageResponseMs: responseTimes.length
      ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
      : null,
    weakIntervals,
  };
}
