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
export const PARKER_MARKOV_MAX_ORDER = 6;
export const PARKER_MARKOV_MIN_CONTEXT_COUNT = 2;
export const PARKER_MARKOV_MAX_COPY_RUN = 7;

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

function weightedChoice(entries, random) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let draw = random() * total;
  for (const [value, count] of entries) {
    draw -= count;
    if (draw < 0) return value;
  }
  return entries.at(-1)[0];
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

function buildParkerIntervalSequences() {
  const sequences = [];
  for (const solo of PARKER_SOLOS) {
    for (const [start, end] of solo.phrases) {
      const intervals = [];
      for (let index = start + 1; index <= end; index += 1) {
        const previous = solo.events[index - 1]?.[0];
        const current = solo.events[index]?.[0];
        if (Number.isFinite(previous) && Number.isFinite(current)) {
          intervals.push(current - previous);
        }
      }
      if (intervals.length) sequences.push(intervals);
    }
  }
  return sequences;
}

const PARKER_INTERVAL_SEQUENCES = buildParkerIntervalSequences();
const PARKER_INTERVAL_POOL = PARKER_INTERVAL_SEQUENCES.flat();

export const PARKER_INTERVAL_SAMPLE_SIZE = PARKER_INTERVAL_POOL.length;
export const PARKER_INTERVAL_COUNTS = Object.freeze(
  PARKER_INTERVAL_POOL.reduce((counts, interval) => {
    counts[interval] = (counts[interval] ?? 0) + 1;
    return counts;
  }, {}),
);

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function buildParkerMarkovModel() {
  const transitions = Array.from(
    { length: PARKER_MARKOV_MAX_ORDER + 1 },
    () => new Map(),
  );
  const phraseStarts = new Map();

  for (const sequence of PARKER_INTERVAL_SEQUENCES) {
    addCount(phraseStarts, sequence[0]);
    for (let index = 0; index < sequence.length; index += 1) {
      const maxOrder = Math.min(PARKER_MARKOV_MAX_ORDER, index);
      for (let order = 0; order <= maxOrder; order += 1) {
        const key = sequence.slice(index - order, index).join(",");
        let entry = transitions[order].get(key);
        if (!entry) {
          entry = { count: 0, next: new Map() };
          transitions[order].set(key, entry);
        }
        entry.count += 1;
        addCount(entry.next, sequence[index]);
      }
    }
  }

  return { transitions, phraseStarts };
}

const PARKER_MARKOV_MODEL = buildParkerMarkovModel();

function containsSubsequence(sequence, candidate) {
  if (candidate.length > sequence.length) return false;
  for (let start = 0; start <= sequence.length - candidate.length; start += 1) {
    if (candidate.every((interval, index) => interval === sequence[start + index])) {
      return true;
    }
  }
  return false;
}

function isExactCorpusPhrase(intervals) {
  return PARKER_INTERVAL_SEQUENCES.some(
    (sequence) =>
      sequence.length === intervals.length &&
      sequence.every((interval, index) => interval === intervals[index]),
  );
}

function exceedsCorpusCopyRun(intervals) {
  if (intervals.length <= PARKER_MARKOV_MAX_COPY_RUN) return false;
  const suffix = intervals.slice(-(PARKER_MARKOV_MAX_COPY_RUN + 1));
  return PARKER_INTERVAL_SEQUENCES.some((sequence) =>
    containsSubsequence(sequence, suffix),
  );
}

function availableMarkovEntries(entry, previousMidi, history, isFinal) {
  return [...entry.next.entries()].filter(([interval]) => {
    const candidateMidi = previousMidi + interval;
    if (candidateMidi < MIN_MIDI || candidateMidi > MAX_MIDI) return false;
    const candidateHistory = [...history, interval];
    if (exceedsCorpusCopyRun(candidateHistory)) return false;
    return !isFinal || !isExactCorpusPhrase(candidateHistory);
  });
}

function nextMarkovInterval(history, previousMidi, isFinal, random) {
  if (!history.length) {
    const startEntry = { next: PARKER_MARKOV_MODEL.phraseStarts };
    const available = availableMarkovEntries(
      startEntry,
      previousMidi,
      history,
      isFinal,
    );
    if (available.length) {
      return { interval: weightedChoice(available, random), order: 0 };
    }
  }

  const maxOrder = Math.min(PARKER_MARKOV_MAX_ORDER, history.length);
  for (let order = maxOrder; order >= 0; order -= 1) {
    const key = order === 0 ? "" : history.slice(-order).join(",");
    const entry = PARKER_MARKOV_MODEL.transitions[order].get(key);
    if (!entry) continue;
    if (order > 0 && entry.count < PARKER_MARKOV_MIN_CONTEXT_COUNT) continue;
    const available = availableMarkovEntries(
      entry,
      previousMidi,
      history,
      isFinal,
    );
    if (available.length) {
      return { interval: weightedChoice(available, random), order };
    }
  }

  throw new Error("Aucune transition Parker compatible avec le registre.");
}

function randomSequence(length, random) {
  const notes = [randomInt(53, 65, random)];
  const intervals = [];
  const ordersUsed = [];

  while (notes.length < length) {
    const previous = notes.at(-1);
    const isFinal = notes.length === length - 1;
    const { interval, order } = nextMarkovInterval(
      intervals,
      previous,
      isFinal,
      random,
    );
    intervals.push(interval);
    ordersUsed.push(order);
    notes.push(previous + interval);
  }

  return {
    notes,
    meta: {
      label: "Aléatoire — Markov Parker",
      source: {
        kind: "generated",
        label:
          `Générée par Markov d’ordre variable (max. ${PARKER_MARKOV_MAX_ORDER}) ` +
          `sur ${PARKER_INTERVAL_SAMPLE_SIZE} intervalles Parker`,
        model: "variable-order-markov",
        maxOrder: PARKER_MARKOV_MAX_ORDER,
        ordersUsed,
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
  const lastEvent = excerpt.events.at(-1);
  const playbackEnd = lastEvent[1] + lastEvent[2];
  const chicks = (excerpt.solo.beats ?? [])
    .filter(
      ([onset, beat, period]) =>
        onset >= firstOnset &&
        onset < playbackEnd &&
        (beat === 2 || (period >= 4 && beat === 4)),
    )
    .map(([onset, beat]) => ({
      offset: Number((onset - firstOnset).toFixed(4)),
      beat,
    }));
  const firstBar = excerpt.events[0][3];
  const lastBar = lastEvent[3];
  const barLabel =
    firstBar === lastBar ? `mesure ${firstBar}` : `mesures ${firstBar}–${lastBar}`;

  return {
    notes: transposedNotes,
    timings,
    chicks,
    meta: {
      label: `${excerpt.solo.performer} — ${excerpt.solo.title}`,
      originalTempo: excerpt.solo.originalTempo,
      source: {
        kind: "transcription",
        label: `${excerpt.solo.performer}, « ${excerpt.solo.title} », phrase ${excerpt.phrase[2]}, ${barLabel}`,
        dataset: excerpt.solo.dataset,
        url: excerpt.solo.sourceUrl,
        recordingDate: excerpt.solo.recordingDate,
        audioFile: excerpt.solo.audioFile,
        audioSourceUrl: excerpt.solo.audioSourceUrl,
        audioOffset: excerpt.solo.audioOffset,
        phrase: excerpt.phrase[2],
        noteCount: transposedNotes.length,
        barStart: firstBar,
        barEnd: lastBar,
        onsetStart: excerpt.events[0][1],
        onsetEnd: excerpt.events.at(-1)[1] + excerpt.events.at(-1)[2],
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
      if (!Number.isFinite(attempt.interval)) continue;
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
