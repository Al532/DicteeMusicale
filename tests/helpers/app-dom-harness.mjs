import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { clearCorpusBlockCache } from "../../src/corpus-loader.js";

const GLOBAL_NAMES = [
  "AudioContext",
  "__DICTEE_MUSICALE_TEST__",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "performance",
  "screen",
  "window",
];

function installGlobal(name, value, originals) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
}

function restoreGlobals(originals) {
  for (const name of GLOBAL_NAMES) {
    const descriptor = originals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

async function flushMicrotasks(turns = 12) {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setImmediate(resolve));
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

function createClock(window) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  function setTimeout(callback, delay = 0, ...args) {
    const id = nextId;
    nextId += 1;
    timers.set(id, {
      args,
      callback,
      dueAt: now + Math.max(0, Number(delay) || 0),
      id,
    });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  function nextTimerAtOrBefore(target) {
    return [...timers.values()]
      .filter(({ dueAt }) => dueAt <= target)
      .sort(
        (left, right) =>
          left.dueAt - right.dueAt || left.id - right.id,
      )[0];
  }

  async function tick(milliseconds) {
    const target = now + Math.max(0, Number(milliseconds) || 0);
    let timer = nextTimerAtOrBefore(target);
    while (timer) {
      timers.delete(timer.id);
      now = timer.dueAt;
      timer.callback(...timer.args);
      await flushMicrotasks();
      timer = nextTimerAtOrBefore(target);
    }
    now = target;
    await flushMicrotasks();
  }

  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(now), 16);
  window.cancelAnimationFrame = clearTimeout;

  return {
    get now() {
      return now;
    },
    pending: () => [...timers.values()].map(({ dueAt }) => dueAt),
    tick,
  };
}

function createAudioHarness(clock) {
  const calls = {
    buffers: [],
    decoded: 0,
    sources: [],
  };

  function createBuffer(numberOfChannels, length, sampleRate) {
    const channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
    const buffer = {
      copyToChannel(source, channel) {
        channels[channel].set(source.subarray(0, length));
      },
      duration: length / sampleRate,
      getChannelData(channel) {
        return channels[channel];
      },
      length,
      numberOfChannels,
      sampleRate,
    };
    calls.buffers.push(buffer);
    return buffer;
  }

  function audioParam(initialValue = 0) {
    return {
      value: initialValue,
      cancelScheduledValues() {},
      exponentialRampToValueAtTime(value) {
        this.value = value;
      },
      linearRampToValueAtTime(value) {
        this.value = value;
      },
      setValueAtTime(value) {
        this.value = value;
      },
    };
  }

  function audioSource(kind) {
    const listeners = new Map();
    const source = {
      kind,
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      connect(target) {
        return target;
      },
      disconnect() {},
      start(...args) {
        source.startedWith = args;
      },
      stop() {
        source.stopped = true;
      },
    };
    calls.sources.push(source);
    return source;
  }

  class FakeAudioContext {
    constructor() {
      this.destination = {};
      this.sampleRate = 44_100;
      this.state = "running";
    }

    get currentTime() {
      return clock.now / 1000;
    }

    createBuffer(numberOfChannels, length, sampleRate) {
      return createBuffer(numberOfChannels, length, sampleRate);
    }

    createBufferSource() {
      return audioSource("buffer");
    }

    createBiquadFilter() {
      return {
        connect(target) {
          return target;
        },
        frequency: audioParam(0),
        Q: audioParam(0),
        type: "lowpass",
      };
    }

    createGain() {
      return {
        connect(target) {
          return target;
        },
        gain: audioParam(1),
      };
    }

    createOscillator() {
      return {
        ...audioSource("oscillator"),
        frequency: audioParam(440),
        type: "sine",
      };
    }

    async decodeAudioData() {
      calls.decoded += 1;
      return createBuffer(1, 120_000, 200);
    }

    resume() {
      this.state = "running";
    }
  }

  return { calls, FakeAudioContext };
}

export async function bootApp({
  deferCorpus = false,
  favorites = [],
  storage = {},
} = {}) {
  // Chaque démarrage représente un nouveau chargement de page : le cache
  // mémoire du chargeur ne doit pas survivre d'un DOM de test au suivant.
  clearCorpusBlockCache();
  const html = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const originals = new Map();
  const clock = createClock(dom.window);
  const audio = createAudioHarness(clock);
  const fetchCalls = [];
  const pendingCorpusFetches = [];
  const serviceWorkerCalls = [];
  const mediaQueries = new Map();

  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: (query) => {
      if (!mediaQueries.has(query)) {
        mediaQueries.set(query, {
          matches: false,
          addEventListener() {},
          removeEventListener() {},
        });
      }
      return mediaQueries.get(query);
    },
  });
  Object.defineProperty(dom.window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      async register(path) {
        serviceWorkerCalls.push(path);
        return {};
      },
    },
  });
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      async writeText() {},
    },
  });
  Object.defineProperty(dom.window.screen, "orientation", {
    configurable: true,
    value: {
      async lock() {},
      unlock() {},
    },
  });
  let fullscreenElement = null;
  Object.defineProperty(dom.window.document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  dom.window.document.documentElement.requestFullscreen = async () => {
    fullscreenElement = dom.window.document.documentElement;
  };
  dom.window.document.exitFullscreen = async () => {
    fullscreenElement = null;
  };
  dom.window.URL.createObjectURL = () => "blob:test";
  dom.window.URL.revokeObjectURL = () => {};

  async function corpusResponse(url) {
    try {
      const source = await readFile(url, "utf8");
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return new TextEncoder().encode(source).buffer;
        },
        async json() {
          return JSON.parse(source);
        },
      };
    } catch {
      return {
        ok: false,
        status: 404,
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
        async json() {
          throw new Error("Bloc introuvable");
        },
      };
    }
  }

  const fetch = async (input) => {
    fetchCalls.push(String(input));
    const url = input instanceof URL ? input : new URL(String(input));
    if (
      url.protocol === "file:" &&
      url.pathname.includes("/data/wjazzd-blocks/")
    ) {
      if (deferCorpus) {
        return new Promise((resolve) => {
          pendingCorpusFetches.push({
            resolve: async () => resolve(await corpusResponse(url)),
            url: String(url),
          });
        });
      }
      try {
        return await corpusResponse(url);
      } catch {
        return corpusResponse(url);
      }
    }
    return {
      ok: true,
      status: 200,
      async arrayBuffer() {
        return new ArrayBuffer(16);
      },
      async json() {
        return {};
      },
    };
  };
  const testApi = {};
  const fakePerformance = {
    now: () => clock.now,
  };

  for (const [key, value] of Object.entries(storage)) {
    dom.window.localStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }
  if (favorites.length) {
    dom.window.localStorage.setItem(
      "dictee-musicale.favorites.v1",
      JSON.stringify(favorites),
    );
  }

  installGlobal("AudioContext", audio.FakeAudioContext, originals);
  installGlobal("__DICTEE_MUSICALE_TEST__", testApi, originals);
  installGlobal("document", dom.window.document, originals);
  installGlobal("fetch", fetch, originals);
  installGlobal("localStorage", dom.window.localStorage, originals);
  installGlobal("navigator", dom.window.navigator, originals);
  installGlobal("performance", fakePerformance, originals);
  installGlobal("screen", dom.window.screen, originals);
  installGlobal("window", dom.window, originals);
  dom.window.AudioContext = audio.FakeAudioContext;
  dom.window.fetch = fetch;

  await import(`../../src/app.js?behavior=${Date.now()}-${Math.random()}`);
  await flushMicrotasks();

  const document = dom.window.document;
  const element = (selector) => {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`Élément introuvable : ${selector}`);
    return found;
  };

  async function click(selector) {
    element(selector).click();
    await flushMicrotasks(24);
  }

  async function change(selector, value, { checked = null } = {}) {
    const target = element(selector);
    if (value !== undefined) target.value = String(value);
    if (checked !== null) target.checked = Boolean(checked);
    target.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await flushMicrotasks();
  }

  async function pointerDown(selector) {
    element(selector).dispatchEvent(
      new dom.window.Event("pointerdown", { bubbles: true }),
    );
    await flushMicrotasks(24);
  }

  async function waitFor(predicate, message = "condition attendue") {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = predicate();
      if (result) return result;
      await flushMicrotasks(4);
      await delay(1);
    }
    throw new Error(`Délai dépassé : ${message}`);
  }

  return {
    audio: audio.calls,
    change,
    click,
    clock,
    close() {
      dom.window.close();
      restoreGlobals(originals);
    },
    document,
    element,
    fetchCalls,
    flush: flushMicrotasks,
    pointerDown,
    pendingCorpusFetches,
    async resolveCorpusFetch(index = 0) {
      const [pending] = pendingCorpusFetches.splice(index, 1);
      if (!pending) {
        throw new Error(`Chargement différé introuvable : ${index}`);
      }
      await pending.resolve();
      await flushMicrotasks(24);
    },
    serviceWorkerCalls,
    snapshot: () => testApi.snapshot(),
    storageJson(key) {
      const value = dom.window.localStorage.getItem(key);
      return value === null ? null : JSON.parse(value);
    },
    waitFor,
    window: dom.window,
  };
}

export async function finishPlayback(app) {
  if (!app.snapshot().isPlaying) await app.clock.tick(900);
  const state = app.snapshot();
  const exercise = state.exercise;
  const last = exercise.timings.at(-1);
  const totalMilliseconds =
    (last.offset + last.duration) *
      (100 / exercise.speedPercent) *
    1000;
  const elapsedMilliseconds =
    app.clock.now - exercise.playbackStartedAt;
  await app.clock.tick(
    Math.max(0, totalMilliseconds - elapsedMilliseconds) + 1,
  );
}

export async function enterExerciseNotes(app) {
  for (const midi of app.snapshot().exercise.notes) {
    await app.pointerDown(`#piano [data-midi="${midi}"]`);
  }
}
