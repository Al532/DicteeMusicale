export const MELODY_SAMPLE_INSTRUMENTS = Object.freeze({
  clarinet: Object.freeze({
    labelKey: "instrument.clarinet",
    minMidi: 50,
    maxMidi: 92,
    headSeconds: 0.025,
  }),
  piano: Object.freeze({
    labelKey: "instrument.piano",
    minMidi: 36,
    maxMidi: 96,
    headSeconds: 0,
  }),
});

export const DEFAULT_MELODY_SOUND = "synthetic";
export const MELODY_GAIN = 0.8;
export const MELODY_EMPHASIS_GAIN = 0.96;
export const MELODY_ATTACK_SECONDS = 0.006;
export const MELODY_RELEASE_SECONDS = 0.035;
export const BASS_GAIN = 0.3;
export const BASS_ATTACK_SECONDS = 0.005;
export const BASS_RELEASE_SECONDS = 0.075;

function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function keyboardMidiNotes(keyboard) {
  return Array.from(
    { length: keyboard.endMidi - keyboard.startMidi + 1 },
    (_, index) => keyboard.startMidi + index,
  );
}

export function createAudioRuntime({
  audioContextFactory = () => new globalThis.AudioContext(),
  fetchImpl = (...args) => globalThis.fetch(...args),
  baseUrl = globalThis.document?.baseURI,
  translate = (key) => key,
  random = Math.random,
  initialMelodySound = DEFAULT_MELODY_SOUND,
} = {}) {
  let audioContext;
  let melodySound = initialMelodySound;
  let chickBuffer = null;
  const activeAudioSources = new Set();
  const melodySampleBuffers = new Map();
  const melodySampleLoads = new Map();
  const bassSampleBuffers = new Map();
  const bassSampleLoads = new Map();

  function getAudioContext() {
    audioContext ??= audioContextFactory();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function setMelodySound(sound) {
    melodySound = sound;
  }

  function getMelodySound() {
    return melodySound;
  }

  function trackSource(source) {
    activeAudioSources.add(source);
    source.addEventListener("ended", () => {
      activeAudioSources.delete(source);
    });
    return source;
  }

  function stopActiveSources() {
    for (const source of activeAudioSources) {
      try {
        source.stop();
      } catch {
        // La source est peut-être déjà terminée.
      }
    }
    activeAudioSources.clear();
  }

  function activeSourceCount() {
    return activeAudioSources.size;
  }

  function melodySampleMidi(midi, sound = melodySound) {
    const instrument = MELODY_SAMPLE_INSTRUMENTS[sound];
    let closest = instrument.minMidi;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (
      let candidate = instrument.minMidi;
      candidate <= instrument.maxMidi;
      candidate += 1
    ) {
      if (pitchClass(candidate) !== pitchClass(midi)) continue;
      const distance = Math.abs(candidate - midi);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    return closest;
  }

  function assetUrl(path) {
    return new URL(path, baseUrl);
  }

  function loadMelodySample(midi, sound = melodySound) {
    const instrument = MELODY_SAMPLE_INSTRUMENTS[sound];
    const sampleMidi = melodySampleMidi(midi, sound);
    const sampleKey = `${sound}:${sampleMidi}`;
    if (melodySampleBuffers.has(sampleKey)) {
      return Promise.resolve(melodySampleBuffers.get(sampleKey));
    }
    if (!melodySampleLoads.has(sampleKey)) {
      const path = `audio/${sound}/${sampleMidi}.mp3`;
      const loading = fetchImpl(assetUrl(path))
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              translate("error.melodySampleUnavailable", {
                instrument: translate(instrument.labelKey),
                status: response.status,
              }),
            );
          }
          return response.arrayBuffer();
        })
        .then((bytes) => getAudioContext().decodeAudioData(bytes))
        .then((buffer) => {
          melodySampleBuffers.set(sampleKey, buffer);
          melodySampleLoads.delete(sampleKey);
          return buffer;
        })
        .catch((error) => {
          melodySampleLoads.delete(sampleKey);
          throw error;
        });
      melodySampleLoads.set(sampleKey, loading);
    }
    return melodySampleLoads.get(sampleKey);
  }

  async function preloadMelodySamples(notes, sound = melodySound) {
    if (!Object.hasOwn(MELODY_SAMPLE_INSTRUMENTS, sound)) return;
    const midiNotes = [
      ...new Set(notes.map((midi) => melodySampleMidi(midi, sound))),
    ];
    await Promise.all(
      midiNotes.map((midi) => loadMelodySample(midi, sound)),
    );
  }

  function playSyntheticTone(
    midi,
    startAt,
    duration,
    emphasis,
  ) {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const gain = context.createGain();
    const overtoneGain = context.createGain();
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const start = context.currentTime + startAt;
    const safeDuration = Math.max(0.012, duration);
    const stop = start + safeDuration;
    const attack = Math.min(0.012, safeDuration * 0.25);
    const release = Math.max(
      attack + 0.001,
      safeDuration - Math.min(0.035, safeDuration * 0.15),
    );

    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    overtone.type = "sine";
    overtone.frequency.value = frequency * 2;

    const volume = emphasis ? 0.2 : 0.145;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, start + release);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    overtoneGain.gain.setValueAtTime(0.0001, start);
    overtoneGain.gain.exponentialRampToValueAtTime(
      volume * 0.14,
      start + attack,
    );
    overtoneGain.gain.setValueAtTime(
      volume * 0.14,
      start + release,
    );
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(gain).connect(context.destination);
    overtone.connect(overtoneGain).connect(context.destination);
    trackSource(oscillator);
    trackSource(overtone);
    oscillator.start(start);
    overtone.start(start);
    oscillator.stop(stop + 0.02);
    overtone.stop(stop + 0.02);
  }

  function playTone(
    midi,
    startAt = 0,
    duration = 0.48,
    emphasis = false,
    sound = melodySound,
  ) {
    if (sound === DEFAULT_MELODY_SOUND) {
      playSyntheticTone(midi, startAt, duration, emphasis);
      return;
    }
    const instrument = MELODY_SAMPLE_INSTRUMENTS[sound];
    const sampleMidi = melodySampleMidi(midi, sound);
    const buffer = melodySampleBuffers.get(`${sound}:${sampleMidi}`);
    if (!buffer) {
      playSyntheticTone(midi, startAt, duration, emphasis);
      return;
    }

    const context = getAudioContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    const playbackRate = 2 ** ((midi - sampleMidi) / 12);
    const start = context.currentTime + startAt;
    const sampleOffset = Math.min(
      instrument.headSeconds,
      Math.max(0, buffer.duration - 0.001),
    );
    const availableDuration =
      (buffer.duration - sampleOffset) / playbackRate;
    const safeDuration = Math.max(
      0.012,
      Math.min(duration, availableDuration),
    );
    const stop = start + safeDuration;
    const attack = Math.min(
      MELODY_ATTACK_SECONDS,
      safeDuration * 0.25,
    );
    const release = Math.max(
      start + attack + 0.001,
      stop - Math.min(MELODY_RELEASE_SECONDS, safeDuration * 0.2),
    );
    const volume = emphasis
      ? MELODY_EMPHASIS_GAIN
      : MELODY_GAIN;

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, release);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    source.connect(gain).connect(context.destination);
    trackSource(source);
    source.start(start, sampleOffset);
    source.stop(stop + 0.02);
  }

  function playChick(startAt) {
    const context = getAudioContext();
    if (!chickBuffer || chickBuffer.sampleRate !== context.sampleRate) {
      const frameCount = Math.ceil(context.sampleRate * 0.045);
      chickBuffer = context.createBuffer(
        1,
        frameCount,
        context.sampleRate,
      );
      const samples = chickBuffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) {
        samples[index] = random() * 2 - 1;
      }
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + startAt;
    const stop = start + 0.045;
    source.buffer = chickBuffer;
    filter.type = "highpass";
    filter.frequency.value = 5200;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.055, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    source.connect(filter).connect(gain).connect(context.destination);
    trackSource(source);
    source.start(start);
    source.stop(stop);
  }

  function loadBassSample(midi) {
    if (bassSampleBuffers.has(midi)) {
      return Promise.resolve(bassSampleBuffers.get(midi));
    }
    if (!bassSampleLoads.has(midi)) {
      const path = `audio/bass/${midi}.mp3`;
      const loading = fetchImpl(assetUrl(path))
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              translate("error.bassSampleUnavailable", {
                status: response.status,
              }),
            );
          }
          return response.arrayBuffer();
        })
        .then((bytes) => getAudioContext().decodeAudioData(bytes))
        .then((buffer) => {
          bassSampleBuffers.set(midi, buffer);
          bassSampleLoads.delete(midi);
          return buffer;
        })
        .catch((error) => {
          bassSampleLoads.delete(midi);
          throw error;
        });
      bassSampleLoads.set(midi, loading);
    }
    return bassSampleLoads.get(midi);
  }

  async function preloadBassSamples(hits) {
    const midiNotes = [...new Set(hits.map(({ midi }) => midi))];
    await Promise.all(midiNotes.map(loadBassSample));
  }

  function playBass(midi, startAt, duration) {
    const buffer = bassSampleBuffers.get(midi);
    if (!buffer) return;
    const context = getAudioContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    const start = context.currentTime + startAt;
    const safeDuration = Math.max(
      0.04,
      Math.min(duration, buffer.duration),
    );
    const stop = start + safeDuration;
    const release = Math.max(
      start + BASS_ATTACK_SECONDS,
      stop - Math.min(BASS_RELEASE_SECONDS, safeDuration * 0.3),
    );

    source.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      BASS_GAIN,
      start + BASS_ATTACK_SECONDS,
    );
    gain.gain.setValueAtTime(BASS_GAIN, release);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    source.connect(gain).connect(context.destination);
    trackSource(source);
    source.start(start);
    source.stop(stop + 0.02);
  }

  return Object.freeze({
    getAudioContext,
    setMelodySound,
    getMelodySound,
    melodySampleMidi,
    loadMelodySample,
    preloadMelodySamples,
    playSyntheticTone,
    playTone,
    playChick,
    loadBassSample,
    preloadBassSamples,
    playBass,
    trackSource,
    stopActiveSources,
    activeSourceCount,
  });
}
