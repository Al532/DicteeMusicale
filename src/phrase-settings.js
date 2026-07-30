export const DEFAULT_PHRASE_MAX_NOTES = 20;

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
      if (!hasMaximum && !hasIgnored) continue;
      const normalized = resolvePhraseSettings(stored);
      const entry = {
        notesMax: normalized.notesMax,
        ignoredShortestNotes: normalized.ignoredShortestNotes,
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
