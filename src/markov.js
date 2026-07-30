import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";
import {
  eligiblePhraseEntries,
  keyboardLayoutForNotes,
  normalizedMinimumRating,
} from "./engine.js";

const MIN_MIDI = 48;
const MAX_MIDI = 71;
export const JAZZ_MARKOV_MAX_ORDER = 8;
export const JAZZ_MARKOV_MIN_CONTEXT_COUNT = 2;
const modelCache = new Map();

function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
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

function buildIntervalSequences(phraseEntries) {
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

function buildModel(phraseEntries) {
  const intervalSequences = buildIntervalSequences(phraseEntries);
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
    intervalCounts: Object.freeze(intervalCounts),
    intervalSampleSize,
    transitions,
    phraseStarts,
  };
}

function getModel(phraseRatings = {}, minimumRating = 0) {
  const filter = normalizedMinimumRating(minimumRating);
  const key = filter
    ? `${filter}:${Object.entries(phraseRatings ?? {})
        .filter(([, stored]) => {
          const rating = Number(
            stored && typeof stored === "object" ? stored.rating : stored,
          );
          return filter === "unrated" ? rating > 0 : rating >= filter;
        })
        .map(([phraseKey]) => phraseKey)
        .sort()
        .join("\u0000")}`
    : "all";
  if (modelCache.has(key)) return modelCache.get(key);

  const phraseEntries = eligiblePhraseEntries(
    WJAZZD_SOLOS,
    phraseRatings,
    filter,
  );
  if (modelCache.size >= 4) {
    modelCache.delete(modelCache.keys().next().value);
  }
  const model = buildModel(phraseEntries);
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
  const model = getModel(phraseRatings, minimumRating);
  return {
    performerCount: model.performers.length,
    soloCount: model.solos.length,
    phraseCount: model.phraseEntries.length,
    intervalSampleSize: model.intervalSampleSize,
    intervalCounts: model.intervalCounts,
  };
}

function availableEntries(entry, previousMidi) {
  return [...entry.next.entries()].filter(([interval]) => {
    const candidateMidi = previousMidi + interval;
    return candidateMidi >= MIN_MIDI && candidateMidi <= MAX_MIDI;
  });
}

function nextInterval(history, previousMidi, random, model) {
  if (!history.length) {
    const available = availableEntries(
      { next: model.phraseStarts },
      previousMidi,
    );
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
    const available = availableEntries(entry, previousMidi);
    if (available.length) {
      return { interval: weightedChoice(available, random), order };
    }
  }

  throw new Error("Aucune transition compatible avec le registre.");
}

export function makeGeneratedSequence({
  length = 5,
  phraseRatings = {},
  minimumRating = 0,
  random = Math.random,
} = {}) {
  const safeLength = Math.max(3, Math.min(15, Math.round(length)));
  const model = getModel(phraseRatings, minimumRating);
  const notes = [randomInt(53, 65, random)];
  const intervals = [];
  const ordersUsed = [];

  while (notes.length < safeLength) {
    const previous = notes.at(-1);
    const { interval, order } = nextInterval(
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
    keyboard: keyboardLayoutForNotes(notes),
    meta: {
      label: "Phrases générées",
      source: {
        kind: "generated",
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
