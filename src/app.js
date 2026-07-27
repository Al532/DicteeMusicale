import {
  NOTE_NAMES,
  intervalLabel,
  isCorrectMidi,
  keyboardLayoutForNotes,
  makeParkerTranspositionCycle,
  makeSequence,
  pitchClass,
  summarizeRecords,
} from "./engine.js";
import { pitchShiftAudioBuffer, sliceAudioBuffer } from "./audio.js";

const STORAGE_KEY = "dictee-musicale.records.v1";
const SETTINGS_KEY = "dictee-musicale.settings.v1";
const RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE = 100;
const LEGATO_RELEASE_SECONDS = 0.035;
const WRONG_NOTE_REPLAY_DELAY_MS = 650;
const RANDOM_SLIDER_MIN = 25;
const RANDOM_SLIDER_MAX = 100;
const RANDOM_PLAYBACK_MIN_PERCENT = 50;
const RANDOM_PLAYBACK_MAX_PERCENT = 640;
const ORIGINAL_TAIL_SECONDS = 0.25;
const COMPLETION_MODAL_DELAY_MS = 350;
const GAME_MODE_START_DELAY_MS = 900;

const elements = {
  gameLength: document.querySelector("#game-length"),
  gameLengthLabel: document.querySelector("#game-length-label"),
  gameLengthOutput: document.querySelector("#game-length-output"),
  gameSpeed: document.querySelector("#game-speed"),
  gameSpeedOutput: document.querySelector("#game-speed-output"),
  gameSpeedSetting: document.querySelector("#game-speed-setting"),
  startParker: document.querySelector("#start-parker"),
  startRandom: document.querySelector("#start-random"),
  nextExercise: document.querySelector("#next-exercise"),
  replay: document.querySelector("#replay"),
  feedback: document.querySelector("#feedback"),
  kicker: document.querySelector("#exercise-kicker"),
  piano: document.querySelector("#piano"),
  exportCsv: document.querySelector("#export-csv"),
  exportJson: document.querySelector("#export-json"),
  importJson: document.querySelector("#import-json"),
  resetStats: document.querySelector("#reset-stats"),
  installButton: document.querySelector("#install-button"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  exitPortraitMode: document.querySelector("#exit-portrait-mode"),
  sourceLine: document.querySelector("#source-line"),
  sourceDetails: document.querySelector("#source-details"),
  sourceLink: document.querySelector("#source-link"),
  audioSourceLink: document.querySelector("#audio-source-link"),
  originalControls: document.querySelector("#original-controls"),
  playOriginal: document.querySelector("#play-original"),
  transposeOriginal: document.querySelector("#transpose-original"),
  completionModal: document.querySelector("#completion-modal"),
  completionOriginal: document.querySelector("#completion-original"),
  restartExercise: document.querySelector("#restart-exercise"),
  transposeExercise: document.querySelector("#transpose-exercise"),
  completionNext: document.querySelector("#completion-next"),
  completionExit: document.querySelector("#completion-exit"),
  stats: {
    exercises: document.querySelector("#stat-exercises"),
    notes: document.querySelector("#stat-notes"),
    accuracy: document.querySelector("#stat-accuracy"),
    response: document.querySelector("#stat-response"),
    weaknesses: document.querySelector("#weaknesses"),
  },
};

let audioContext;
let exercise = null;
let acceptingInput = false;
let deferredInstallPrompt = null;
let records = readJson(STORAGE_KEY, []);
let currentMode = "parker";
let randomLength = 5;
let parkerMaxNotes = 15;
let parkerSpeedPercent = 100;
let randomPlaybackSpeedPercent = 88;
const fullscreenDisplayMode = window.matchMedia("(display-mode: fullscreen)");
const activeAudioSources = new Set();
const decodedAudioBuffers = new Map();
let playbackTimer = null;
let restartTimer = null;
let completionTimer = null;
let gameModeStartTimer = null;
let chickBuffer = null;
let isPlaying = false;
let isOriginalPlaying = false;
let originalPlaybackToken = 0;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomSliderToPlaybackPercent(value) {
  const ratio =
    (Number(value) - RANDOM_SLIDER_MIN) /
    (RANDOM_SLIDER_MAX - RANDOM_SLIDER_MIN);
  return (
    RANDOM_PLAYBACK_MIN_PERCENT +
    ratio * (RANDOM_PLAYBACK_MAX_PERCENT - RANDOM_PLAYBACK_MIN_PERCENT)
  );
}

function randomPlaybackToSliderPercent(value) {
  const ratio =
    (Number(value) - RANDOM_PLAYBACK_MIN_PERCENT) /
    (RANDOM_PLAYBACK_MAX_PERCENT - RANDOM_PLAYBACK_MIN_PERCENT);
  return RANDOM_SLIDER_MIN + ratio * (RANDOM_SLIDER_MAX - RANDOM_SLIDER_MIN);
}

function loadSettings() {
  const settings = readJson(SETTINGS_KEY, {});
  currentMode = settings.mode === "random" ? "random" : "parker";
  randomLength = clamp(
    Math.round(settings.randomLength ?? settings.length ?? 5),
    3,
    15,
  );
  parkerMaxNotes = clamp(Math.round(settings.parkerMaxNotes ?? 15), 5, 15);
  randomPlaybackSpeedPercent = clamp(
    Number(
      settings.randomPlaybackPercent ??
        settings.randomSpeedPercent ??
        settings.randomTempo ??
        settings.tempo ??
        88,
    ),
    RANDOM_PLAYBACK_MIN_PERCENT,
    RANDOM_PLAYBACK_MAX_PERCENT,
  );
  parkerSpeedPercent = clamp(Number(settings.parkerSpeed ?? 100), 25, 100);
  elements.transposeOriginal.checked = Boolean(settings.transposeOriginal);
  updateModeSettings();
}

function saveSettings() {
  writeJson(SETTINGS_KEY, {
    randomLength,
    parkerMaxNotes,
    randomPlaybackPercent: randomPlaybackSpeedPercent,
    parkerSpeed: parkerSpeedPercent,
    transposeOriginal: elements.transposeOriginal.checked,
    mode: currentMode,
  });
}

function updateSettingLabels() {
  elements.gameLengthOutput.value = elements.gameLength.value;
  elements.gameSpeedOutput.value = `${Math.round(elements.gameSpeed.value)} %`;
}

function updateModeSettings() {
  const isParker = currentMode === "parker";
  elements.gameSpeedSetting.hidden = false;
  elements.gameLengthLabel.textContent = isParker ? "Notes max" : "Notes";
  elements.gameLength.min = isParker ? "5" : "3";
  elements.gameLength.max = "15";
  elements.gameLength.value = isParker ? parkerMaxNotes : randomLength;
  if (isParker) {
    elements.gameSpeed.min = "25";
    elements.gameSpeed.max = "100";
    elements.gameSpeed.step = "5";
    elements.gameSpeed.value = parkerSpeedPercent;
  } else {
    elements.gameSpeed.min = String(RANDOM_SLIDER_MIN);
    elements.gameSpeed.max = String(RANDOM_SLIDER_MAX);
    elements.gameSpeed.step = "1";
    elements.gameSpeed.value = randomPlaybackToSliderPercent(
      randomPlaybackSpeedPercent,
    );
  }
  updateSettingLabels();
}

function syncLength(value) {
  const numericValue = Number(value);
  if (currentMode === "parker") parkerMaxNotes = numericValue;
  else randomLength = numericValue;
  elements.gameLength.value = value;
  updateSettingLabels();
  saveSettings();
}

function syncParkerSpeed(value) {
  parkerSpeedPercent = Number(value);
  elements.gameSpeed.value = value;
  updateSettingLabels();
  saveSettings();
}

function syncRandomSpeed(value) {
  randomPlaybackSpeedPercent = randomSliderToPlaybackPercent(value);
  elements.gameSpeed.value = value;
  updateSettingLabels();
  saveSettings();
}

function syncGameSpeed(value) {
  if (currentMode === "parker") syncParkerSpeed(value);
  else syncRandomSpeed(value);
}

function startMode(mode) {
  currentMode = mode;
  updateModeSettings();
  saveSettings();
  startExercise();
}

function buildPiano(layout) {
  elements.piano.replaceChildren();
  const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
  const whiteMidi = [];
  for (let midi = layout.startMidi; midi <= layout.endMidi; midi += 1) {
    if (!blackPitchClasses.has(pitchClass(midi))) whiteMidi.push(midi);
  }
  const whiteCount = whiteMidi.length;
  elements.piano.style.setProperty("--white-key-count", String(whiteCount));
  elements.piano.setAttribute(
    "aria-label",
    `Piano de ${layout.chunkCount} zones, du ${noteLabel(layout.startMidi)} au ${noteLabel(layout.endMidi)}`,
  );

  for (const [whiteIndex, midi] of whiteMidi.entries()) {
    const key = createKey(midi, "white");
    key.style.left = `${(whiteIndex * 100) / whiteCount}%`;
    if (pitchClass(midi) === 0 || pitchClass(midi) === 5) {
      key.classList.add("chunk-start");
    }
    elements.piano.append(key);
  }

  for (let midi = layout.startMidi; midi <= layout.endMidi; midi += 1) {
    if (!blackPitchClasses.has(pitchClass(midi))) continue;
    const previousWhiteIndex = whiteMidi.indexOf(midi - 1);
    if (previousWhiteIndex < 0) continue;
    const key = createKey(midi, "black");
    const whiteBoundary = previousWhiteIndex + 1;
    key.style.left =
      `calc(${(whiteBoundary * 100) / whiteCount}% - ` +
      `(100% / ${whiteCount} * 0.31))`;
    elements.piano.append(key);
  }
}

function noteLabel(midi) {
  return `${NOTE_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`;
}

function createKey(midi, color) {
  const key = document.createElement("button");
  key.type = "button";
  key.className = `key ${color}`;
  key.dataset.midi = String(midi);
  key.setAttribute("aria-label", noteLabel(midi));
  if (color === "white") {
    const label = document.createElement("span");
    label.textContent = noteLabel(midi);
    key.append(label);
  }
  key.addEventListener("pointerdown", () => handlePianoInput(midi, key));
  return key;
}

function getAudioContext() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(midi, startAt = 0, duration = 0.48, emphasis = false) {
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
  overtoneGain.gain.exponentialRampToValueAtTime(volume * 0.14, start + attack);
  overtoneGain.gain.setValueAtTime(volume * 0.14, start + release);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(gain).connect(context.destination);
  overtone.connect(overtoneGain).connect(context.destination);
  activeAudioSources.add(oscillator);
  activeAudioSources.add(overtone);
  oscillator.addEventListener("ended", () => activeAudioSources.delete(oscillator));
  overtone.addEventListener("ended", () => activeAudioSources.delete(overtone));
  oscillator.start(start);
  overtone.start(start);
  oscillator.stop(stop + 0.02);
  overtone.stop(stop + 0.02);
}

function playChick(startAt) {
  const context = getAudioContext();
  if (!chickBuffer || chickBuffer.sampleRate !== context.sampleRate) {
    const frameCount = Math.ceil(context.sampleRate * 0.045);
    chickBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = chickBuffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      samples[index] = Math.random() * 2 - 1;
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
  gain.gain.setValueAtTime(0.032, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  source.connect(filter).connect(gain).connect(context.destination);
  activeAudioSources.add(source);
  source.addEventListener("ended", () => activeAudioSources.delete(source));
  source.start(start);
  source.stop(stop);
}

function setPlaybackState(playing) {
  isPlaying = playing;
  elements.replay.textContent = playing ? "Stop" : "Réécouter";
  elements.replay.setAttribute("aria-pressed", String(playing));
}

function setOriginalPlaybackState(playing) {
  isOriginalPlaying = playing;
  elements.playOriginal.textContent = playing ? "Stop" : "Écouter Charlie Parker";
  elements.playOriginal.setAttribute("aria-pressed", String(playing));
  elements.completionOriginal.textContent = playing ? "Stop" : "Écouter l’original";
  elements.completionOriginal.setAttribute("aria-pressed", String(playing));
}

function stopAllTones() {
  originalPlaybackToken += 1;
  if (gameModeStartTimer !== null) {
    window.clearTimeout(gameModeStartTimer);
    gameModeStartTimer = null;
  }
  if (playbackTimer !== null) {
    window.clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer);
    restartTimer = null;
  }
  for (const source of activeAudioSources) {
    try {
      source.stop();
    } catch {
      // La source est peut-être déjà terminée.
    }
  }
  activeAudioSources.clear();
  setPlaybackState(false);
  setOriginalPlaybackState(false);
}

function restoreExerciseInput(message = null) {
  if (!exercise) return;
  acceptingInput = exercise.currentIndex < exercise.notes.length;
  if (!acceptingInput) return;
  exercise.guessStartedAt = performance.now();
  elements.feedback.className = "feedback";
  elements.feedback.textContent =
    message ??
    `À toi — retrouve la note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
}

function loadOriginalAudio(path) {
  if (!decodedAudioBuffers.has(path)) {
    const loading = fetch(new URL(path, document.baseURI))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Enregistrement indisponible (${response.status})`);
        }
        return response.arrayBuffer();
      })
      .then((bytes) => getAudioContext().decodeAudioData(bytes))
      .catch((error) => {
        decodedAudioBuffers.delete(path);
        throw error;
      });
    decodedAudioBuffers.set(path, loading);
  }
  return decodedAudioBuffers.get(path);
}

async function playOriginalExcerpt({ forceOriginalPitch = false } = {}) {
  const sourceMeta = exercise?.source;
  if (!sourceMeta?.audioFile) return;

  stopAllTones();
  const token = originalPlaybackToken;
  setOriginalPlaybackState(true);
  acceptingInput = false;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Chargement de l’enregistrement…";

  try {
    const context = getAudioContext();
    const recording = await loadOriginalAudio(sourceMeta.audioFile);
    if (token !== originalPlaybackToken) return;

    const phraseStart = sourceMeta.audioOffset + sourceMeta.onsetStart;
    const phraseEnd = sourceMeta.audioOffset + sourceMeta.onsetEnd;
    const clipStart = Math.max(0, phraseStart);
    const clipEnd = Math.min(
      recording.duration,
      phraseEnd + ORIGINAL_TAIL_SECONDS,
    );
    let clip = sliceAudioBuffer(context, recording, clipStart, clipEnd);
    const semitones = !forceOriginalPitch && elements.transposeOriginal.checked
      ? sourceMeta.transposition
      : 0;

    if (semitones) {
      elements.feedback.textContent = "Transposition de l’enregistrement…";
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (token !== originalPlaybackToken) return;
      clip = pitchShiftAudioBuffer(context, clip, semitones);
    }
    if (token !== originalPlaybackToken) return;

    const recordingSource = context.createBufferSource();
    const gain = context.createGain();
    recordingSource.buffer = clip;
    gain.gain.value = 0.82;
    recordingSource.connect(gain).connect(context.destination);
    activeAudioSources.add(recordingSource);
    recordingSource.addEventListener("ended", () => {
      activeAudioSources.delete(recordingSource);
      if (token !== originalPlaybackToken || !isOriginalPlaying) return;
      if (playbackTimer !== null) {
        window.clearTimeout(playbackTimer);
        playbackTimer = null;
      }
      setOriginalPlaybackState(false);
      restoreExerciseInput();
    });

    const transpositionLabel = semitones
      ? ` transposé ${semitones > 0 ? "+" : ""}${semitones}`
      : "";
    elements.feedback.textContent = `Enregistrement original${transpositionLabel}…`;
    recordingSource.start();
    playbackTimer = window.setTimeout(() => {
      playbackTimer = null;
      setOriginalPlaybackState(false);
      restoreExerciseInput();
    }, clip.duration * 1000 + 100);
  } catch {
    if (token !== originalPlaybackToken) return;
    setOriginalPlaybackState(false);
    restoreExerciseInput("Impossible de lire cet enregistrement.");
    elements.feedback.className = "feedback error";
  }
}

function toggleOriginalPlayback() {
  if (!exercise?.source?.audioFile) return;
  if (isOriginalPlaying) {
    stopAllTones();
    restoreExerciseInput("Lecture originale arrêtée. À toi.");
    return;
  }
  playOriginalExcerpt();
}

function toggleCompletionOriginal() {
  if (isOriginalPlaying) {
    stopAllTones();
    return;
  }
  playOriginalExcerpt({ forceOriginalPitch: true });
}

function flashPlayedKey(midi, delayMs, durationMs) {
  const key = elements.piano.querySelector(`[data-midi="${midi}"]`);
  if (!key) return;
  window.setTimeout(() => key.classList.add("active"), delayMs);
  window.setTimeout(() => key.classList.remove("active"), delayMs + durationMs);
}

function playSequence() {
  if (!exercise) return;
  stopAllTones();
  setPlaybackState(true);
  elements.replay.disabled = false;
  acceptingInput = false;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Écoute bien…";
  let playbackDuration;
  if (exercise.timings) {
    exercise.speedPercent = parkerSpeedPercent;
    const timeScale = 100 / exercise.speedPercent;
    exercise.notes.forEach((midi, index) => {
      const timing = exercise.timings[index];
      const startSeconds = timing.offset * timeScale;
      const durationSeconds = timing.duration * timeScale;
      playTone(midi, startSeconds, durationSeconds, index === 0);
      if (index === 0) {
        flashPlayedKey(midi, startSeconds * 1000, durationSeconds * 1000);
      }
    });
    for (const chick of exercise.chicks ?? []) {
      playChick(chick.offset * timeScale);
    }
    const lastTiming = exercise.timings.at(-1);
    playbackDuration = (lastTiming.offset + lastTiming.duration) * timeScale * 1000;
  } else {
    exercise.speedPercent = Number(elements.gameSpeed.value);
    exercise.playbackRatePercent = randomPlaybackSpeedPercent;
    const notesPerMinute =
      RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE *
      (exercise.playbackRatePercent / 100);
    const noteIntervalMs = 60_000 / notesPerMinute;
    const toneDuration = noteIntervalMs / 1000 + LEGATO_RELEASE_SECONDS;
    exercise.notes.forEach((midi, index) => {
      const delayMs = index * noteIntervalMs;
      playTone(midi, delayMs / 1000, toneDuration, index === 0);
      if (index === 0) {
        flashPlayedKey(midi, delayMs, toneDuration * 1000);
      }
    });
    playbackDuration =
      exercise.notes.length * noteIntervalMs + LEGATO_RELEASE_SECONDS * 1000;
  }

  playbackTimer = window.setTimeout(() => {
    playbackTimer = null;
    setPlaybackState(false);
    acceptingInput = exercise.currentIndex < exercise.notes.length;
    exercise.guessStartedAt = performance.now();
    elements.feedback.textContent =
      `À toi — retrouve la note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
  }, playbackDuration);
}

function markReferenceKey() {
  elements.piano.querySelectorAll(".reference-key").forEach((key) => {
    key.classList.remove("reference-key");
  });
  if (!exercise) return;
  const key = elements.piano.querySelector(`[data-midi="${exercise.notes[0]}"]`);
  key?.classList.add("reference-key");
}

async function startExercise() {
  hideCompletionModal();
  getAudioContext();
  const enteringGameMode = !document.body.classList.contains("game-mode");
  if (enteringGameMode) await enterGameMode();
  saveSettings();
  const generated = makeSequence({
    length: randomLength,
    maxNotes: parkerMaxNotes,
    mode: currentMode,
  });
  exercise = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    mode: currentMode,
    label: generated.meta.label,
    source: generated.meta.source,
    tempo: null,
    speedPercent: generated.timings
      ? parkerSpeedPercent
      : Number(elements.gameSpeed.value),
    playbackRatePercent: generated.timings ? null : randomPlaybackSpeedPercent,
    originalTempo: generated.meta.originalTempo ?? null,
    notes: generated.notes,
    originalNotes: generated.notes.map(
      (midi) => midi - (generated.meta.source.transposition ?? 0),
    ),
    transposition: generated.meta.source.transposition ?? 0,
    transpositionCycle: makeParkerTranspositionCycle({
      excludeTransposition: generated.meta.source.transposition ?? 0,
    }),
    timings: generated.timings ?? null,
    chicks: generated.chicks ?? null,
    keyboard: generated.keyboard,
    currentIndex: 0,
    attempts: [],
    replayCount: 0,
    guessStartedAt: null,
  };

  elements.kicker.textContent = generated.meta.label;
  renderSource(generated.meta.source);
  const hasOriginal = Boolean(generated.meta.source.audioFile);
  elements.originalControls.hidden = !hasOriginal;
  elements.playOriginal.disabled = !hasOriginal;
  elements.transposeOriginal.disabled = !hasOriginal;
  elements.replay.disabled = enteringGameMode;
  elements.nextExercise.disabled = false;
  buildPiano(generated.keyboard);
  markReferenceKey();
  if (enteringGameMode) {
    acceptingInput = false;
    elements.feedback.className = "feedback";
    elements.feedback.textContent = "Prépare-toi…";
    gameModeStartTimer = window.setTimeout(() => {
      gameModeStartTimer = null;
      playSequence();
    }, GAME_MODE_START_DELAY_MS);
  } else {
    playSequence();
  }
}

function renderSource(source) {
  elements.sourceLine.hidden = false;
  const transposition =
    Number.isFinite(source.transposition)
      ? source.transposition === 0
        ? " · tonalité originale"
        : ` · transposition ${source.transposition > 0 ? "+" : ""}${source.transposition} demi-tons`
      : "";
  const originalTempo = Number.isFinite(source.originalTempo)
    ? ` · tempo original ${Math.round(source.originalTempo)} BPM`
    : "";
  elements.sourceDetails.textContent =
    `Source : ${source.label}${transposition}${originalTempo}.`;
  if (source.url) {
    elements.sourceLink.hidden = false;
    elements.sourceLink.href = source.url;
    elements.sourceLink.textContent = source.dataset ?? "Voir la source";
  } else {
    elements.sourceLink.hidden = true;
    elements.sourceLink.removeAttribute("href");
  }
  if (source.audioSourceUrl) {
    elements.audioSourceLink.hidden = false;
    elements.audioSourceLink.href = source.audioSourceUrl;
    elements.audioSourceLink.textContent = "Enregistrement source";
  } else {
    elements.audioSourceLink.hidden = true;
    elements.audioSourceLink.removeAttribute("href");
  }
}

function hideCompletionModal() {
  if (completionTimer !== null) {
    window.clearTimeout(completionTimer);
    completionTimer = null;
  }
  elements.completionModal.hidden = true;
}

function showCompletionModal() {
  elements.completionOriginal.hidden = !exercise?.source?.audioFile;
  elements.completionModal.hidden = false;
  window.requestAnimationFrame(() => elements.completionNext.focus());
}

function scheduleCompletionModal() {
  completionTimer = window.setTimeout(() => {
    completionTimer = null;
    showCompletionModal();
  }, COMPLETION_MODAL_DELAY_MS);
}

function prepareRepeatedExercise() {
  exercise.id = crypto.randomUUID();
  exercise.startedAt = new Date().toISOString();
  exercise.completedAt = null;
  exercise.attempts = [];
  exercise.replayCount = 0;
}

function restartSameExercise() {
  if (!exercise) return;
  hideCompletionModal();
  stopAllTones();
  prepareRepeatedExercise();
  resetExerciseProgress();
  playSequence();
}

function transposeSameExercise() {
  if (!exercise) return;
  hideCompletionModal();
  stopAllTones();
  if (!exercise.transpositionCycle.length) {
    exercise.transpositionCycle = makeParkerTranspositionCycle({
      avoidFirstTransposition: exercise.transposition,
    });
  }
  const transposition = exercise.transpositionCycle.shift();
  exercise.transposition = transposition;
  exercise.notes = exercise.originalNotes.map((midi) => midi + transposition);
  exercise.source = { ...exercise.source, transposition };
  exercise.keyboard = keyboardLayoutForNotes(exercise.notes);
  prepareRepeatedExercise();
  resetExerciseProgress();
  renderSource(exercise.source);
  buildPiano(exercise.keyboard);
  markReferenceKey();
  playSequence();
}

function togglePlayback() {
  if (!exercise) return;
  if (isPlaying) {
    stopAllTones();
    resetExerciseProgress();
    restoreExerciseInput("Lecture arrêtée. Repars de la première note.");
    return;
  }
  if (exercise.completedAt) {
    prepareRepeatedExercise();
  }
  exercise.replayCount += 1;
  resetExerciseProgress();
  playSequence();
}

function resetExerciseProgress() {
  if (!exercise) return;
  acceptingInput = false;
  exercise.currentIndex = 0;
  exercise.guessStartedAt = null;
}

function restartAfterMistake() {
  resetExerciseProgress();
  elements.feedback.className = "feedback error";
  elements.feedback.textContent = "Erreur — on réécoute depuis le début.";
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    playSequence();
  }, WRONG_NOTE_REPLAY_DELAY_MS);
}

function handlePianoInput(midi, key) {
  playTone(midi, 0, 0.36);
  key.classList.add("active");
  window.setTimeout(() => key.classList.remove("active"), 160);
  if (!exercise || !acceptingInput) return;

  const target = exercise.notes[exercise.currentIndex];
  let attempt = exercise.attempts.find((item) => item.position === exercise.currentIndex);
  if (!attempt) {
    const previousMidi =
      exercise.currentIndex > 0 ? exercise.notes[exercise.currentIndex - 1] : null;
    attempt = {
      position: exercise.currentIndex,
      targetMidi: target,
      targetPitchClass: pitchClass(target),
      previousMidi,
      interval: previousMidi === null ? null : target - previousMidi,
      guesses: [],
      responseMs: null,
    };
    exercise.attempts.push(attempt);
  }

  const isCorrect = isCorrectMidi(target, midi);
  const wasAlreadySolved = attempt.guesses.some((guess) =>
    isCorrectMidi(target, guess.midi),
  );
  if (!isCorrect || !wasAlreadySolved) {
    attempt.guesses.push({
      midi,
      pitchClass: pitchClass(midi),
      correct: isCorrect,
      at: new Date().toISOString(),
    });
  }

  if (!isCorrect) {
    key.classList.add("wrong-key");
    window.setTimeout(() => key.classList.remove("wrong-key"), 260);
    restartAfterMistake();
    return;
  }

  if (attempt.responseMs === null) {
    attempt.responseMs = Math.round(performance.now() - exercise.guessStartedAt);
  }
  key.classList.add("correct-key");
  window.setTimeout(() => key.classList.remove("correct-key"), 280);
  exercise.currentIndex += 1;

  if (exercise.currentIndex >= exercise.notes.length) {
    finishExercise();
    return;
  }

  exercise.guessStartedAt = performance.now();
  elements.feedback.className = "feedback success";
  elements.feedback.textContent = `Juste. Note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
}

function finishExercise() {
  acceptingInput = false;
  exercise.completedAt = new Date().toISOString();
  records.push({
    id: exercise.id,
    startedAt: exercise.startedAt,
    completedAt: exercise.completedAt,
    mode: exercise.mode,
    label: exercise.label,
    source: exercise.source,
    tempo: exercise.tempo,
    speedPercent: exercise.speedPercent,
    originalTempo: exercise.originalTempo,
    notes: exercise.notes,
    playbackRatePercent: exercise.playbackRatePercent,
    replayCount: exercise.replayCount,
    attempts: exercise.attempts,
  });
  writeJson(STORAGE_KEY, records);
  renderStats();
  elements.feedback.className = "feedback success";
  const perfect = exercise.attempts.every((attempt) => attempt.guesses.length === 1);
  elements.feedback.textContent = perfect
    ? "Phrase terminée — sans erreur !"
    : "Phrase terminée. Les erreurs ont été enregistrées.";
  scheduleCompletionModal();
}

function renderStats() {
  const summary = summarizeRecords(records);
  elements.stats.exercises.textContent = String(summary.exercises);
  elements.stats.notes.textContent = String(summary.notes);
  elements.stats.accuracy.textContent =
    summary.accuracy === null ? "—" : `${Math.round(summary.accuracy * 100)} %`;
  elements.stats.response.textContent =
    summary.averageResponseMs === null ? "—" : `${(summary.averageResponseMs / 1000).toFixed(1)} s`;

  if (!summary.weakIntervals.length) {
    elements.stats.weaknesses.textContent = "Pas encore assez de données.";
    return;
  }
  elements.stats.weaknesses.textContent = summary.weakIntervals
    .map(
      (item) =>
        `${item.label} : ${Math.round(item.accuracy * 100)} % (${item.total} essais)`,
    )
    .join(" · ");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = {
    app: "Dictée musicale",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records,
  };
  download(
    `dictee-musicale-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv() {
  const rows = [
    [
      "exercise_id",
      "date",
      "mode",
      "phrase",
      "source",
      "source_url",
      "mesure_debut",
      "mesure_fin",
      "transposition_demi_tons",
      "vitesse_aleatoire_pourcent",
      "vitesse_parker_pourcent",
      "tempo_original",
      "position",
      "note_precedente_midi",
      "note_cible",
      "intervalle_demi_tons",
      "intervalle",
      "nombre_essais",
      "premier_coup",
      "temps_reponse_ms",
      "reecoutes",
    ],
  ];

  for (const record of records.filter((item) => item.completedAt)) {
    for (const attempt of record.attempts ?? []) {
      rows.push([
        record.id,
        record.completedAt,
        record.mode,
        record.label,
        record.source?.label,
        record.source?.url,
        record.source?.barStart,
        record.source?.barEnd,
        record.source?.transposition,
        record.mode === "random" ? (record.speedPercent ?? record.tempo) : null,
        record.mode === "parker" ? record.speedPercent : null,
        record.originalTempo,
        attempt.position + 1,
        attempt.previousMidi,
        NOTE_NAMES[attempt.targetPitchClass],
        attempt.interval,
        intervalLabel(attempt.interval),
        attempt.guesses.length,
        attempt.guesses.length === 1,
        attempt.responseMs,
        record.replayCount,
      ]);
    }
  }

  download(
    `dictee-musicale-${new Date().toISOString().slice(0, 10)}.csv`,
    `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`,
    "text/csv;charset=utf-8",
  );
}

async function importJson(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.records)) {
      throw new Error("Format non reconnu");
    }
    const existingIds = new Set(records.map((record) => record.id));
    const incoming = payload.records.filter((record) => record.id && !existingIds.has(record.id));
    records = [...records, ...incoming];
    writeJson(STORAGE_KEY, records);
    renderStats();
    elements.feedback.className = "feedback success";
    elements.feedback.textContent = `${incoming.length} phrase(s) restaurée(s).`;
  } catch {
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Impossible de restaurer ce fichier.";
  } finally {
    event.target.value = "";
  }
}

function resetStats() {
  if (!window.confirm("Effacer définitivement toutes les statistiques sur cet appareil ?")) return;
  records = [];
  writeJson(STORAGE_KEY, records);
  renderStats();
}

function registerOfflineSupport() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js");
  }
}

function setUpInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });
  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

function updateGameModeButton() {
  const active = document.body.classList.contains("game-mode");
  elements.fullscreenButton.textContent = active ? "×" : "Plein écran";
  elements.fullscreenButton.setAttribute(
    "aria-label",
    active ? "Quitter le plein écran" : "Passer en plein écran",
  );
  elements.fullscreenButton.setAttribute("aria-pressed", String(active));
}

function activateGameLayout() {
  document.body.classList.add("game-mode");
  updateGameModeButton();
}

function deactivateGameLayout() {
  document.body.classList.remove("game-mode");
  updateGameModeButton();
}

async function enterGameMode() {
  activateGameLayout();

  try {
    if (
      !fullscreenDisplayMode.matches &&
      !document.fullscreenElement &&
      document.documentElement.requestFullscreen
    ) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    // Le mode de jeu CSS reste utilisable si le navigateur refuse le plein écran natif.
  }

  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // iOS et certains navigateurs imposent une rotation manuelle.
  }
}

async function leaveGameMode() {
  stopAllTones();
  hideCompletionModal();
  acceptingInput = false;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Le déverrouillage n’est pas exposé partout.
  }

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch {
    // La mise en page normale est restaurée même si la sortie native échoue.
  }

  deactivateGameLayout();
}

function toggleGameMode() {
  if (document.body.classList.contains("game-mode")) {
    leaveGameMode();
  } else {
    enterGameMode();
  }
}

function setUpGameMode() {
  updateGameModeButton();

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      activateGameLayout();
    } else {
      stopAllTones();
      hideCompletionModal();
      acceptingInput = false;
      deactivateGameLayout();
    }
  });
}

elements.gameLength.addEventListener("input", () =>
  syncLength(elements.gameLength.value),
);
elements.gameSpeed.addEventListener("input", () => syncGameSpeed(elements.gameSpeed.value));
elements.startParker.addEventListener("click", () => startMode("parker"));
elements.startRandom.addEventListener("click", () => startMode("random"));
elements.nextExercise.addEventListener("click", startExercise);
elements.replay.addEventListener("click", togglePlayback);
elements.playOriginal.addEventListener("click", toggleOriginalPlayback);
elements.transposeOriginal.addEventListener("change", saveSettings);
elements.completionOriginal.addEventListener("click", toggleCompletionOriginal);
elements.restartExercise.addEventListener("click", restartSameExercise);
elements.transposeExercise.addEventListener("click", transposeSameExercise);
elements.completionNext.addEventListener("click", startExercise);
elements.completionExit.addEventListener("click", leaveGameMode);
elements.exportJson.addEventListener("click", exportJson);
elements.exportCsv.addEventListener("click", exportCsv);
elements.importJson.addEventListener("change", importJson);
elements.resetStats.addEventListener("click", resetStats);
elements.fullscreenButton.addEventListener("click", toggleGameMode);
elements.exitPortraitMode.addEventListener("click", leaveGameMode);

loadSettings();
renderStats();
registerOfflineSupport();
setUpInstallPrompt();
setUpGameMode();
