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

export function isCorrectPitchClass(targetMidi, guessMidi) {
  return pitchClass(targetMidi) === pitchClass(guessMidi);
}

function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomChoice(items, random) {
  return items[Math.floor(random() * items.length)];
}

function weightedChoice(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return items.at(-1).value;
}

function reflectIntoRange(note) {
  let reflected = note;
  while (reflected < MIN_MIDI || reflected > MAX_MIDI) {
    if (reflected < MIN_MIDI) reflected = MIN_MIDI + (MIN_MIDI - reflected);
    if (reflected > MAX_MIDI) reflected = MAX_MIDI - (reflected - MAX_MIDI);
  }
  return reflected;
}

function melodicSequence(length, random) {
  const intervals = [
    { value: -7, weight: 1 },
    { value: -5, weight: 3 },
    { value: -4, weight: 4 },
    { value: -3, weight: 6 },
    { value: -2, weight: 8 },
    { value: -1, weight: 7 },
    { value: 1, weight: 7 },
    { value: 2, weight: 8 },
    { value: 3, weight: 6 },
    { value: 4, weight: 4 },
    { value: 5, weight: 3 },
    { value: 7, weight: 1 },
  ];
  const notes = [randomInt(53, 65, random)];

  while (notes.length < length) {
    const interval = weightedChoice(intervals, random);
    notes.push(reflectIntoRange(notes.at(-1) + interval));
  }

  return {
    notes,
    meta: {
      label: "Phrase mélodique",
      source: { kind: "generated", label: "Phrase générée par l’application" },
    },
  };
}

function diatonicSequence(length, random) {
  const root = randomInt(0, 11, random);
  const scale = random() < 0.78 ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const candidates = [];
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const scaleDegree = scale.indexOf(pitchClass(midi - root));
    if (scaleDegree !== -1) candidates.push({ midi, scaleDegree });
  }

  let candidateIndex = randomInt(3, candidates.length - 4, random);
  const notes = [candidates[candidateIndex].midi];
  const moves = [-3, -2, -1, -1, 1, 1, 2, 3];

  while (notes.length < length) {
    let move = randomChoice(moves, random);
    if (candidateIndex + move < 0 || candidateIndex + move >= candidates.length) move *= -1;
    candidateIndex += move;
    notes.push(candidates[candidateIndex].midi);
  }

  return {
    notes,
    meta: {
      label: scale[2] === 4 ? "Phrase diatonique majeure" : "Phrase diatonique mineure",
      source: { kind: "generated", label: "Phrase générée par l’application" },
    },
  };
}

function fittingTranspositions(notes) {
  const lowest = Math.min(...notes);
  const highest = Math.max(...notes);
  const shifts = [];
  for (let shift = MIN_MIDI - lowest; shift <= MAX_MIDI - highest; shift += 1) {
    if (lowest + shift >= MIN_MIDI && highest + shift <= MAX_MIDI) {
      shifts.push(shift);
    }
  }
  return shifts;
}

function jazzSequence(length, random) {
  const candidates = [];
  for (const solo of PARKER_SOLOS) {
    for (let start = 0; start <= solo.events.length - length; start += 1) {
      const events = solo.events.slice(start, start + length);
      const notes = events.map(([midi]) => midi);
      const gaps = events.slice(1).map((event, index) => event[1] - events[index][1]);
      const transpositions = fittingTranspositions(notes);
      if (
        events[0][2] < 1 ||
        !transpositions.length ||
        gaps.some((gap) => gap > 1.15)
      ) {
        continue;
      }
      candidates.push({ solo, events, notes, transpositions });
    }
  }

  const excerpt = randomChoice(candidates, random);
  const transposition = randomChoice(excerpt.transpositions, random);
  const transposedNotes = excerpt.notes.map((note) => note + transposition);
  const firstBar = excerpt.events[0][2];
  const lastBar = excerpt.events.at(-1)[2];
  const barLabel =
    firstBar === lastBar ? `mesure ${firstBar}` : `mesures ${firstBar}–${lastBar}`;

  return {
    notes: transposedNotes,
    meta: {
      label: `${excerpt.solo.performer} — ${excerpt.solo.title}`,
      source: {
        kind: "transcription",
        label: `${excerpt.solo.performer}, « ${excerpt.solo.title} », ${barLabel}`,
        dataset: excerpt.solo.dataset,
        url: excerpt.solo.sourceUrl,
        recordingDate: excerpt.solo.recordingDate,
        barStart: firstBar,
        barEnd: lastBar,
        onsetStart: excerpt.events[0][1],
        onsetEnd: excerpt.events.at(-1)[1],
        transposition,
      },
    },
  };
}

export function makeSequence({ length = 5, mode = "melodic", random = Math.random } = {}) {
  const safeLength = Math.max(3, Math.min(10, Math.round(length)));
  if (mode === "diatonic") return diatonicSequence(safeLength, random);
  if (mode === "jazz") return jazzSequence(safeLength, random);
  return melodicSequence(safeLength, random);
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
  return `${direction} ${names[Math.min(12, Math.abs(semitones))] ?? `${Math.abs(semitones)} demi-tons`}`;
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
