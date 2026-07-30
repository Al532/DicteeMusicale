const CACHE_NAME = "dictee-musicale-v41";
const APP_SHELL = [
  "./index.html",
  "./styles.css?v=41",
  "./src/app.js?v=41",
  "./src/i18n.js",
  "./src/audio.js",
  "./src/engine.js",
  "./src/ratings.js",
  "./src/phrase-settings.js",
  "./src/session.js",
  "./data/default-ratings.js",
  "./data/default-phrase-settings.js",
  "./data/wjazzd-solos.js",
  "./data/wjazzd-chords.js",
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
  "./manifest-fr.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
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
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .match("./index.html")
        .then((cachedShell) => cachedShell ?? fetch(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(event.request);
      if (networkResponse.ok && networkResponse.status === 200) {
        const copy = networkResponse.clone();
        event.waitUntil(
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy)),
        );
      }
      return networkResponse;
    }),
  );
});
