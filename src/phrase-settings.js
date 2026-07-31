export const DEFAULT_PHRASE_MAX_NOTES = 20;
export const MIN_EDITED_PHRASE_NOTES = 1;

function rounded(value) {
  return Number(Number(value).toFixed(4));
}

/**
 * Validate the compact WJazzD event format used for phrase corrections.
 * Corrections stay separate from the source corpus and preserve the optional
 * bar number carried by each source event.
 */
export function normalizeEditedPhraseEvents(value) {
  if (!Array.isArray(value) || value.length < MIN_EDITED_PHRASE_NOTES) {
    return null;
  }

  const events = value.map((event, sourceIndex) => {
    if (!Array.isArray(event)) return null;
    const midi = Math.round(Number(event[0]));
    const onset = Number(event[1]);
    const duration = Number(event[2]);
    const bar = event[3] === null || event[3] === undefined
      ? null
      : Number(event[3]);
    if (
      !Number.isFinite(midi) ||
      midi < 0 ||
      midi > 127 ||
      !Number.isFinite(onset) ||
      onset < 0 ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return null;
    }
    return {
      event: [
        midi,
        rounded(onset),
        rounded(Math.max(0.01, duration)),
        Number.isFinite(bar) ? Math.round(bar) : null,
      ],
      sourceIndex,
    };
  });
  if (events.some((entry) => !entry)) return null;

  return events
    .sort(
      (left, right) =>
        left.event[1] - right.event[1] ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ event }) => event);
}

export function phraseEventsWithEdits(events, stored = {}) {
  const editedEvents = normalizeEditedPhraseEvents(stored?.editedEvents);
  const sourceEvents = Array.isArray(events) ? events : [];
  return editedEvents ?? sourceEvents.map((event) => [...event]);
}

/**
 * Turn the former "ignore shortest notes" setting into an explicit corrected
 * sequence when a phrase is opened in the editor. The legacy setting remains
 * readable so existing local exports keep sounding exactly the same.
 */
export function materializeLegacyPhraseEvents(events, stored = {}) {
  const sourceEvents = phraseEventsWithEdits(events, stored);
  const settings = resolvePhraseSettings(stored, sourceEvents.length);
  if (!settings.ignoredShortestNotes) {
    return {
      events: sourceEvents,
      notesMax: settings.notesMax,
    };
  }
  const ignoredIndexes = new Set(
    sourceEvents
      .slice(0, settings.notesMax)
      .map((event, index) => ({
        duration: Number(event[2]) || 0,
        index,
      }))
      .sort(
        (left, right) =>
          left.duration - right.duration || left.index - right.index,
      )
      .slice(0, settings.ignoredShortestNotes)
      .map(({ index }) => index),
  );
  return {
    events: sourceEvents.filter((_, index) => !ignoredIndexes.has(index)),
    notesMax: Math.max(
      1,
      settings.notesMax - ignoredIndexes.size,
    ),
  };
}

function recordDate(stored) {
  return stored && typeof stored === "object"
    ? String(stored.updatedAt ?? "")
    : "";
}

function positiveInteger(value, fallback) {
  const numericValue = Math.round(Number(value));
  return Number.isFinite(numericValue) && numericValue >= 1
    ? numericValue
    : fallback;
}

function nonNegativeInteger(value, fallback) {
  const numericValue = Math.round(Number(value));
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : fallback;
}

export function resolvePhraseSettings(
  stored = {},
  fullPhraseNoteCount = Number.POSITIVE_INFINITY,
) {
  const record =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? stored
      : {};
  const finiteFullCount =
    Number.isFinite(fullPhraseNoteCount) && fullPhraseNoteCount >= 1
      ? Math.floor(fullPhraseNoteCount)
      : null;
  const configuredMaximum = positiveInteger(
    record.notesMax ?? record.maxNotes,
    DEFAULT_PHRASE_MAX_NOTES,
  );
  const notesMax = finiteFullCount
    ? Math.min(configuredMaximum, finiteFullCount)
    : configuredMaximum;
  const ignoredShortestNotes = Math.min(
    nonNegativeInteger(
      record.ignoredShortestNotes ?? record.ignoredShortNotes,
      0,
    ),
    Math.max(0, notesMax - 1),
  );

  return {
    notesMax,
    ignoredShortestNotes,
    fullPhraseNoteCount: finiteFullCount,
    playedNoteCount: notesMax - ignoredShortestNotes,
  };
}

export function mergePhraseSettings(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      continue;
    }
    for (const [phraseKey, stored] of Object.entries(source)) {
      if (
        !phraseKey.includes(":") ||
        !stored ||
        typeof stored !== "object" ||
        Array.isArray(stored)
      ) {
        continue;
      }
      const hasMaximum =
        stored.notesMax !== undefined || stored.maxNotes !== undefined;
      const hasIgnored =
        stored.ignoredShortestNotes !== undefined ||
        stored.ignoredShortNotes !== undefined;
      const editedEvents = normalizeEditedPhraseEvents(stored.editedEvents);
      const hasEditedEvents = Boolean(editedEvents);
      if (!hasMaximum && !hasIgnored && !hasEditedEvents) continue;
      const normalized = resolvePhraseSettings(
        stored,
        editedEvents?.length ?? Number.POSITIVE_INFINITY,
      );
      const entry = {
        notesMax: normalized.notesMax,
        ignoredShortestNotes: normalized.ignoredShortestNotes,
        ...(editedEvents ? { editedEvents } : {}),
        updatedAt: stored.updatedAt ?? null,
      };
      const current = merged[phraseKey];
      if (!current || recordDate(entry) >= recordDate(current)) {
        merged[phraseKey] = entry;
      }
    }
  }
  return merged;
}
