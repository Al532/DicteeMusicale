import test from "node:test";
import assert from "node:assert/strict";

import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";
import {
  RECORDING_EXACT_SEEK_REVALIDATIONS,
} from "../data/recording-revalidations.js";
import {
  exactSeekRevalidationFor,
} from "../src/recording-workshop.js";
import { createYouTubeExactPlayer } from "../src/youtube-player.js";

function exactPlayerHarness() {
  let currentTime = 0;
  let now = 0;
  let nextTimerId = 1;
  let scheduled = null;
  let playerEvents = null;
  let videoId = null;
  const calls = [];
  const iframeElement = { src: "" };
  const player = {
    getCurrentTime() {
      return currentTime;
    },
    getVideoData() {
      return { video_id: videoId };
    },
    loadVideoById(options) {
      calls.push(["loadVideoById", options]);
      videoId = options.videoId;
    },
    mute() {
      calls.push(["mute"]);
    },
    pauseVideo() {
      calls.push(["pauseVideo"]);
    },
    playVideo() {
      calls.push(["playVideo"]);
    },
    seekTo(seconds, allowSeekAhead) {
      calls.push(["seekTo", seconds, allowSeekAhead]);
      currentTime = allowSeekAhead ? seconds - 2 : seconds;
    },
    unMute() {
      calls.push(["unMute"]);
    },
  };
  const windowObject = {
    clearTimeout(id) {
      if (scheduled?.id === id) scheduled = null;
    },
    location: { origin: "https://example.test" },
    performance: { now: () => now },
    setTimeout(callback) {
      const id = nextTimerId;
      nextTimerId += 1;
      scheduled = { callback, id };
      return id;
    },
  };
  function Player(_iframe, { events }) {
    playerEvents = events;
    return player;
  }
  const exactPlayer = createYouTubeExactPlayer({
    apiLoader: async () => ({ Player }),
    documentObject: {},
    iframeElement,
    windowObject,
  });

  return {
    calls,
    exactPlayer,
    iframeElement,
    player,
    ready() {
      playerEvents.onReady({ target: player });
    },
    runTimer(milliseconds = 25) {
      assert.ok(scheduled, "timer expected");
      const { callback } = scheduled;
      scheduled = null;
      now += milliseconds;
      callback();
    },
    setCurrentTime(value) {
      currentTime = value;
    },
  };
}

test("le seek attend onReady puis reste muet jusqu’au temps exact", async () => {
  const harness = exactPlayerHarness();
  const synchronizationPromise = harness.exactPlayer.load({
    embedUrl:
      "https://www.youtube-nocookie.com/embed/abcdefghijk" +
      "?autoplay=1&enablejsapi=1&start=10&end=13",
    exactEnd: 12,
    exactStart: 10,
    youtubeId: "abcdefghijk",
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.calls, []);
  assert.equal(
    new URL(harness.iframeElement.src).searchParams.get("origin"),
    "https://example.test",
  );
  assert.equal(
    new URL(harness.iframeElement.src).searchParams.get("autoplay"),
    "0",
  );

  harness.ready();
  assert.deepEqual(harness.calls.slice(0, 4), [
    ["mute"],
    [
      "loadVideoById",
      { endSeconds: 12, startSeconds: 10, videoId: "abcdefghijk" },
    ],
    ["seekTo", 10, true],
    ["playVideo"],
  ]);
  assert.equal(
    harness.calls.some(([method]) => method === "unMute"),
    false,
  );

  harness.setCurrentTime(10.02);
  harness.runTimer();
  const synchronization = await synchronizationPromise;
  assert.equal(synchronization.requestedStart, 10);
  assert.equal(synchronization.actualStart, 10.02);
  assert.equal(harness.calls.at(-1)[0], "unMute");

  harness.setCurrentTime(12);
  harness.runTimer(50);
  assert.equal(harness.calls.at(-1)[0], "pauseVideo");
});

test("un second chargement avant onReady remplace bien la première vidéo", async () => {
  const harness = exactPlayerHarness();
  const first = harness.exactPlayer.load({
    embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk",
    exactEnd: 12,
    exactStart: 10,
    youtubeId: "abcdefghijk",
  });
  await Promise.resolve();
  await Promise.resolve();

  const second = harness.exactPlayer.load({
    embedUrl: "https://www.youtube-nocookie.com/embed/lmnopqrstuv",
    exactEnd: 23,
    exactStart: 20,
    youtubeId: "lmnopqrstuv",
  });
  assert.equal(await first, null);

  harness.ready();
  assert.deepEqual(
    harness.calls.find(([method]) => method === "loadVideoById"),
    [
      "loadVideoById",
      { endSeconds: 23, startSeconds: 20, videoId: "lmnopqrstuv" },
    ],
  );
  harness.setCurrentTime(20.01);
  harness.runTimer();
  assert.equal((await second).youtubeId, "lmnopqrstuv");
});

test("la file de revalidation cible les 12 vidéos JazzTube exactes", () => {
  assert.equal(
    Object.keys(RECORDING_EXACT_SEEK_REVALIDATIONS).length,
    12,
  );
  for (const [soloId, queued] of Object.entries(
    RECORDING_EXACT_SEEK_REVALIDATIONS,
  )) {
    assert.deepEqual(
      exactSeekRevalidationFor(soloId, RECORDING_VALIDATIONS[soloId]),
      queued,
      soloId,
    );
    assert.equal(
      exactSeekRevalidationFor(soloId, {
        ...RECORDING_VALIDATIONS[soloId],
        updatedAt: "2026-08-01T12:00:00.000Z",
      }),
      null,
      soloId,
    );
  }
});
