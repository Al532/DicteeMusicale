import { WJAZZTUBE_RECORDINGS } from "../data/wjazztube-recordings.js";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const RECORDING_TAIL_SECONDS = 0.25;

function youtubeIdFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, "");
  let youtubeId = null;
  if (hostname === "youtu.be") {
    youtubeId = url.pathname.split("/").filter(Boolean)[0];
  } else if (
    hostname === "youtube.com" ||
    hostname === "music.youtube.com"
  ) {
    youtubeId = url.searchParams.get("v");
    if (!youtubeId && url.pathname.startsWith("/embed/")) {
      youtubeId = url.pathname.split("/")[2];
    }
  }
  return YOUTUBE_ID_PATTERN.test(youtubeId ?? "") ? youtubeId : null;
}

function phraseBounds(offset, source) {
  const onsetStart = Number(source?.onsetStart);
  const onsetEnd = Number(source?.onsetEnd);
  if (!Number.isFinite(offset) || !Number.isFinite(onsetStart)) {
    return { start: null, end: null };
  }

  const start = Math.max(0, Math.floor(offset + onsetStart));
  const end = Number.isFinite(onsetEnd)
    ? Math.max(
        start + 1,
        Math.ceil(offset + onsetEnd + RECORDING_TAIL_SECONDS),
      )
    : null;
  return { start, end };
}

function recordingChoice(youtubeId, offset, source, sourceUrl = null) {
  if (!YOUTUBE_ID_PATTERN.test(youtubeId ?? "")) return null;
  const { start, end } = phraseBounds(Number(offset), source);
  const watchUrl = sourceUrl
    ? new URL(sourceUrl)
    : new URL("https://www.youtube.com/watch");
  watchUrl.searchParams.set("v", youtubeId);
  if (start === null) watchUrl.searchParams.delete("t");
  else watchUrl.searchParams.set("t", `${start}s`);

  const embedUrl = new URL(
    `https://www.youtube-nocookie.com/embed/${youtubeId}`,
  );
  embedUrl.searchParams.set("autoplay", "1");
  embedUrl.searchParams.set("playsinline", "1");
  embedUrl.searchParams.set("rel", "0");
  if (start !== null) embedUrl.searchParams.set("start", String(start));
  if (end !== null) embedUrl.searchParams.set("end", String(end));

  return {
    youtubeId,
    start,
    end,
    watchUrl: watchUrl.toString(),
    embedUrl: embedUrl.toString(),
  };
}

export function recordingsAtPhrase(source) {
  if (!source) return [];
  const choices = [];
  const seen = new Set();
  const directYoutubeId = youtubeIdFromUrl(source.audioSourceUrl);
  if (directYoutubeId) {
    const direct = recordingChoice(
      directYoutubeId,
      source.audioOffset,
      source,
      source.audioSourceUrl,
    );
    choices.push(direct);
    seen.add(directYoutubeId);
  }

  for (const [youtubeId, offset] of (
    WJAZZTUBE_RECORDINGS[source.soloId] ?? []
  )) {
    if (seen.has(youtubeId)) continue;
    const choice = recordingChoice(youtubeId, offset, source);
    if (!choice) continue;
    choices.push(choice);
    seen.add(youtubeId);
  }
  return choices;
}

export function recordingUrlAtPhrase(source) {
  return recordingsAtPhrase(source)[0]?.watchUrl ?? null;
}

export function recordingSearchUrl(source) {
  const performer = String(source?.performer ?? "").trim();
  const title = String(source?.title ?? "").trim();
  if (!performer || !title) return null;

  const query = [
    `"${performer}"`,
    `"${title}"`,
    String(source?.recordingDate ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  return url.toString();
}
