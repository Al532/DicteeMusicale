function finiteMidi(value) {
  const midi = Number(value);
  return Number.isFinite(midi) ? Math.round(midi) : null;
}

export function nearestOctaveTranslation(inputMidi, targetMidi) {
  const input = finiteMidi(inputMidi);
  const target = finiteMidi(targetMidi);
  if (input === null || target === null) return 0;

  const octaveDistance = (target - input) / 12;
  const translations = [
    Math.floor(octaveDistance) * 12,
    Math.ceil(octaveDistance) * 12,
  ];
  return translations.sort((left, right) => {
    const leftDistance = Math.abs(target - (input + left));
    const rightDistance = Math.abs(target - (input + right));
    return (
      leftDistance - rightDistance ||
      Math.abs(left) - Math.abs(right) ||
      left - right
    );
  })[0];
}

export function createMidiAttemptMapper() {
  let translation = null;

  return Object.freeze({
    map(inputMidi, targetMidi, { commit = true } = {}) {
      const input = finiteMidi(inputMidi);
      if (input === null) return null;
      const nextTranslation =
        translation ?? nearestOctaveTranslation(input, targetMidi);
      if (translation === null && commit) translation = nextTranslation;
      return input + nextTranslation;
    },
    reset() {
      translation = null;
    },
    snapshot() {
      return { translation };
    },
  });
}

export function parseMidiMessage(data) {
  if (!data || data.length < 2) return null;
  const status = Number(data[0]);
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const midi = Number(data[1]) & 0x7f;
  const velocity = Number(data[2] ?? 0) & 0x7f;

  if (command === 0x90 && velocity > 0) {
    return { channel, midi, type: "noteon", velocity };
  }
  if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    return { channel, midi, type: "noteoff", velocity };
  }
  return null;
}

function midiInputs(access) {
  return [...(access?.inputs?.values?.() ?? [])].filter(
    (input) => input?.type !== "output" && input?.state !== "disconnected",
  );
}

export function createMidiInput({
  navigatorObject = globalThis.navigator,
  onNoteOff = () => {},
  onNoteOn = () => {},
  onStatusChange = () => {},
} = {}) {
  const supported =
    typeof navigatorObject?.requestMIDIAccess === "function";
  const bindings = new Map();
  const activeNotes = new Map();
  const anonymousInputIds = new WeakMap();
  let nextAnonymousInputId = 1;
  let access = null;
  let accessStateListener = null;
  let connecting = null;
  let disposed = false;
  let inputCount = 0;
  let error = null;
  let state = supported ? "idle" : "unsupported";

  function snapshot() {
    return {
      error,
      inputCount,
      state,
      supported,
    };
  }

  function publish(nextState = state, nextInputCount = inputCount) {
    state = nextState;
    inputCount = nextInputCount;
    onStatusChange(snapshot());
  }

  function inputId(input) {
    if (input?.id) return String(input.id);
    if (!anonymousInputIds.has(input)) {
      anonymousInputIds.set(input, `anonymous-${nextAnonymousInputId}`);
      nextAnonymousInputId += 1;
    }
    return anonymousInputIds.get(input);
  }

  function noteIdFor(id, channel, midi) {
    return `${id}:${channel}:${midi}`;
  }

  function releaseActiveNote(noteId, fallback = null) {
    const active = activeNotes.get(noteId);
    if (active) activeNotes.delete(noteId);
    onNoteOff(active ?? fallback);
  }

  function releaseInputNotes(id) {
    for (const [noteId, active] of activeNotes) {
      if (active.inputId === id) releaseActiveNote(noteId, active);
    }
  }

  function handleMidiMessage(input, event) {
    if (disposed) return;
    const message = parseMidiMessage(event?.data);
    if (!message) return;
    const id = inputId(input);
    const noteId = noteIdFor(id, message.channel, message.midi);
    const payload = {
      ...message,
      id: noteId,
      inputId: id,
    };

    if (message.type === "noteon") {
      if (activeNotes.has(noteId)) releaseActiveNote(noteId);
      activeNotes.set(noteId, payload);
      onNoteOn(payload);
      return;
    }
    releaseActiveNote(noteId, payload);
  }

  function detachInput(id) {
    const binding = bindings.get(id);
    if (!binding) return;
    binding.remove();
    bindings.delete(id);
    releaseInputNotes(id);
  }

  function attachInput(input) {
    const id = inputId(input);
    if (bindings.has(id)) return;
    const listener = (event) => handleMidiMessage(input, event);
    let remove;
    if (typeof input.addEventListener === "function") {
      input.addEventListener("midimessage", listener);
      remove = () => input.removeEventListener("midimessage", listener);
    } else {
      const previous = input.onmidimessage;
      input.onmidimessage = listener;
      remove = () => {
        if (input.onmidimessage === listener) {
          input.onmidimessage = previous ?? null;
        }
      };
    }
    bindings.set(id, { input, remove });
  }

  function synchronizeInputs() {
    if (!access || disposed) return snapshot();
    const inputs = midiInputs(access);
    const nextIds = new Set(inputs.map(inputId));
    for (const id of bindings.keys()) {
      if (!nextIds.has(id)) detachInput(id);
    }
    for (const input of inputs) attachInput(input);
    publish(inputs.length ? "connected" : "ready", inputs.length);
    return snapshot();
  }

  async function connect() {
    if (!supported || disposed) return snapshot();
    if (access) return synchronizeInputs();
    if (connecting) return connecting;

    error = null;
    publish("connecting", 0);
    connecting = Promise.resolve()
      .then(() => navigatorObject.requestMIDIAccess({ sysex: false }))
      .then((nextAccess) => {
        if (disposed) return snapshot();
        access = nextAccess;
        accessStateListener = () => synchronizeInputs();
        if (typeof access.addEventListener === "function") {
          access.addEventListener("statechange", accessStateListener);
        } else {
          access.onstatechange = accessStateListener;
        }
        return synchronizeInputs();
      })
      .catch((reason) => {
        error =
          reason instanceof Error ? reason.message : String(reason ?? "");
        publish("error", 0);
        return snapshot();
      })
      .finally(() => {
        connecting = null;
      });
    return connecting;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of [...bindings.keys()]) detachInput(id);
    if (accessStateListener && access) {
      if (typeof access.removeEventListener === "function") {
        access.removeEventListener("statechange", accessStateListener);
      } else if (access.onstatechange === accessStateListener) {
        access.onstatechange = null;
      }
    }
    access = null;
    accessStateListener = null;
  }

  return Object.freeze({ connect, dispose, snapshot });
}
