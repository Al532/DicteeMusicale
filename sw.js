const CACHE_PREFIX = "dictee-musicale-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v49`;
const CORPUS_CACHE = `${CACHE_PREFIX}corpus-0bebff94`;
const CORPUS_MANIFEST = "./data/wjazzd-blocks/manifest.json";
const CORPUS_BLOCK_PATH = "/data/wjazzd-blocks/block-";

const CORE_SHELL = [
  "./index.html",
  "./styles.css?v=49",
  "./src/app.js?v=49",
  "./src/app-dom.js",
  "./src/app-renderer.js",
  "./src/app-shell.js",
  "./src/audio.js",
  "./src/audio-runtime.js",
  "./src/corpus-loader.js",
  "./src/embedded-browser.js",
  "./src/engine.js",
  "./src/exercise.js",
  "./src/i18n.js",
  "./src/original-player.js",
  "./src/persistence.js",
  "./src/phrase-editor.js",
  "./src/phrase-settings.js",
  "./src/ratings.js",
  "./src/rating-workflow.js",
  "./src/recording.js",
  "./src/recording-workshop.js",
  "./src/session.js",
  "./data/default-phrase-settings.js",
  "./data/default-ratings.js",
  "./data/wjazzd-index.js",
  "./data/recording-validations.js",
  "./data/youtube-search-recordings.js",
  "./data/wjazzd-blocks/manifest.json",
  "./manifest.webmanifest",
  "./manifest-fr.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
];

const OFFLINE_MEDIA = [
  ...Array.from(
    { length: 21 },
    (_, index) => `./audio/bass/${index + 28}.mp3`,
  ),
  "./audio/parker/billies-bounce.mp3",
  "./audio/parker/donna-lee.mp3",
  "./audio/parker/ornithology.mp3",
  "./audio/parker/scrapple-from-the-apple.mp3",
  "./audio/parker/thriving-on-a-riff.mp3",
  "./audio/parker/yardbird-suite.mp3",
];

async function fetchAndCache(cache, resource) {
  const response = await fetch(resource, { cache: "reload" });
  if (!response.ok) {
    throw new Error(`${resource}: ${response.status}`);
  }
  await cache.put(resource, response);
}

async function cacheWithConcurrency(
  cache,
  resources,
  concurrency = 4,
) {
  let nextResource = 0;
  async function worker() {
    while (nextResource < resources.length) {
      const resource = resources[nextResource];
      nextResource += 1;
      await fetchAndCache(cache, resource);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, resources.length) },
      () => worker(),
    ),
  );
}

async function readCorpusManifest() {
  const shell = await caches.open(SHELL_CACHE);
  const cached = await shell.match(CORPUS_MANIFEST);
  const response = cached ?? await fetch(CORPUS_MANIFEST);
  if (!response?.ok) {
    throw new Error("Corpus manifest unavailable");
  }
  const manifest = await response.json();
  if (
    !manifest ||
    !Array.isArray(manifest.blocks) ||
    !manifest.blocks.length
  ) {
    throw new Error("Corpus manifest invalid");
  }
  return manifest;
}

async function corpusBlockResources() {
  const manifest = await readCorpusManifest();
  const manifestUrl = new URL(CORPUS_MANIFEST, self.location.href);
  return manifest.blocks.map(({ url }) =>
    new URL(url, manifestUrl).toString(),
  );
}

async function installOfflineApplication() {
  const shell = await caches.open(SHELL_CACHE);
  await cacheWithConcurrency(shell, CORE_SHELL, 6);

  const corpus = await caches.open(CORPUS_CACHE);
  const blockResources = await corpusBlockResources();
  await cacheWithConcurrency(corpus, blockResources, 4);
  await cacheWithConcurrency(shell, OFFLINE_MEDIA, 4);

  await self.skipWaiting();
}

self.addEventListener("install", (event) => {
  event.waitUntil(installOfflineApplication());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const currentCaches = new Set([SHELL_CACHE, CORPUS_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              !currentCaches.has(key),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .open(SHELL_CACHE)
        .then(async (cache) =>
          (await cache.match("./index.html")) ??
          fetch(event.request),
        ),
    );
    return;
  }

  const cacheName = requestUrl.pathname.includes(CORPUS_BLOCK_PATH)
    ? CORPUS_CACHE
    : SHELL_CACHE;
  event.respondWith(cacheFirst(event.request, cacheName));
});
