import {
  DEFAULT_PERFORMERS,
  WJAZZD_PERFORMERS,
  loadPhraseCorpus,
  phraseIndexEntries,
} from "./corpus-loader.js";
import {
  DEFAULT_PHRASE_MAX_NOTES,
  normalizeEditedPhraseEvents,
  phraseEventsWithEdits,
  resolvePhraseSettings,
} from "./phrase-settings.js";

export { DEFAULT_PERFORMERS, WJAZZD_PERFORMERS };

export const BASS_MIN_MIDI = 28;
export const BASS_MAX_MIDI = 48;
export const JAZZ_TRANSPOSITION_TARGET_MIDI = 66;
export const DEFAULT_JAZZ_TRANSPOSITION_RANGE = Object.freeze([-5, 6]);

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

export function normalizeJazzTranspositionRange(
  range = DEFAULT_JAZZ_TRANSPOSITION_RANGE,
) {
  const minimum = Number(
    Array.isArray(range) ? range[0] : range?.minimum,
  );
  const maximum = Number(
    Array.isArray(range) ? range[1] : range?.maximum,
  );
  if (
    Number.isInteger(minimum) &&
    Number.isInteger(maximum) &&
    maximum - minimum === 11 &&
    minimum <= 0 &&
    maximum >= 0
  ) {
    return [minimum, maximum];
  }
  return [...DEFAULT_JAZZ_TRANSPOSITION_RANGE];
}

export function jazzTranspositionRangeForNotes(
  notes,
  targetMidi = JAZZ_TRANSPOSITION_TARGET_MIDI,
) {
  const midiNotes = (Array.isArray(notes) ? notes : [])
    .map(Number)
    .filter(Number.isFinite);
  if (!midiNotes.length) {
    return [...DEFAULT_JAZZ_TRANSPOSITION_RANGE];
  }
  const phraseCenter =
    (Math.min(...midiNotes) + Math.max(...midiNotes)) / 2;
  const centralTarget = Number.isFinite(Number(targetMidi))
    ? Number(targetMidi)
    : JAZZ_TRANSPOSITION_TARGET_MIDI;
  const windowCenterOffset = 5.5;
  const minimum = Math.max(
    -11,
    Math.min(
      0,
      Math.round(
        centralTarget - phraseCenter - windowCenterOffset,
      ),
    ),
  );
  return [minimum, minimum + 11];
}

export function jazzTranspositionInRange(
  transposition,
  range = DEFAULT_JAZZ_TRANSPOSITION_RANGE,
) {
  const [minimum, maximum] = normalizeJazzTranspositionRange(range);
  const targetPitchClass = pitchClass(
    Number.isFinite(Number(transposition))
      ? Math.round(Number(transposition))
      : 0,
  );
  for (let candidate = minimum; candidate <= maximum; candidate += 1) {
    if (pitchClass(candidate) === targetPitchClass) return candidate;
  }
  return 0;
}

function jazzTranspositions(range) {
  const [minimum, maximum] = normalizeJazzTranspositionRange(range);
  return Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index,
  );
}

export function randomJazzTransposition(
  random = Math.random,
  transpositionRange = DEFAULT_JAZZ_TRANSPOSITION_RANGE,
) {
  return randomChoice(jazzTranspositions(transpositionRange), random);
}

export function makeJazzTranspositionCycle({
  excludeTransposition = null,
  avoidFirstTransposition = null,
  transpositionRange = DEFAULT_JAZZ_TRANSPOSITION_RANGE,
  random = Math.random,
} = {}) {
  const excludedPitchClass = Number.isFinite(excludeTransposition)
    ? pitchClass(excludeTransposition)
    : null;
  const cycle = jazzTranspositions(transpositionRange).filter(
    (candidate) => pitchClass(candidate) !== excludedPitchClass,
  );

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

export function phraseRatingKey(soloId, phraseNumber) {
  return `${soloId}:${phraseNumber}`;
}

export function normalizedMinimumRating(minimumRating) {
  if (minimumRating === "unrated") return "unrated";
  const rating = Math.round(Number(minimumRating) || 0);
  return rating === 2 || rating === 3 ? rating : 0;
}

function phraseRating(phraseRatings, solo, phrase) {
  const stored = phraseRatingRecord(phraseRatings, solo, phrase);
  const rating = Number(
    stored && typeof stored === "object" ? stored.rating : stored,
  );
  return Number.isFinite(rating) ? rating : 0;
}

function phraseRatingRecord(phraseRatings, solo, phrase) {
  return phraseRatings?.[phraseRatingKey(solo.id, phrase[2])];
}

export function normalizePerformerSelection(
  selectedPerformers = DEFAULT_PERFORMERS,
) {
  const requested = new Set(selectedPerformers);
  return WJAZZD_PERFORMERS
    .map(({ name }) => name)
    .filter((name) => requested.has(name) && KNOWN_PERFORMERS.has(name));
}

function selectedPerformersOrThrow(selectedPerformers) {
  const performers = normalizePerformerSelection(selectedPerformers);
  if (!performers.length) {
    throw new Error("Sélectionne au moins un musicien.");
  }
  return performers;
}

export function eligiblePhraseEntries(
  solos,
  phraseRatings = {},
  minimumRating = 0,
) {
  const filter = normalizedMinimumRating(minimumRating);
  const entries = [];
  for (const solo of solos) {
    for (const phrase of solo.phrases) {
      const rating = phraseRating(phraseRatings, solo, phrase);
      if (filter === "unrated" ? rating > 0 : filter && rating < filter) {
        continue;
      }
      entries.push({ solo, phrase });
    }
  }
  return entries;
}

export function jazzPhraseCatalog({
  catalogOverrides = {},
  phraseRatings = {},
  minimumRating = 3,
  phraseSettings = {},
} = {}) {
  const filter = normalizedMinimumRating(minimumRating);
  return [...phraseIndexEntries()]
    .filter((entry) => {
      const rating = Number(
        phraseRatings?.[entry.phraseKey]?.rating ??
          phraseRatings?.[entry.phraseKey] ??
          0,
      );
      return (
        entry.fullPhraseNoteCount >= 2 &&
        !(filter === "unrated" ? rating > 0 : filter && rating < filter)
      );
    })
    .map((entry) => {
      const editedEvents = normalizeEditedPhraseEvents(
        phraseSettings[entry.phraseKey]?.editedEvents,
      );
      const fullPhraseNoteCount =
        editedEvents?.length ?? entry.fullPhraseNoteCount;
      const settings = resolvePhraseSettings(
        phraseSettings[entry.phraseKey],
        fullPhraseNoteCount,
      );
      const override = catalogOverrides[entry.phraseKey];
      return {
        phraseKey: entry.phraseKey,
        soloId: entry.soloId,
        performer: entry.performer,
        title: entry.title,
        phrase: entry.phrase,
        noteCount:
          Number(override?.noteCount) ||
          settings.playedNoteCount,
        fullPhraseNoteCount,
        transpositionRange:
          override?.transpositionRange ??
          (editedEvents
            ? jazzTranspositionRangeForNotes(
                editedEvents.map(([midi]) => midi),
              )
            : null) ??
          entry.transpositionRange,
        sourceUrl: entry.sourceUrl,
      };
    });
}

export function applyPhraseSettingsToEvents(events, stored = {}) {
  const sourceEvents = phraseEventsWithEdits(events, stored);
  if (!sourceEvents.length) {
    return {
      events: [],
      ignoredIndexes: [],
      settings: {
        ...resolvePhraseSettings(stored, 1),
        fullPhraseNoteCount: 0,
        playedNoteCount: 0,
      },
    };
  }

  const settings = resolvePhraseSettings(stored, sourceEvents.length);
  const truncatedEvents = sourceEvents.slice(0, settings.notesMax);
  const ignoredIndexes = settings.ignoredShortestNotes
    ? truncatedEvents
        .map((event, index) => ({
          index,
          duration: Number(event?.[2]) || 0,
        }))
        .sort(
          (left, right) =>
            left.duration - right.duration || left.index - right.index,
        )
        .slice(0, settings.ignoredShortestNotes)
        .map(({ index }) => index)
        .sort((left, right) => left - right)
    : [];
  const ignored = new Set(ignoredIndexes);

  return {
    events: ignored.size
      ? truncatedEvents.filter((_, index) => !ignored.has(index))
      : truncatedEvents,
    truncatedEvents,
    ignoredIndexes,
    settings,
  };
}

export async function loadPhraseCatalogEntry(
  phraseKey,
  {
    fetch: fetchImplementation = globalThis.fetch,
    phraseSettings = {},
  } = {},
) {
  const loaded = await loadPhraseCorpus(phraseKey, {
    fetch: fetchImplementation,
  });
  const events = loaded.solo.events.slice(
    loaded.phrase[0],
    loaded.phrase[1] + 1,
  );
  const adjusted = applyPhraseSettingsToEvents(
    events,
    phraseSettings[phraseKey],
  );
  return {
    phraseKey,
    soloId: loaded.solo.id,
    performer: loaded.solo.performer,
    title: loaded.solo.title,
    phrase: loaded.phrase[2],
    noteCount: adjusted.events.length,
    fullPhraseNoteCount: adjusted.settings.fullPhraseNoteCount,
    transpositionRange: jazzTranspositionRangeForNotes(
      adjusted.events.map(([midi]) => midi),
    ),
    sourceUrl: loaded.solo.sourceUrl,
  };
}

function jazzSequence(
  random,
  maxNotes = DEFAULT_PHRASE_MAX_NOTES,
  selectedPerformers,
  phraseRatings,
  minimumRating,
  targetPhraseKey = null,
  fullPhrase = false,
  transpositionOverride = null,
  phraseSettings = {},
  ignoredShortestNotes = 0,
  corpus = null,
  preselected = null,
) {
  const performers = selectedPerformersOrThrow(selectedPerformers);
  const selected = new Set(performers);
  const solos = Array.isArray(corpus?.solos)
    ? corpus.solos.filter((solo) => selected.has(solo.performer))
    : [];
  if (!corpus || !Array.isArray(corpus.solos)) {
    throw new Error(
      "Les données détaillées de la phrase doivent être chargées.",
    );
  }
  const candidates = [];
  for (const { solo, phrase } of eligiblePhraseEntries(
    solos,
    phraseRatings,
    minimumRating,
  )) {
    if (
      targetPhraseKey &&
      phraseRatingKey(solo.id, phrase[2]) !== targetPhraseKey
    ) {
      continue;
    }
    const [start, end] = phrase;
    const events = solo.events.slice(start, end + 1);
    const notes = events.map(([midi]) => midi);
    if (notes.length < 2) continue;
    candidates.push({ solo, phrase, events, notes });
  }
  if (!candidates.length) {
    throw new Error("Aucune phrase ne correspond aux filtres choisis.");
  }

  const selectedPhrase =
    preselected ??
    randomChoice(candidates, random);
  const selectedPhraseKey = phraseRatingKey(
    selectedPhrase.solo.id,
    selectedPhrase.phrase[2],
  );
  const configuredSettings = fullPhrase
    ? {
        ...(phraseSettings[selectedPhraseKey] ?? {}),
        notesMax: Number.MAX_SAFE_INTEGER,
        ignoredShortestNotes: 0,
      }
    : {
        notesMax: maxNotes,
        ignoredShortestNotes,
        ...(phraseSettings[selectedPhraseKey] ?? {}),
      };
  const adjusted = applyPhraseSettingsToEvents(
    selectedPhrase.events,
    configuredSettings,
  );
  const events = adjusted.events;
  const excerpt = {
    ...selectedPhrase,
    events,
    notes: events.map(([midi]) => midi),
  };
  const wasTruncated =
    adjusted.settings.notesMax < adjusted.settings.fullPhraseNoteCount;
  const transpositionRange = jazzTranspositionRangeForNotes(excerpt.notes);
  const transposition = Number.isFinite(transpositionOverride)
    ? jazzTranspositionInRange(
        Number(transpositionOverride),
        transpositionRange,
      )
    : randomJazzTransposition(random, transpositionRange);
  const transposedNotes = excerpt.notes.map((note) => note + transposition);
  const firstOnset = excerpt.events[0][1];
  const excerptStartOnset = adjusted.truncatedEvents[0][1];
  const playbackStart = playbackStartOnStrongBeat(
    excerpt.solo.beats ?? [],
    excerptStartOnset,
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
    corpus.chords?.[excerpt.solo.id],
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
        soloId: excerpt.solo.id,
        performer: excerpt.solo.performer,
        title: excerpt.solo.title,
        phrase: excerpt.phrase[2],
        phraseKey: selectedPhraseKey,
        rating: phraseRating(phraseRatings, excerpt.solo, excerpt.phrase),
        ratingScope:
          phraseRatingRecord(phraseRatings, excerpt.solo, excerpt.phrase)
            ?.scope ?? null,
        noteCount: transposedNotes.length,
        fullPhraseNoteCount: adjusted.settings.fullPhraseNoteCount,
        maxNotes: adjusted.settings.notesMax,
        ignoredShortestNotes: adjusted.settings.ignoredShortestNotes,
        ignoredNoteIndexes: adjusted.ignoredIndexes,
        truncated: wasTruncated,
        barStart: firstBar,
        barEnd: lastBar,
        onsetStart: playbackStart,
        phraseOnsetStart: firstOnset,
        onsetEnd: excerpt.events.at(-1)[1] + excerpt.events.at(-1)[2],
        originalTempo: excerpt.solo.originalTempo,
        performers,
        transposition,
        transpositionRange,
      },
    },
  };
}

export function makeSequence({
  corpus = null,
  maxNotes = DEFAULT_PHRASE_MAX_NOTES,
  selectedPerformers = DEFAULT_PERFORMERS,
  phraseRatings = {},
  phraseSettings = {},
  minimumRating = 0,
  targetPhraseKey = null,
  fullPhrase = false,
  transpositionOverride = null,
  ignoredShortestNotes = 0,
  random = Math.random,
} = {}) {
  const sequence = jazzSequence(
    random,
    maxNotes,
    selectedPerformers,
    phraseRatings,
    minimumRating,
    targetPhraseKey,
    fullPhrase,
    transpositionOverride,
    phraseSettings,
    ignoredShortestNotes,
    corpus,
  );
  return {
    ...sequence,
    keyboard: keyboardLayoutForNotes(sequence.notes),
  };
}

function indexedPhraseCandidates({
  minimumRating,
  phraseRatings,
  selectedPerformers,
  targetPhraseKey,
}) {
  const performers = selectedPerformersOrThrow(selectedPerformers);
  const selected = new Set(performers);
  const filter = normalizedMinimumRating(minimumRating);
  const candidates = [...phraseIndexEntries(performers)].filter((entry) => {
    if (
      !selected.has(entry.performer) ||
      entry.fullPhraseNoteCount < 2 ||
      (targetPhraseKey && entry.phraseKey !== targetPhraseKey)
    ) {
      return false;
    }
    const stored = phraseRatings?.[entry.phraseKey];
    const rating = Number(
      stored && typeof stored === "object" ? stored.rating : stored,
    ) || 0;
    return !(filter === "unrated" ? rating > 0 : filter && rating < filter);
  });
  return { candidates, performers };
}

export async function loadSequence({
  fetch: fetchImplementation = globalThis.fetch,
  maxNotes = DEFAULT_PHRASE_MAX_NOTES,
  selectedPerformers = DEFAULT_PERFORMERS,
  phraseRatings = {},
  phraseSettings = {},
  minimumRating = 0,
  targetPhraseKey = null,
  fullPhrase = false,
  transpositionOverride = null,
  ignoredShortestNotes = 0,
  random = Math.random,
} = {}) {
  const { candidates, performers } = indexedPhraseCandidates({
    minimumRating,
    phraseRatings,
    selectedPerformers,
    targetPhraseKey,
  });
  if (!candidates.length) {
    throw new Error("Aucune phrase ne correspond aux filtres choisis.");
  }
  const selectedIndex = randomChoice(candidates, random);
  const loaded = await loadPhraseCorpus(selectedIndex.phraseKey, {
    fetch: fetchImplementation,
  });
  const events = loaded.solo.events.slice(
    loaded.phrase[0],
    loaded.phrase[1] + 1,
  );
  const preselected = {
    solo: loaded.solo,
    phrase: loaded.phrase,
    events,
    notes: events.map(([midi]) => midi),
  };
  const sequence = jazzSequence(
    random,
    maxNotes,
    performers,
    phraseRatings,
    minimumRating,
    selectedIndex.phraseKey,
    fullPhrase,
    transpositionOverride,
    phraseSettings,
    ignoredShortestNotes,
    {
      solos: [loaded.solo],
      chords: { [loaded.solo.id]: loaded.chords },
    },
    preselected,
  );
  return {
    ...sequence,
    keyboard: keyboardLayoutForNotes(sequence.notes),
  };
}
