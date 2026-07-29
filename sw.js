const CACHE_NAME = "dictee-musicale-v34";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=34",
  "./src/app.js?v=34",
  "./src/audio.js",
  "./src/engine.js",
  "./src/ratings.js",
  "./src/session.js",
  "./data/default-ratings.js",
  "./data/wjazzd-solos.js",
  "./data/wjazzd-chords.js",
  "./audio/parker/billies-bounce.mp3",
  "./audio/parker/donna-lee.mp3",
  "./audio/parker/ornithology.mp3",
  "./audio/parker/scrapple-from-the-apple.mp3",
  "./audio/parker/thriving-on-a-riff.mp3",
  "./audio/parker/yardbird-suite.mp3",
  "./audio/bass/28.mp3",
  "./audio/bass/29.mp3",
  "./audio/bass/30.mp3",
  "./audio/bass/31.mp3",
  "./audio/bass/32.mp3",
  "./audio/bass/33.mp3",
  "./audio/bass/34.mp3",
  "./audio/bass/35.mp3",
  "./audio/bass/36.mp3",
  "./audio/bass/37.mp3",
  "./audio/bass/38.mp3",
  "./audio/bass/39.mp3",
  "./audio/bass/40.mp3",
  "./audio/bass/41.mp3",
  "./audio/bass/42.mp3",
  "./audio/bass/43.mp3",
  "./audio/bass/44.mp3",
  "./audio/bass/45.mp3",
  "./audio/bass/46.mp3",
  "./audio/bass/47.mp3",
  "./audio/bass/48.mp3",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const mustRevalidate = ["document", "script", "style"].includes(
    event.request.destination,
  );
  event.respondWith(
    fetch(event.request, mustRevalidate ? { cache: "no-store" } : undefined)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((response) => response ?? caches.match("./"))),
  );
});
