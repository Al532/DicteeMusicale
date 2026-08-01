const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";
const apiLoads = new WeakMap();

export function loadYouTubeIframeApi({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
} = {}) {
  if (windowObject?.YT?.Player) {
    return Promise.resolve(windowObject.YT);
  }
  if (apiLoads.has(windowObject)) return apiLoads.get(windowObject);

  const load = new Promise((resolve, reject) => {
    const previousReady = windowObject.onYouTubeIframeAPIReady;
    let settled = false;

    function finish(error = null) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (windowObject.YT?.Player) resolve(windowObject.YT);
      else reject(new Error("YouTube IFrame API unavailable"));
    }

    windowObject.onYouTubeIframeAPIReady = (...args) => {
      try {
        previousReady?.(...args);
      } finally {
        finish();
      }
    };

    let script = documentObject.querySelector(
      `script[src="${YOUTUBE_IFRAME_API_URL}"]`,
    );
    if (!script) {
      script = documentObject.createElement("script");
      script.src = YOUTUBE_IFRAME_API_URL;
      script.async = true;
      documentObject.head.append(script);
    }
    script.addEventListener(
      "error",
      () => finish(new Error("Unable to load YouTube IFrame API")),
      { once: true },
    );
  });
  apiLoads.set(windowObject, load);
  return load;
}

function safePlayerCall(player, method, ...args) {
  try {
    return player?.[method]?.(...args);
  } catch {
    return undefined;
  }
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function embedUrlWithOrigin(embedUrl, origin) {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "0");
  url.searchParams.set("enablejsapi", "1");
  if (origin && origin !== "null") url.searchParams.set("origin", origin);
  return url.toString();
}

export function createYouTubeExactPlayer({
  apiLoader = loadYouTubeIframeApi,
  documentObject = globalThis.document,
  iframeElement,
  maxStartOvershootSeconds = 0.25,
  pollIntervalMilliseconds = 25,
  retrySeekMilliseconds = 500,
  startToleranceSeconds = 0.05,
  syncTimeoutMilliseconds = 10_000,
  windowObject = globalThis.window,
} = {}) {
  let active = null;
  let apiPromise = null;
  let generation = 0;
  let player = null;
  let playerReady = false;
  let timer = null;

  const now = () =>
    windowObject.performance?.now?.() ?? Date.now();

  function clearTimer() {
    if (timer !== null) windowObject.clearTimeout(timer);
    timer = null;
  }

  function schedule(callback, delay = pollIntervalMilliseconds) {
    clearTimer();
    timer = windowObject.setTimeout(callback, delay);
  }

  function settleActive(value, { reject = false } = {}) {
    const pending = active?.pending;
    if (!pending) return;
    active.pending = null;
    if (reject) pending.reject(value);
    else pending.resolve(value);
  }

  function fail(error) {
    if (!active) return;
    clearTimer();
    safePlayerCall(player, "pauseVideo");
    settleActive(error, { reject: true });
    active = null;
  }

  function monitorExactEnd(version) {
    if (!active || active.version !== version) return;
    const exactEnd = finiteNumber(active.choice.exactEnd);
    if (exactEnd === null) return;
    const currentTime = Number(
      safePlayerCall(player, "getCurrentTime"),
    );
    if (Number.isFinite(currentTime) && currentTime >= exactEnd) {
      safePlayerCall(player, "pauseVideo");
      clearTimer();
      return;
    }
    schedule(() => monitorExactEnd(version), 50);
  }

  function completeSynchronization(currentTime) {
    if (!active) return;
    const { choice, version } = active;
    active.synchronized = true;
    safePlayerCall(player, "unMute");
    settleActive({
      actualStart: currentTime,
      exactEnd: choice.exactEnd,
      requestedStart: choice.exactStart,
      youtubeId: choice.youtubeId,
    });
    monitorExactEnd(version);
  }

  function seekToExactStart(allowSeekAhead) {
    if (!active) return;
    const exactStart = finiteNumber(active.choice.exactStart);
    if (exactStart === null) return;
    safePlayerCall(player, "seekTo", exactStart, allowSeekAhead);
    active.lastSeekAt = now();
  }

  function checkSynchronization(version) {
    if (!active || active.version !== version || active.synchronized) {
      return;
    }
    const exactStart = finiteNumber(active.choice.exactStart);
    const currentTime = Number(
      safePlayerCall(player, "getCurrentTime"),
    );
    const checkedAt = now();
    const currentYoutubeId = safePlayerCall(
      player,
      "getVideoData",
    )?.video_id;

    if (currentYoutubeId !== active.choice.youtubeId) {
      if (checkedAt - active.startedAt >= syncTimeoutMilliseconds) {
        fail(new Error("YouTube did not load the requested video"));
        return;
      }
      schedule(() => checkSynchronization(version));
      return;
    }

    if (exactStart === null) {
      completeSynchronization(
        Number.isFinite(currentTime) ? currentTime : null,
      );
      return;
    }

    if (Number.isFinite(currentTime)) {
      if (
        currentTime >= exactStart - startToleranceSeconds &&
        currentTime <= exactStart + maxStartOvershootSeconds
      ) {
        completeSynchronization(currentTime);
        return;
      }

      if (
        active.lastObservedTime === null ||
        currentTime > active.lastObservedTime + 0.005
      ) {
        active.lastProgressAt = checkedAt;
      }
      active.lastObservedTime = currentTime;

      if (currentTime > exactStart + maxStartOvershootSeconds) {
        seekToExactStart(false);
        safePlayerCall(player, "playVideo");
      } else if (
        checkedAt - active.lastProgressAt >= retrySeekMilliseconds &&
        checkedAt - active.lastSeekAt >= retrySeekMilliseconds
      ) {
        // The first seek may land on the preceding keyframe. Once that
        // segment is buffered, a second seek can reach the fractional time.
        seekToExactStart(false);
        safePlayerCall(player, "playVideo");
      }
    }

    if (checkedAt - active.startedAt >= syncTimeoutMilliseconds) {
      fail(new Error("YouTube playback did not reach the requested time"));
      return;
    }
    schedule(() => checkSynchronization(version));
  }

  function beginPlayback() {
    if (!active || !playerReady) return;
    clearTimer();
    active.startedAt = now();
    active.lastObservedTime = null;
    active.lastProgressAt = active.startedAt;
    active.lastSeekAt = Number.NEGATIVE_INFINITY;
    active.synchronized = false;
    safePlayerCall(player, "mute");

    const { choice } = active;
    const loadOptions = { videoId: choice.youtubeId };
    if (Number.isFinite(choice.exactStart)) {
      loadOptions.startSeconds = choice.exactStart;
    }
    if (Number.isFinite(choice.exactEnd)) {
      loadOptions.endSeconds = choice.exactEnd;
    }
    safePlayerCall(player, "loadVideoById", loadOptions);

    seekToExactStart(true);
    safePlayerCall(player, "playVideo");
    checkSynchronization(active.version);
  }

  function handlePlayerReady(event) {
    player = event?.target ?? player;
    playerReady = true;
    beginPlayback();
  }

  function handlePlayerError(event) {
    fail(new Error(`YouTube player error: ${event?.data ?? "unknown"}`));
  }

  function handlePlayerStateChange() {
    if (!active) return;
    if (active.synchronized) monitorExactEnd(active.version);
    else checkSynchronization(active.version);
  }

  function prepare() {
    apiPromise ??= apiLoader({ documentObject, windowObject });
    return apiPromise;
  }

  function load(choice) {
    const version = ++generation;
    clearTimer();
    if (active?.pending) settleActive(null);

    let resolvePending;
    let rejectPending;
    const pending = new Promise((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    active = {
      choice,
      pending: {
        reject: rejectPending,
        resolve: resolvePending,
      },
      synchronized: false,
      version,
    };

    void prepare()
      .then((api) => {
        if (!active || active.version !== version) return;
        if (player && playerReady) {
          beginPlayback();
          return;
        }
        iframeElement.src = embedUrlWithOrigin(
          choice.embedUrl,
          windowObject.location?.origin,
        );
        if (!player) {
          player = new api.Player(iframeElement, {
            events: {
              onError: handlePlayerError,
              onReady: handlePlayerReady,
              onStateChange: handlePlayerStateChange,
            },
          });
        }
      })
      .catch((error) => {
        if (active?.version === version) fail(error);
      });

    return pending;
  }

  function stop() {
    generation += 1;
    clearTimer();
    if (active?.pending) settleActive(null);
    active = null;
    safePlayerCall(player, "pauseVideo");
  }

  return Object.freeze({
    load,
    pause: stop,
    prepare,
    stop,
  });
}
