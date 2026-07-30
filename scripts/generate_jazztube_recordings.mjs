import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";

const JAZZTUBE_BASE_URL =
  process.env.JAZZTUBE_BASE_URL ??
  "http://mir.audiolabs.uni-erlangen.de/jazztube";
const CONCURRENCY = 12;
const OUTPUT_URL = new URL("../data/wjazztube-recordings.js", import.meta.url);

function numericSoloId(solo) {
  const value = Number(String(solo.id).split("-").at(-1));
  if (!Number.isInteger(value)) {
    throw new Error(`Identifiant de solo invalide : ${solo.id}`);
  }
  return value;
}

function parseRecordings(html, solo) {
  const annotationStartMatch = html.match(
    /var solo_start = ([0-9]+(?:\.[0-9]+)?)/,
  );
  const videoMatches = [
    ...html.matchAll(
      /id="([A-Za-z0-9_-]{11})" data-start="([0-9.]+)" data-end="([0-9.]+)"/g,
    ),
  ];
  if (!videoMatches.length) return [];
  if (!annotationStartMatch) {
    throw new Error(`Début de transcription absent pour ${solo.id}`);
  }

  const annotationStart = Number(annotationStartMatch[1]);
  return videoMatches.map(([, youtubeId, soloStart, soloEnd]) => {
    const start = Number(soloStart);
    const end = Number(soloEnd);
    if (
      !Number.isFinite(annotationStart) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      throw new Error(`Calage JazzTube invalide pour ${solo.id}`);
    }
    return [
      youtubeId,
      Number((start - annotationStart).toFixed(4)),
    ];
  });
}

async function fetchSoloRecordings(solo) {
  const id = numericSoloId(solo);
  const response = await fetch(
    `${JAZZTUBE_BASE_URL}/solos/solo/${id}`,
  );
  if (!response.ok) {
    throw new Error(`${solo.id} : HTTP ${response.status}`);
  }
  return [solo.id, parseRecordings(await response.text(), solo)];
}

async function mapWithConcurrency(items, mapper, concurrency) {
  const queue = [...items];
  const results = [];

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      results.push(await mapper(item));
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

const entries = await mapWithConcurrency(
  WJAZZD_SOLOS,
  fetchSoloRecordings,
  CONCURRENCY,
);
entries.sort(([left], [right]) => left.localeCompare(right, undefined, {
  numeric: true,
}));

const recordings = Object.fromEntries(
  entries.filter(([, videos]) => videos.length),
);
const source = [
  "// Generated from JazzTube's public WJazzD synchronization data.",
  "// Regenerate with: node scripts/generate_jazztube_recordings.mjs",
  `export const WJAZZTUBE_RECORDINGS = Object.freeze(${JSON.stringify(
    recordings,
    null,
    2,
  )});`,
  "",
].join("\n");

await writeFile(OUTPUT_URL, source);

const videoCount = Object.values(recordings)
  .reduce((total, videos) => total + videos.length, 0);
console.log(
  `${Object.keys(recordings).length}/${WJAZZD_SOLOS.length} solos, ` +
  `${videoCount} vidéos écrites dans ${fileURLToPath(OUTPUT_URL)}`,
);
