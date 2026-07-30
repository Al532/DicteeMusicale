import { spawnSync } from "node:child_process";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");
const SAMPLE_COUNT = 5;

function exposeBrowserGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
}

async function measureDomStartup() {
  const html = await readFile(join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  for (const [name, value] of Object.entries({
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    navigator: dom.window.navigator,
    screen: dom.window.screen,
    window: dom.window,
  })) {
    exposeBrowserGlobal(name, value);
  }

  globalThis.gc?.();
  const before = process.memoryUsage();
  const startedAt = performance.now();
  await import(
    `${pathToFileURL(join(ROOT, "src/app.js")).href}?measure=${Date.now()}`
  );
  const usableAt = performance.now();
  globalThis.gc?.();
  const after = process.memoryUsage();
  const ready =
    dom.window.document.body.classList.contains("home-view") &&
    !dom.window.document.querySelector("#home-panel").hidden;
  dom.window.close();
  return {
    ready,
    usableMs: Number((usableAt - startedAt).toFixed(2)),
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
  };
}

if (process.argv.includes("--child")) {
  process.stdout.write(`${JSON.stringify(await measureDomStartup())}\n`);
  process.exit(0);
}

const staticImportPattern =
  /\b(?:import|export)\s+(?!\()(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g;

async function collectStaticModuleGraph(entryPath) {
  const discovered = new Set();
  const pending = [resolve(entryPath)];
  while (pending.length) {
    const modulePath = pending.pop();
    if (discovered.has(modulePath)) continue;
    discovered.add(modulePath);
    const source = await readFile(modulePath, "utf8");
    for (const match of source.matchAll(staticImportPattern)) {
      const specifier = match[1].split("?")[0];
      if (!specifier.startsWith(".")) continue;
      const importedPath = resolve(dirname(modulePath), specifier);
      if (extname(importedPath) === ".js") pending.push(importedPath);
    }
  }
  return [...discovered].sort();
}

async function compressedSizes(paths) {
  const buffers = await Promise.all(paths.map((path) => readFile(path)));
  return buffers.reduce(
    (totals, buffer) => ({
      rawBytes: totals.rawBytes + buffer.length,
      gzipBytes: totals.gzipBytes + gzipSync(buffer).length,
      brotliBytes: totals.brotliBytes + brotliCompressSync(buffer).length,
    }),
    { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
  );
}

async function corpusDetailPaths() {
  const blocksDirectory = join(ROOT, "data/wjazzd-blocks");
  try {
    return (await readdir(blocksDirectory))
      .filter((name) => /^block-\d{3}\.json$/.test(name))
      .sort()
      .map((name) => join(blocksDirectory, name));
  } catch {
    return [];
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const graphPaths = await collectStaticModuleGraph(
  join(ROOT, "src/app.js"),
);
const shellPaths = [
  join(ROOT, "index.html"),
  join(ROOT, "styles.css"),
  ...graphPaths,
];
const detailPaths = await corpusDetailPaths();
const samples = Array.from({ length: SAMPLE_COUNT }, () => {
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", SCRIPT_PATH, "--child"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  if (child.status !== 0) {
    throw new Error(child.stderr || "La mesure de démarrage a échoué.");
  }
  return JSON.parse(child.stdout.trim());
});

const result = {
  samples: SAMPLE_COUNT,
  initialModuleCount: graphPaths.length,
  initialModules: graphPaths.map((path) =>
    path.slice(ROOT.length + 1),
  ),
  initialGraphIncludesLegacyCorpus: graphPaths.some((path) =>
    /data\/wjazzd-(?:solos|chords)\.js$/.test(path)
  ),
  initialJavaScript: await compressedSizes(graphPaths),
  initialInterface: await compressedSizes(shellPaths),
  corpusDetails: {
    files: detailPaths.length,
    ...(await compressedSizes(detailPaths)),
  },
  firstCorpusBlock: detailPaths.length
    ? await compressedSizes([detailPaths[0]])
    : { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
  domStartup: {
    ready: samples.every(({ ready }) => ready),
    medianUsableMs: median(samples.map(({ usableMs }) => usableMs)),
    medianHeapDeltaBytes: median(
      samples.map(({ heapDeltaBytes }) => heapDeltaBytes),
    ),
    medianRssDeltaBytes: median(
      samples.map(({ rssDeltaBytes }) => rssDeltaBytes),
    ),
    samples,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
