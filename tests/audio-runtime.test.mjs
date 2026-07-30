import test from "node:test";
import assert from "node:assert/strict";

import {
  BASS_GAIN,
  DEFAULT_MELODY_SOUND,
  MELODY_EMPHASIS_GAIN,
  MELODY_SAMPLE_INSTRUMENTS,
  createAudioRuntime,
  keyboardMidiNotes,
} from "../src/audio-runtime.js";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
    this.listeners = new Map();
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeScheduledSource extends FakeAudioNode {
  constructor() {
    super();
    this.startCalls = [];
    this.stopCalls = [];
    this.playbackRate = new FakeAudioParam(1);
  }

  start(...args) {
    this.startCalls.push(args);
  }

  stop(...args) {
    this.stopCalls.push(args);
  }
}

class FakeAudioContext {
  constructor({
    currentTime = 10,
    sampleRate = 1000,
    decodedDuration = 1,
    suspended = false,
  } = {}) {
    this.currentTime = currentTime;
    this.sampleRate = sampleRate;
    this.decodedDuration = decodedDuration;
    this.state = suspended ? "suspended" : "running";
    this.destination = new FakeAudioNode();
    this.oscillators = [];
    this.gains = [];
    this.sources = [];
    this.filters = [];
    this.buffers = [];
    this.decodeCalls = [];
    this.resumeCalls = 0;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = "running";
  }

  createOscillator() {
    const oscillator = new FakeScheduledSource();
    oscillator.frequency = { value: 0 };
    oscillator.type = "";
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = new FakeAudioNode();
    gain.gain = new FakeAudioParam(1);
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = new FakeScheduledSource();
    source.buffer = null;
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = new FakeAudioNode();
    filter.type = "";
    filter.frequency = { value: 0 };
    filter.Q = { value: 0 };
    this.filters.push(filter);
    return filter;
  }

  createBuffer(channels, frameCount, sampleRate) {
    const channelData = Array.from(
      { length: channels },
      () => new Float32Array(frameCount),
    );
    const buffer = {
      sampleRate,
      duration: frameCount / sampleRate,
      getChannelData(channel) {
        return channelData[channel];
      },
    };
    this.buffers.push(buffer);
    return buffer;
  }

  async decodeAudioData(bytes) {
    this.decodeCalls.push(bytes);
    return {
      duration: this.decodedDuration,
      decodedFrom: bytes,
    };
  }
}

function okResponse(bytes = new ArrayBuffer(4)) {
  return {
    ok: true,
    async arrayBuffer() {
      return bytes;
    },
  };
}

function makeRuntime({
  context = new FakeAudioContext(),
  fetchImpl = async () => okResponse(),
  initialMelodySound = DEFAULT_MELODY_SOUND,
  translate = (key, values) =>
    values
      ? `${key}:${values.instrument ?? ""}:${values.status ?? ""}`
      : key,
  random = () => 0.75,
} = {}) {
  return {
    context,
    runtime: createAudioRuntime({
      audioContextFactory: () => context,
      fetchImpl,
      baseUrl: "https://example.test/app/",
      translate,
      random,
      initialMelodySound,
    }),
  };
}

test("le runtime conserve les deux instruments échantillonnés masqués", () => {
  assert.deepEqual(Object.keys(MELODY_SAMPLE_INSTRUMENTS), [
    "clarinet",
    "piano",
  ]);
  assert.deepEqual(MELODY_SAMPLE_INSTRUMENTS.clarinet, {
    labelKey: "instrument.clarinet",
    minMidi: 50,
    maxMidi: 92,
    headSeconds: 0.025,
  });
  assert.deepEqual(MELODY_SAMPLE_INSTRUMENTS.piano, {
    labelKey: "instrument.piano",
    minMidi: 36,
    maxMidi: 96,
    headSeconds: 0,
  });
  assert.deepEqual(
    keyboardMidiNotes({ startMidi: 60, endMidi: 63 }),
    [60, 61, 62, 63],
  );
});

test("le son synthétique conserve oscillateurs, enveloppes et fallback", () => {
  const context = new FakeAudioContext({ suspended: true });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "clarinet",
  });

  runtime.playTone(69, 0.5, 0.48, false);

  assert.equal(context.resumeCalls, 1);
  assert.equal(context.oscillators.length, 2);
  assert.equal(context.sources.length, 0);
  assert.equal(context.oscillators[0].type, "triangle");
  assert.equal(context.oscillators[0].frequency.value, 440);
  assert.equal(context.oscillators[1].type, "sine");
  assert.equal(context.oscillators[1].frequency.value, 880);
  assert.deepEqual(context.oscillators[0].startCalls, [[10.5]]);
  assert.deepEqual(context.oscillators[0].stopCalls, [[11]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.5],
    ["exponential", 0.145, 10.512],
    ["set", 0.145, 10.945],
    ["exponential", 0.0001, 10.98],
  ]);
  assert.equal(runtime.activeSourceCount(), 2);
  context.oscillators[0].emit("ended");
  assert.equal(runtime.activeSourceCount(), 1);
});

test("les samples de mélodie sont dédupliqués, mis en cache et transposés", async () => {
  const fetched = [];
  const context = new FakeAudioContext({ decodedDuration: 1 });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "clarinet",
    fetchImpl: async (url) => {
      fetched.push(url.toString());
      return okResponse();
    },
  });

  assert.equal(runtime.melodySampleMidi(49), 61);
  const firstLoad = runtime.loadMelodySample(49);
  const duplicateLoad = runtime.loadMelodySample(61);
  assert.strictEqual(firstLoad, duplicateLoad);
  await Promise.all([firstLoad, duplicateLoad]);
  await runtime.preloadMelodySamples([49, 61]);
  assert.deepEqual(fetched, [
    "https://example.test/app/audio/clarinet/61.mp3",
  ]);
  assert.equal(context.decodeCalls.length, 1);

  runtime.playTone(49, 0.2, 0.48, true);
  const source = context.sources[0];
  assert.equal(source.playbackRate.events[0][1], 0.5);
  assert.deepEqual(source.startCalls, [[10.2, 0.025]]);
  assert.deepEqual(source.stopCalls, [[10.7]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.2],
    ["exponential", MELODY_EMPHASIS_GAIN, 10.206],
    ["set", MELODY_EMPHASIS_GAIN, 10.645],
    ["exponential", 0.0001, 10.68],
  ]);
});

test("un chargement échoué est retenté et garde le message traduit", async () => {
  let attempt = 0;
  const { runtime } = makeRuntime({
    initialMelodySound: "piano",
    fetchImpl: async () => {
      attempt += 1;
      return attempt === 1
        ? {
            ok: false,
            status: 503,
          }
        : okResponse();
    },
  });

  await assert.rejects(
    runtime.loadMelodySample(60),
    /error\.melodySampleUnavailable:instrument\.piano:503/,
  );
  await runtime.loadMelodySample(60);
  assert.equal(attempt, 2);
});

test("la basse conserve son cache, son gain et ses durées", async () => {
  const fetched = [];
  const context = new FakeAudioContext({ decodedDuration: 0.5 });
  const { runtime } = makeRuntime({
    context,
    fetchImpl: async (url) => {
      fetched.push(url.toString());
      return okResponse();
    },
  });

  runtime.playBass(36, 0, 1);
  assert.equal(context.sources.length, 0);

  await runtime.preloadBassSamples([
    { midi: 36 },
    { midi: 36 },
  ]);
  await runtime.loadBassSample(36);
  assert.deepEqual(fetched, [
    "https://example.test/app/audio/bass/36.mp3",
  ]);

  runtime.playBass(36, 0.2, 2);
  const source = context.sources[0];
  assert.deepEqual(source.startCalls, [[10.2]]);
  assert.deepEqual(source.stopCalls, [[10.719999999999999]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.2],
    ["exponential", BASS_GAIN, 10.205],
    ["set", BASS_GAIN, 10.625],
    ["exponential", 0.0001, 10.7],
  ]);
});

test("le chick réutilise son buffer et les sources peuvent toutes être arrêtées", () => {
  const context = new FakeAudioContext();
  const { runtime } = makeRuntime({ context });

  runtime.playChick(0.1);
  runtime.playChick(0.2);

  assert.equal(context.buffers.length, 1);
  assert.equal(context.buffers[0].getChannelData(0)[0], 0.5);
  assert.equal(context.filters[0].type, "highpass");
  assert.equal(context.filters[0].frequency.value, 5200);
  assert.equal(context.filters[0].Q.value, 0.7);
  assert.equal(runtime.activeSourceCount(), 2);

  context.sources[0].stop = () => {
    throw new Error("already stopped");
  };
  assert.doesNotThrow(() => runtime.stopActiveSources());
  assert.equal(runtime.activeSourceCount(), 0);
});
