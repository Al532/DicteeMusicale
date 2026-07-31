import { normalizeRecordingValidations } from "./recording.js";

export const DATA_EXPORT_HEADERS = Object.freeze([
  "protocole_version",
  "portee",
  "identifiant",
  "etoiles",
  "musicien",
  "morceau",
  "phrase",
  "origine",
  "taille_echantillon",
  "accord",
  "couverture",
  "source_url",
  "mise_a_jour",
  "notes_max",
  "notes_courtes_ignorees",
  "evenements_midi_corriges",
  "reglages_mise_a_jour",
  "statut_youtube",
  "youtube_id",
  "decalage_youtube",
  "youtube_ids_rejetes",
]);

function collectionEntry(collection, key) {
  return typeof collection?.get === "function"
    ? collection.get(key)
    : collection?.[key];
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function phraseRows({
  phraseRatings,
  phraseSettings,
  phrasesByKey,
  protocolVersion,
}) {
  const phraseKeys = [
    ...new Set([
      ...Object.keys(phraseRatings ?? {}),
      ...Object.keys(phraseSettings ?? {}),
    ]),
  ].sort();

  return phraseKeys.flatMap((phraseKey) => {
    const stored = phraseRatings?.[phraseKey];
    const entry =
      stored && typeof stored === "object" ? stored : { rating: stored };
    const rating = Number(entry.rating);
    const hasRating = rating >= 1 && rating <= 3;
    const settings = phraseSettings?.[phraseKey] ?? null;
    if (!hasRating && !settings) return [];
    const catalogEntry = collectionEntry(phrasesByKey, phraseKey);
    return [[
      protocolVersion,
      "phrase",
      phraseKey,
      hasRating ? rating : null,
      entry.performer ?? catalogEntry?.performer,
      entry.title ?? catalogEntry?.title,
      entry.phrase ?? catalogEntry?.phrase,
      hasRating ? entry.origin ?? "manual" : null,
      hasRating ? 1 : null,
      hasRating ? 1 : null,
      hasRating ? 1 : null,
      entry.sourceUrl ?? catalogEntry?.sourceUrl,
      hasRating ? entry.updatedAt : null,
      settings?.notesMax,
      settings?.ignoredShortestNotes,
      settings?.editedEvents
        ? JSON.stringify(settings.editedEvents)
        : null,
      settings?.updatedAt,
      null,
      null,
      null,
      null,
    ]];
  });
}

function scopeRows({ protocol, protocolVersion }) {
  return [...(protocol?.scopes ?? []), ...(protocol?.structuralRules ?? [])]
    .map((scope) => [
      protocolVersion,
      scope.scope,
      scope.scopeId,
      scope.rating,
      scope.performer,
      scope.title,
      null,
      scope.origin,
      scope.sampleSize,
      Number.isFinite(scope.agreement) ? scope.agreement.toFixed(4) : null,
      Number.isFinite(scope.coverage) ? scope.coverage.toFixed(4) : null,
      null,
      scope.updatedAt,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
}

function youtubeRows({
  protocolVersion,
  recordingValidations,
  solosById,
}) {
  return Object.entries(normalizeRecordingValidations(recordingValidations))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([soloId, validation]) => {
      const solo = collectionEntry(solosById, soloId);
      return [
        protocolVersion,
        "youtube",
        soloId,
        null,
        solo?.performer,
        solo?.title,
        null,
        "workshop",
        null,
        null,
        null,
        solo?.sourceUrl,
        validation.updatedAt,
        null,
        null,
        null,
        null,
        validation.status,
        validation.youtubeId,
        validation.offset,
        validation.rejectedYoutubeIds?.length
          ? JSON.stringify(validation.rejectedYoutubeIds)
          : null,
      ];
    });
}

export function createDataExportRows({
  phraseRatings = {},
  phraseSettings = {},
  phrasesByKey = new Map(),
  protocol = {},
  protocolVersion,
  recordingValidations = {},
  solosById = new Map(),
} = {}) {
  return [
    [...DATA_EXPORT_HEADERS],
    ...phraseRows({
      phraseRatings,
      phraseSettings,
      phrasesByKey,
      protocolVersion,
    }),
    ...scopeRows({ protocol, protocolVersion }),
    ...youtubeRows({
      protocolVersion,
      recordingValidations,
      solosById,
    }),
  ];
}

export function createDataExportCsv(options = {}) {
  const rows = createDataExportRows(options);
  return `\ufeff${rows
    .map((row) => row.map(csvCell).join(";"))
    .join("\n")}`;
}
