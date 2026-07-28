import {
  DEFAULT_PERFORMERS,
  WJAZZD_PERFORMERS,
  WJAZZD_SOLOS,
} from "../data/wjazzd-solos.js";
import { WJAZZD_CHORDS } from "../data/wjazzd-chords.js";

export { DEFAULT_PERFORMERS, WJAZZD_PERFORMERS };

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
export const BASS_MIN_MIDI = 28;
export const BASS_MAX_MIDI = 48;
export const JAZZ_MARKOV_MAX_ORDER = 8;
export const JAZZ_MARKOV_MIN_CONTEXT_COUNT = 2;

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function beatCountForMeasure(beats, index) {
  let firstBeatIndex = index;
  while (firstBeatIndex > 0 && beats[firstBeatIndex][1] !== 1) {
    firstBeatIndex -= 1;
  }
  let lastBeatIndex = firstBeatIndex;
  while (
    lastBeatIndex + 1 < beats.length &&
    beats[lastBeatIndex + 1][1] !== 1
  ) {
    lastBeatIndex += 1;
  }
  let beatCount = 0;
  for (
    let beatIndex = firstBeatIndex;
    beatIndex <= lastBeatIndex;
    beatIndex += 1
  ) {
    beatCount = Math.max(beatCount, beats[beatIndex][1] ?? 0);
  }
  return beatCount;
}

export function playbackStartOnStrongBeat(beats, firstNoteOnset) {
  let playbackStart = firstNoteOnset;
  for (let index = 0; index < beats.length; index += 1) {
    const [onset, beat] = beats[index];
    if (onset > firstNoteOnset) break;
    const isStrongBeat =
      beat === 1 ||
      (beat === 3 && beatCountForMeasure(beats, index) === 4);
    if (isStrongBeat) playbackStart = onset;
  }
  return playbackStart;
}

export function bassPitchClassForChord(chord) {
  const symbol = String(chord ?? "").trim();
  if (!symbol || symbol === "NC") return null;
  const bassSymbol = symbol.split("/").at(-1);
  const match = bassSymbol.match(/^([A-G])([b#]?)/);
  if (!match) return null;
  const naturalPitchClasses = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const accidental = match[2] === "b" ? -1 : match[2] === "#" ? 1 : 0;
  return pitchClass(naturalPitchClasses[match[1]] + accidental);
}

function nearestBassMidi(rootPitchClass, transposition, previousMidi) {
  const transposedPitchClass = pitchClass(rootPitchClass + transposition);
  const candidates = [];
  for (let midi = BASS_MIN_MIDI; midi <= BASS_MAX_MIDI; midi += 1) {
    if (pitchClass(midi) === transposedPitchClass) candidates.push(midi);
  }
  return candidates.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate - previousMidi);
    const bestDistance = Math.abs(best - previousMidi);
    return candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && candidate < best)
      ? candidate
      : best;
  });
}

export function voiceBassHits(hits, transposition = 0) {
  let previousMidi = 36;
  return hits.map((hit) => {
    const midi = nearestBassMidi(
      hit.rootPitchClass,
      transposition,
      previousMidi,
    );
    previousMidi = midi;
    return { ...hit, midi };
  });
}

function bassHitsForExcerpt(chords, firstOnset, playbackEnd, transposition) {
  const timeline = [];
  let activeChord = null;
  for (const [onset, chord] of chords ?? []) {
    if (onset <= firstOnset) {
      activeChord = chord;
      continue;
    }
    if (onset >= playbackEnd) break;
    timeline.push({ onset, chord });
  }
  if (activeChord !== null) {
    timeline.unshift({ onset: firstOnset, chord: activeChord });
  }

  const hits = timeline.flatMap((entry, index) => {
    const rootPitchClass = bassPitchClassForChord(entry.chord);
    if (rootPitchClass === null) return [];
    const nextOnset = timeline[index + 1]?.onset ?? playbackEnd;
    const duration = nextOnset - entry.onset;
    if (duration <= 0) return [];
    return [{
      offset: Number((entry.onset - firstOnset).toFixed(4)),
      duration: Number(duration.toFixed(4)),
      chord: entry.chord,
      rootPitchClass,
    }];
  });
  return voiceBassHits(hits, transposition);
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

export function randomJazzTransposition(random = Math.random) {
  const pitchClassShift = randomInt(0, 11, random);
  if (pitchClassShift === 6) return random() < 0.5 ? -6 : 6;
  return pitchClassShift > 6 ? pitchClassShift - 12 : pitchClassShift;
}

export function randomDifferentJazzTransposition(
  currentTransposition,
  random = Math.random,
) {
  const currentPitchClass = pitchClass(currentTransposition);
  const choices = Array.from({ length: 12 }, (_, index) => index).filter(
    (candidate) => candidate !== currentPitchClass,
  );
  const pitchClassShift = randomChoice(choices, random);
  if (pitchClassShift === 6) return random() < 0.5 ? -6 : 6;
  return pitchClassShift > 6 ? pitchClassShift - 12 : pitchClassShift;
}

function signedJazzTransposition(pitchClassShift, random) {
  if (pitchClassShift === 6) return random() < 0.5 ? -6 : 6;
  return pitchClassShift > 6 ? pitchClassShift - 12 : pitchClassShift;
}

export function makeJazzTranspositionCycle({
  excludeTransposition = null,
  avoidFirstTransposition = null,
  random = Math.random,
} = {}) {
  const excludedPitchClass = Number.isFinite(excludeTransposition)
    ? pitchClass(excludeTransposition)
    : null;
  const cycle = Array.from({ length: 12 }, (_, index) => index)
    .filter((candidate) => candidate !== excludedPitchClass)
    .map((candidate) => signedJazzTransposition(candidate, random));

  for (let index = cycle.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index, random);
    [cycle[index], cycle[swapIndex]] = [cycle[swapIndex], cycle[index]];
  }

  if (
    cycle.length > 1 &&
    Number.isFinite(avoidFirstTransposition) &&
    pitchClass(cycle[0]) === pitchClass(avoidFirstTransposition)
  ) {
    const swapIndex = cycle.findIndex(
      (candidate) =>
        pitchClass(candidate) !== pitchClass(avoidFirstTransposition),
    );
    [cycle[0], cycle[swapIndex]] = [cycle[swapIndex], cycle[0]];
  }

  return cycle;
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

const KNOWN_PERFORMERS = new Set(
  WJAZZD_PERFORMERS.map(({ name }) => name),
);
const modelCache = new Map();

export function phraseRatingKey(soloId, phraseNumber) {
  return `${soloId}:${phraseNumber}`;
}

function normalizedMinimumRating(minimumRating) {
  const rating = Math.round(Number(minimumRating) || 0);
  return rating === 2 || rating === 3 ? rating : 0;
}

function phraseRating(phraseRatings, solo, phrase) {
  const stored = phraseRatings?.[phraseRatingKey(solo.id, phrase[2])];
  const rating = Number(
    stored && typeof stored === "object" ? stored.rating : stored,
  );
  return Number.isFinite(rating) ? rating : 0;
}

export function normalizePerformerSelection(
  selectedPerformers = DEFAULT_PERFORMERS,
) {
  const requested = new Set(selectedPerformers);
  return WJAZZD_PERFORMERS
    .map(({ name }) => name)
    .filter((name) => requested.has(name) && KNOWN_PERFORMERS.has(name));
}

function selectedSolos(selectedPerformers) {
  const performers = normalizePerformerSelection(selectedPerformers);
  if (!performers.length) {
    throw new Error("Sélectionne au moins un musicien.");
  }
  const selected = new Set(performers);
  return {
    performers,
    solos: WJAZZD_SOLOS.filter((solo) => selected.has(solo.performer)),
  };
}

function eligiblePhraseEntries(
  solos,
  phraseRatings = {},
  minimumRating = 0,
) {
  const threshold = normalizedMinimumRating(minimumRating);
  const entries = [];
  for (const solo of solos) {
    for (const phrase of solo.phrases) {
      if (threshold && phraseRating(phraseRatings, solo, phrase) < threshold) {
        continue;
      }
      entries.push({ solo, phrase });
    }
  }
  return entries;
}

function buildJazzIntervalSequences(phraseEntries) {
  const sequences = [];
  for (const { solo, phrase } of phraseEntries) {
    const [start, end] = phrase;
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
  return sequences;
}

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function buildJazzMarkovModel(phraseEntries) {
  const intervalSequences = buildJazzIntervalSequences(phraseEntries);
  const performers = [
    ...new Set(phraseEntries.map(({ solo }) => solo.performer)),
  ];
  const solos = [...new Map(
    phraseEntries.map(({ solo }) => [solo.id, solo]),
  ).values()];
  const transitions = Array.from(
    { length: JAZZ_MARKOV_MAX_ORDER + 1 },
    () => new Map(),
  );
  const phraseStarts = new Map();
  const intervalCounts = {};
  let intervalSampleSize = 0;

  for (const sequence of intervalSequences) {
    addCount(phraseStarts, sequence[0]);
    intervalSampleSize += sequence.length;
    for (const interval of sequence) {
      intervalCounts[interval] = (intervalCounts[interval] ?? 0) + 1;
    }
    for (let index = 0; index < sequence.length; index += 1) {
      const maxOrder = Math.min(JAZZ_MARKOV_MAX_ORDER, index);
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

  return {
    performers,
    solos,
    phraseEntries,
    intervalSequences,
    intervalCounts: Object.freeze(intervalCounts),
    intervalSampleSize,
    transitions,
    phraseStarts,
  };
}

function getJazzMarkovModel(phraseRatings = {}, minimumRating = 0) {
  const threshold = normalizedMinimumRating(minimumRating);
  const key = threshold
    ? `${threshold}:${Object.entries(phraseRatings ?? {})
        .filter(([, stored]) => {
          const rating = Number(
            stored && typeof stored === "object" ? stored.rating : stored,
          );
          return rating >= threshold;
        })
        .map(([phraseKey]) => phraseKey)
        .sort()
        .join("\u0000")}`
    : "all";
  if (modelCache.has(key)) return modelCache.get(key);
  const phraseEntries = eligiblePhraseEntries(
    WJAZZD_SOLOS,
    phraseRatings,
    threshold,
  );
  if (modelCache.size >= 4) {
    modelCache.delete(modelCache.keys().next().value);
  }
  const model = buildJazzMarkovModel(phraseEntries);
  if (!model.intervalSampleSize) {
    throw new Error("Aucune phrase ne correspond au filtre d’étoiles.");
  }
  modelCache.set(key, model);
  return model;
}

export function jazzCorpusSummary({
  phraseRatings = {},
  minimumRating = 0,
} = {}) {
  const model = getJazzMarkovModel(phraseRatings, minimumRating);
  return {
    performerCount: model.performers.length,
    soloCount: model.solos.length,
    phraseCount: model.phraseEntries.length,
    intervalSampleSize: model.intervalSampleSize,
    intervalCounts: model.intervalCounts,
  };
}

function availableMarkovEntries(entry, previousMidi) {
  return [...entry.next.entries()].filter(([interval]) => {
    const candidateMidi = previousMidi + interval;
    return candidateMidi >= MIN_MIDI && candidateMidi <= MAX_MIDI;
  });
}

function nextMarkovInterval(history, previousMidi, random, model) {
  if (!history.length) {
    const startEntry = { next: model.phraseStarts };
    const available = availableMarkovEntries(startEntry, previousMidi);
    if (available.length) {
      return { interval: weightedChoice(available, random), order: 0 };
    }
  }

  const maxOrder = Math.min(JAZZ_MARKOV_MAX_ORDER, history.length);
  for (let order = maxOrder; order >= 0; order -= 1) {
    const key = order === 0 ? "" : history.slice(-order).join(",");
    const entry = model.transitions[order].get(key);
    if (!entry) continue;
    if (order > 0 && entry.count < JAZZ_MARKOV_MIN_CONTEXT_COUNT) continue;
    const available = availableMarkovEntries(entry, previousMidi);
    if (available.length) {
      return { interval: weightedChoice(available, random), order };
    }
  }

  throw new Error("Aucune transition compatible avec le registre.");
}

function randomSequence(length, random, phraseRatings, minimumRating) {
  const model = getJazzMarkovModel(phraseRatings, minimumRating);
  const notes = [randomInt(53, 65, random)];
  const intervals = [];
  const ordersUsed = [];

  while (notes.length < length) {
    const previous = notes.at(-1);
    const { interval, order } = nextMarkovInterval(
      intervals,
      previous,
      random,
      model,
    );
    intervals.push(interval);
    ordersUsed.push(order);
    notes.push(previous + interval);
  }

  return {
    notes,
    meta: {
      label: "Phrases générées",
      source: {
        kind: "generated",
        label:
          `Générée par Markov d’ordre variable (max. ${JAZZ_MARKOV_MAX_ORDER}) ` +
          `sur ${model.intervalSampleSize.toLocaleString("fr-FR")} intervalles ` +
          `de ${model.performers.length} soliste${model.performers.length > 1 ? "s" : ""}`,
        model: "variable-order-markov",
        maxOrder: JAZZ_MARKOV_MAX_ORDER,
        intervalSampleSize: model.intervalSampleSize,
        performers: model.performers,
        minimumRating: normalizedMinimumRating(minimumRating),
        ordersUsed,
      },
    },
  };
}

function jazzSequence(
  random,
  maxNotes = 15,
  selectedPerformers,
  phraseRatings,
  minimumRating,
) {
  const { performers, solos } = selectedSolos(selectedPerformers);
  const candidates = [];
  for (const { solo, phrase } of eligiblePhraseEntries(
    solos,
    phraseRatings,
    minimumRating,
  )) {
    const [start, end] = phrase;
    const events = solo.events.slice(start, end + 1);
    const notes = events.map(([midi]) => midi);
    if (notes.length < 2) continue;
    candidates.push({ solo, phrase, events, notes });
  }
  if (!candidates.length) {
    throw new Error("Aucune phrase ne correspond aux filtres choisis.");
  }

  const selected = randomChoice(candidates, random);
  const safeMaxNotes = Math.max(
    5,
    Math.min(15, Math.round(Number(maxNotes) || 15)),
  );
  const events = selected.events.slice(0, safeMaxNotes);
  const excerpt = {
    ...selected,
    events,
    notes: events.map(([midi]) => midi),
  };
  const wasTruncated = excerpt.events.length < selected.events.length;
  const transposition = randomJazzTransposition(random);
  const transposedNotes = excerpt.notes.map((note) => note + transposition);
  const firstOnset = excerpt.events[0][1];
  const playbackStart = playbackStartOnStrongBeat(
    excerpt.solo.beats ?? [],
    firstOnset,
  );
  const timings = excerpt.events.map((event) => ({
    offset: Number((event[1] - playbackStart).toFixed(4)),
    duration: event[2],
  }));
  const lastEvent = excerpt.events.at(-1);
  const playbackEnd = lastEvent[1] + lastEvent[2];
  const chicks = (excerpt.solo.beats ?? [])
    .filter(
      ([onset, beat]) =>
        onset >= playbackStart &&
        onset < playbackEnd &&
        (beat === 2 || beat === 4),
    )
    .map(([onset, beat]) => ({
      offset: Number((onset - playbackStart).toFixed(4)),
      beat,
    }));
  const bassHits = bassHitsForExcerpt(
    WJAZZD_CHORDS[excerpt.solo.id],
    playbackStart,
    playbackEnd,
    transposition,
  );
  const firstBar = excerpt.events[0][3];
  const lastBar = lastEvent[3];
  const barLabel =
    firstBar === lastBar ? `mesure ${firstBar}` : `mesures ${firstBar}–${lastBar}`;
  const excerptLabel = wasTruncated
    ? `, extrait de ${excerpt.events.length} notes`
    : "";

  return {
    notes: transposedNotes,
    timings,
    chicks,
    bassHits,
    meta: {
      label: `${excerpt.solo.performer} — ${excerpt.solo.title}`,
      originalTempo: excerpt.solo.originalTempo,
      source: {
        kind: "transcription",
        label:
          `${excerpt.solo.performer}, « ${excerpt.solo.title} », ` +
          `phrase ${excerpt.phrase[2]}, ${barLabel}${excerptLabel}`,
        dataset: excerpt.solo.dataset,
        url: excerpt.solo.sourceUrl,
        recordingDate: excerpt.solo.recordingDate,
        audioFile: excerpt.solo.audioFile,
        audioSourceUrl: excerpt.solo.audioSourceUrl,
        audioOffset: excerpt.solo.audioOffset,
        soloId: excerpt.solo.id,
        performer: excerpt.solo.performer,
        title: excerpt.solo.title,
        phrase: excerpt.phrase[2],
        phraseKey: phraseRatingKey(excerpt.solo.id, excerpt.phrase[2]),
        rating: phraseRating(phraseRatings, excerpt.solo, excerpt.phrase),
        noteCount: transposedNotes.length,
        fullPhraseNoteCount: selected.notes.length,
        maxNotes: safeMaxNotes,
        truncated: wasTruncated,
        barStart: firstBar,
        barEnd: lastBar,
        onsetStart: playbackStart,
        phraseOnsetStart: firstOnset,
        onsetEnd: excerpt.events.at(-1)[1] + excerpt.events.at(-1)[2],
        originalTempo: excerpt.solo.originalTempo,
        performers,
        transposition,
      },
    },
  };
}

export function makeSequence({
  length = 5,
  maxNotes = 15,
  mode = "random",
  selectedPerformers = DEFAULT_PERFORMERS,
  phraseRatings = {},
  minimumRating = 0,
  random = Math.random,
} = {}) {
  const safeLength = Math.max(3, Math.min(15, Math.round(length)));
  const sequence =
    mode === "parker" || mode === "jazz"
      ? jazzSequence(
          random,
          maxNotes,
          selectedPerformers,
          phraseRatings,
          minimumRating,
        )
      : randomSequence(
          safeLength,
          random,
          phraseRatings,
          minimumRating,
        );
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
