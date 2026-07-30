export function recordingUrlAtPhrase(source) {
  if (!source?.audioSourceUrl) return null;

  let url;
  try {
    url = new URL(source.audioSourceUrl);
  } catch {
    return null;
  }

  const offset = Number(source.audioOffset);
  const onset = Number(source.onsetStart);
  if (Number.isFinite(offset) && Number.isFinite(onset)) {
    const startSeconds = Math.max(0, Math.floor(offset + onset));
    url.searchParams.set("t", `${startSeconds}s`);
  }
  return url.toString();
}
