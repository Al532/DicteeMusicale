import test from "node:test";
import assert from "node:assert/strict";

import {
  createMidiAttemptMapper,
  createMidiInput,
  nearestOctaveTranslation,
  parseMidiMessage,
} from "../src/midi-input.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeMidiInput extends FakeEventTarget {
  constructor(id = "keyboard-1") {
    super();
    this.id = id;
    this.state = "connected";
    this.type = "input";
  }

  send(data) {
    this.emit("midimessage", { data: Uint8Array.from(data) });
  }
}

test("la première note fixe l’octave MIDI jusqu’à la tentative suivante", () => {
  assert.equal(nearestOctaveTranslation(36, 62), 24);
  assert.equal(nearestOctaveTranslation(60, 66), 0);

  const mapper = createMidiAttemptMapper();
  assert.equal(mapper.map(36, 62), 60);
  assert.deepEqual(mapper.snapshot(), { translation: 24 });
  assert.equal(mapper.map(51, 62), 75);

  mapper.reset();
  assert.deepEqual(mapper.snapshot(), { translation: null });
  assert.equal(mapper.map(51, 62, { commit: false }), 63);
  assert.deepEqual(mapper.snapshot(), { translation: null });
  assert.equal(mapper.map(51, 62), 63);
  assert.deepEqual(mapper.snapshot(), { translation: 12 });
});

test("le décodage distingue note-on, note-off et vélocité nulle", () => {
  assert.deepEqual(parseMidiMessage([0x92, 64, 91]), {
    channel: 2,
    midi: 64,
    type: "noteon",
    velocity: 91,
  });
  assert.deepEqual(parseMidiMessage([0x82, 64, 45]), {
    channel: 2,
    midi: 64,
    type: "noteoff",
    velocity: 45,
  });
  assert.deepEqual(parseMidiMessage([0x92, 64, 0]), {
    channel: 2,
    midi: 64,
    type: "noteoff",
    velocity: 0,
  });
  assert.equal(parseMidiMessage([0xb0, 64, 127]), null);
});

test("Web MIDI transmet les note-on et libère les notes au note-off", async () => {
  const input = new FakeMidiInput();
  const access = new FakeEventTarget();
  access.inputs = new Map([[input.id, input]]);
  const requests = [];
  const noteOns = [];
  const noteOffs = [];
  const statuses = [];
  const controller = createMidiInput({
    navigatorObject: {
      async requestMIDIAccess(options) {
        requests.push(options);
        return access;
      },
    },
    onNoteOn: (message) => noteOns.push(message),
    onNoteOff: (message) => noteOffs.push(message),
    onStatusChange: (status) => statuses.push(status),
  });

  await controller.connect();
  assert.deepEqual(requests, [{ sysex: false }]);
  assert.equal(controller.snapshot().state, "connected");
  assert.equal(controller.snapshot().inputCount, 1);
  assert.deepEqual(
    statuses.map(({ state }) => state),
    ["connecting", "connected"],
  );

  input.send([0x90, 60, 100]);
  assert.equal(noteOns.length, 1);
  assert.equal(noteOffs.length, 0);
  assert.equal(noteOns[0].id, "keyboard-1:0:60");

  input.send([0xb0, 64, 127]);
  assert.equal(noteOns.length, 1);
  assert.equal(noteOffs.length, 0);

  input.send([0x90, 60, 0]);
  assert.equal(noteOns.length, 1);
  assert.equal(noteOffs.length, 1);
  assert.equal(noteOffs[0].id, "keyboard-1:0:60");

  input.send([0x91, 61, 90]);
  input.state = "disconnected";
  access.emit("statechange", { port: input });
  assert.equal(noteOffs.at(-1).id, "keyboard-1:1:61");
  assert.equal(controller.snapshot().state, "ready");
  assert.equal(controller.snapshot().inputCount, 0);

  controller.dispose();
});
