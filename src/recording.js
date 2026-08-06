import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const RECORDING_TAIL_SECONDS = 0.25;
const RECORDING_STATUSES = new Set([
  "verified",
  "wrong-version",
  "unavailable",
]);

export function parseVideoTimestamp(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;

  const parts = text.split(":");
  if (parts.length > 3) return null;
  const secondsText = parts.at(-1);
  if (!/^\d+(?:\.\d+)?$/.test(secondsText)) return null;
  if (parts.slice(0, -1).some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const seconds = Number(secondsText);
  if (!Number.isFinite(seconds) || (parts.length > 1 && seconds >= 60)) {
    return null;
  }
  if (parts.length === 1) return seconds;

  const minutes = Number(parts.at(-2));
  if (
    !Number.isFinite(minutes) ||
    (parts.length === 3 && minutes >= 60)
  ) {
    return null;
  }
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}

export function formatVideoTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "";

  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor(
    (totalMilliseconds % 3_600_000) / 60_000,
  );
  const wholeSeconds = Math.floor(
    (totalMilliseconds % 60_000) / 1000,
  );
  const milliseconds = totalMilliseconds % 1000;
  const secondText =
    `${String(wholeSeconds).padStart(2, "0")}.` +
    String(milliseconds).padStart(3, "0");
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondText}`;
  }
  return `${minutes}:${secondText}`;
}

function phraseOnset(source) {
  const phraseStart = Number(source?.phraseOnsetStart);
  if (Number.isFinite(phraseStart)) return phraseStart;
  const playbackStart = Number(source?.onsetStart);
  return Number.isFinite(playbackStart) ? playbackStart : null;
}

export function timestampAtPhrase(offset, source) {
  if (offset === null || offset === undefined || offset === "") {
    return null;
  }
  const start = phraseOnset(source);
  const normalizedOffset = Number(offset);
  if (!Number.isFinite(normalizedOffset) || start === null) return null;
  return Math.max(0, normalizedOffset + start);
}

export function offsetAtPhraseTimestamp(timestamp, source) {
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return null;
  }
  const start = phraseOnset(source);
  const normalizedTimestamp = Number(timestamp);
  if (
    !Number.isFinite(normalizedTimestamp) ||
    normalizedTimestamp < 0 ||
    start === null
  ) {
    return null;
  }
  return normalizedTimestamp - start;
}

export function youtubeIdFromValue(value) {
  const text = String(value ?? "").trim();
  if (YOUTUBE_ID_PATTERN.test(text)) return text;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, "");
  let youtubeId = null;
  if (hostname === "youtu.be") {
    youtubeId = url.pathname.split("/").filter(Boolean)[0];
  } else if (
    hostname === "youtube.com" ||
    hostname === "music.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com"
  ) {
    youtubeId = url.searchParams.get("v");
    if (
      !youtubeId &&
      (url.pathname.startsWith("/embed/") ||
        url.pathname.startsWith("/shorts/"))
    ) {
      youtubeId = url.pathname.split("/")[2];
    }
  }
  return YOUTUBE_ID_PATTERN.test(youtubeId ?? "") ? youtubeId : null;
}

function normalizedRejectedIds(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((candidate) => youtubeIdFromValue(candidate))
        .filter(Boolean),
    ),
  ];
}

export function normalizeRecordingValidation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const status = RECORDING_STATUSES.has(value.status)
    ? value.status
    : null;
  if (!status) return null;

  const rejectedYoutubeIds = normalizedRejectedIds(
    value.rejectedYoutubeIds,
  );
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt
      ? value.updatedAt
      : null;

  if (status === "verified") {
    const youtubeId = youtubeIdFromValue(value.youtubeId);
    const offset = Number(value.offset);
    if (!youtubeId || !Number.isFinite(offset)) return null;
    return {
      status,
      youtubeId,
      offset,
      ...(rejectedYoutubeIds.length ? { rejectedYoutubeIds } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  return {
    status,
    ...(rejectedYoutubeIds.length ? { rejectedYoutubeIds } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function normalizeRecordingValidations(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const [soloId, validation] of Object.entries(value)) {
    const record = normalizeRecordingValidation(validation);
    if (record) normalized[soloId] = record;
  }
  return normalized;
}

export function mergeRecordingValidations(...sources) {
  return Object.assign(
    {},
    ...sources.map((source) => normalizeRecordingValidations(source)),
  );
}

export function phraseBounds(offset, source) {
  const onsetStart = Number(source?.onsetStart);
  const onsetEnd = Number(source?.onsetEnd);
  if (!Number.isFinite(offset) || !Number.isFinite(onsetStart)) {
    return {
      exactStart: null,
      exactEnd: null,
      start: null,
      end: null,
    };
  }

  const exactStart = Math.max(0, offset + onsetStart);
  const start = Math.floor(exactStart);
  const exactEnd = Number.isFinite(onsetEnd)
    ? Math.max(exactStart, offset + onsetEnd + RECORDING_TAIL_SECONDS)
    : null;
  const end = Number.isFinite(onsetEnd)
    ? Math.max(
        start + 1,
        Math.ceil(exactEnd),
      )
    : null;
  return { exactStart, exactEnd, start, end };
}

export function recordingChoiceAtPhrase(youtubeId, offset, source) {
  if (!YOUTUBE_ID_PATTERN.test(youtubeId ?? "")) return null;
  const bounds = phraseBounds(Number(offset), source);

  const embedUrl = new URL(
    `https://www.youtube-nocookie.com/embed/${youtubeId}`,
  );
  embedUrl.searchParams.set("autoplay", "1");
  embedUrl.searchParams.set("playsinline", "1");
  embedUrl.searchParams.set("rel", "0");
  embedUrl.searchParams.set("enablejsapi", "1");
  if (bounds.start !== null) {
    embedUrl.searchParams.set("start", String(bounds.start));
  }
  if (bounds.end !== null) {
    embedUrl.searchParams.set("end", String(bounds.end));
  }

  return {
    youtubeId,
    ...bounds,
    embedUrl: embedUrl.toString(),
  };
}

export function recordingsAtPhrase(
  source,
  validations = RECORDING_VALIDATIONS,
) {
  const validation = normalizeRecordingValidation(
    validations?.[source?.soloId],
  );
  if (validation?.status !== "verified") return [];
  const choice = recordingChoiceAtPhrase(
    validation.youtubeId,
    validation.offset,
    source,
  );
  return choice ? [choice] : [];
}

export function recordingValidationsModule(validations) {
  const ordered = Object.fromEntries(
    Object.entries(normalizeRecordingValidations(validations)).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
  return (
    "// Generated from the centralized in-app data export.\n" +
    "// Only entries with status \"verified\" are exposed by the public player.\n" +
    `export const RECORDING_VALIDATIONS = Object.freeze(${JSON.stringify(
      ordered,
      null,
      2,
    )});\n`
  );
}
