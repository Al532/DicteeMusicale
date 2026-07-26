import {
  NOTE_NAMES,
  intervalLabel,
  isCorrectPitchClass,
  makeSequence,
  pitchClass,
  summarizeRecords,
} from "./engine.js";

const STORAGE_KEY = "dictee-musicale.records.v1";
const SETTINGS_KEY = "dictee-musicale.settings.v1";

const elements = {
  length: document.querySelector("#length"),
  lengthOutput: document.querySelector("#length-output"),
  tempo: document.querySelector("#tempo"),
  tempoOutput: document.querySelector("#tempo-output"),
  speed: document.querySelector("#speed"),
  speedOutput: document.querySelector("#speed-output"),
  lengthSetting: document.querySelector("#length-setting"),
  tempoSetting: document.querySelector("#tempo-setting"),
  speedSetting: document.querySelector("#speed-setting"),
  mode: document.querySelector("#mode"),
  newExercise: document.querySelector("#new-exercise"),
  replay: document.querySelector("#replay"),
  referenceNote: document.querySelector("#reference-note"),
  sequence: document.querySelector("#sequence"),
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
const fullscreenDisplayMode = window.matchMedia("(display-mode: fullscreen)");

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

function loadSettings() {
  const settings = readJson(SETTINGS_KEY, {});
  if (settings.length) elements.length.value = settings.length;
  if (settings.randomTempo ?? settings.tempo) {
    elements.tempo.value = settings.randomTempo ?? settings.tempo;
  }
  if (settings.parkerSpeed) elements.speed.value = settings.parkerSpeed;
  elements.mode.value =
    settings.mode === "parker" || settings.mode === "jazz" ? "parker" : "random";
  updateSettingLabels();
  updateModeSettings();
}

function saveSettings() {
  writeJson(SETTINGS_KEY, {
    length: Number(elements.length.value),
    randomTempo: Number(elements.tempo.value),
    parkerSpeed: Number(elements.speed.value),
    mode: elements.mode.value,
  });
}

function updateSettingLabels() {
  elements.lengthOutput.value = `${elements.length.value} notes`;
  elements.tempoOutput.value = `${elements.tempo.value} BPM`;
  elements.speedOutput.value = `${elements.speed.value} %`;
}

function updateModeSettings() {
  const isParker = elements.mode.value === "parker";
  elements.lengthSetting.hidden = isParker;
  elements.tempoSetting.hidden = isParker;
  elements.speedSetting.hidden = !isParker;
}

function buildPiano() {
  const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
  const whiteMidi = [];
  for (let midi = 48; midi <= 71; midi += 1) {
    if (!blackPitchClasses.has(pitchClass(midi))) whiteMidi.push(midi);
  }

  for (const [whiteIndex, midi] of whiteMidi.entries()) {
    const key = createKey(midi, "white");
    key.style.left = `${(whiteIndex * 100) / 14}%`;
    elements.piano.append(key);
  }

  const blackKeys = [
    [49, 1],
    [51, 2],
    [54, 4],
    [56, 5],
    [58, 6],
    [61, 8],
    [63, 9],
    [66, 11],
    [68, 12],
    [70, 13],
  ];
  for (const [midi, whiteBoundary] of blackKeys) {
    const key = createKey(midi, "black");
    key.style.left = `calc(${(whiteBoundary * 100) / 14}% - (100% / 14 * 0.31))`;
    elements.piano.append(key);
  }
}

function createKey(midi, color) {
  const key = document.createElement("button");
  const octave = Math.floor(midi / 12) - 1;
  key.type = "button";
  key.className = `key ${color}`;
  key.dataset.midi = String(midi);
  key.setAttribute("aria-label", `${NOTE_NAMES[pitchClass(midi)]} ${octave}`);
  if (color === "white") {
    const label = document.createElement("span");
    label.textContent = NOTE_NAMES[pitchClass(midi)];
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
  const release = Math.max(attack + 0.001, safeDuration * 0.72);

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
  oscillator.start(start);
  overtone.start(start);
  oscillator.stop(stop + 0.02);
  overtone.stop(stop + 0.02);
}

function flashPlayedKey(midi, delayMs, durationMs) {
  const key = elements.piano.querySelector(`[data-midi="${midi}"]`);
  if (!key) return;
  window.setTimeout(() => key.classList.add("active"), delayMs);
  window.setTimeout(() => key.classList.remove("active"), delayMs + durationMs);
}

function playSequence() {
  if (!exercise) return;
  acceptingInput = false;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Écoute…";
  let playbackDuration;
  if (exercise.timings) {
    exercise.speedPercent = Number(elements.speed.value);
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
    const lastTiming = exercise.timings.at(-1);
    playbackDuration = (lastTiming.offset + lastTiming.duration) * timeScale * 1000;
  } else {
    exercise.tempo = Number(elements.tempo.value);
    const beatMs = 60_000 / exercise.tempo;
    const toneDuration = Math.min(0.62, (beatMs / 1000) * 0.8);
    exercise.notes.forEach((midi, index) => {
      const delayMs = index * beatMs;
      playTone(midi, delayMs / 1000, toneDuration, index === 0);
      if (index === 0) {
        flashPlayedKey(midi, delayMs, toneDuration * 1000);
      }
    });
    playbackDuration = exercise.notes.length * beatMs;
  }

  window.setTimeout(() => {
    acceptingInput = exercise.currentIndex < exercise.notes.length;
    exercise.guessStartedAt = performance.now();
    elements.feedback.textContent = "À toi : joue la deuxième note.";
  }, playbackDuration);
}

function renderSequence() {
  elements.sequence.replaceChildren();
  if (!exercise) return;

  exercise.notes.forEach((midi, index) => {
    const slot = document.createElement("li");
    if (index === 0) {
      slot.textContent = NOTE_NAMES[pitchClass(midi)];
      slot.className = "reference";
    } else if (index < exercise.currentIndex) {
      slot.textContent = NOTE_NAMES[pitchClass(midi)];
      slot.className = "solved";
    } else {
      slot.textContent = "•";
      if (index === exercise.currentIndex) slot.className = "current";
    }
    elements.sequence.append(slot);
  });
}

function markReferenceKey() {
  elements.piano.querySelectorAll(".reference-key").forEach((key) => {
    key.classList.remove("reference-key");
  });
  if (!exercise) return;
  const key = elements.piano.querySelector(`[data-midi="${exercise.notes[0]}"]`);
  key?.classList.add("reference-key");
}

function startExercise() {
  saveSettings();
  const generated = makeSequence({
    length: Number(elements.length.value),
    mode: elements.mode.value,
  });
  exercise = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    mode: elements.mode.value,
    label: generated.meta.label,
    source: generated.meta.source,
    tempo: generated.timings ? null : Number(elements.tempo.value),
    speedPercent: generated.timings ? Number(elements.speed.value) : null,
    originalTempo: generated.meta.originalTempo ?? Number(elements.tempo.value),
    notes: generated.notes,
    timings: generated.timings ?? null,
    currentIndex: 1,
    attempts: [],
    replayCount: 0,
    guessStartedAt: null,
  };

  elements.kicker.textContent = generated.meta.label;
  renderSource(generated.meta.source);
  elements.replay.disabled = false;
  elements.referenceNote.disabled = false;
  renderSequence();
  markReferenceKey();
  playSequence();
}

function renderSource(source) {
  elements.sourceLine.hidden = false;
  const transposition =
    Number.isFinite(source.transposition) && source.transposition !== 0
      ? ` · transposition ${source.transposition > 0 ? "+" : ""}${source.transposition} demi-tons`
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
}

function replaySequence() {
  if (!exercise) return;
  exercise.replayCount += 1;
  playSequence();
}

function playReference() {
  if (!exercise) return;
  playTone(exercise.notes[0], 0, 0.62, true);
  flashPlayedKey(exercise.notes[0], 0, 600);
}

function handlePianoInput(midi, key) {
  playTone(midi, 0, 0.36);
  key.classList.add("active");
  window.setTimeout(() => key.classList.remove("active"), 160);
  if (!exercise || !acceptingInput) return;

  const target = exercise.notes[exercise.currentIndex];
  let attempt = exercise.attempts.find((item) => item.position === exercise.currentIndex);
  if (!attempt) {
    attempt = {
      position: exercise.currentIndex,
      targetMidi: target,
      targetPitchClass: pitchClass(target),
      previousMidi: exercise.notes[exercise.currentIndex - 1],
      interval: target - exercise.notes[exercise.currentIndex - 1],
      guesses: [],
      responseMs: null,
    };
    exercise.attempts.push(attempt);
  }

  attempt.guesses.push({
    midi,
    pitchClass: pitchClass(midi),
    at: new Date().toISOString(),
  });

  if (!isCorrectPitchClass(target, midi)) {
    key.classList.add("wrong-key");
    window.setTimeout(() => key.classList.remove("wrong-key"), 260);
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Pas cette note — réessaie.";
    return;
  }

  attempt.responseMs = Math.round(performance.now() - exercise.guessStartedAt);
  key.classList.add("correct-key");
  window.setTimeout(() => key.classList.remove("correct-key"), 280);
  exercise.currentIndex += 1;
  renderSequence();

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
      "tempo_lecture",
      "vitesse_pourcent",
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
        record.tempo,
        record.speedPercent,
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
  elements.fullscreenButton.textContent = active ? "Quitter" : "Plein écran";
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
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
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
  if (fullscreenDisplayMode.matches) activateGameLayout();
  else updateGameModeButton();

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      activateGameLayout();
    } else if (!fullscreenDisplayMode.matches) {
      deactivateGameLayout();
    }
  });

  fullscreenDisplayMode.addEventListener?.("change", (event) => {
    if (event.matches) activateGameLayout();
  });
}

elements.length.addEventListener("input", updateSettingLabels);
elements.tempo.addEventListener("input", updateSettingLabels);
elements.speed.addEventListener("input", updateSettingLabels);
elements.mode.addEventListener("change", updateModeSettings);
elements.newExercise.addEventListener("click", startExercise);
elements.replay.addEventListener("click", replaySequence);
elements.referenceNote.addEventListener("click", playReference);
elements.exportJson.addEventListener("click", exportJson);
elements.exportCsv.addEventListener("click", exportCsv);
elements.importJson.addEventListener("change", importJson);
elements.resetStats.addEventListener("click", resetStats);
elements.fullscreenButton.addEventListener("click", toggleGameMode);
elements.exitPortraitMode.addEventListener("click", leaveGameMode);

loadSettings();
buildPiano();
renderStats();
registerOfflineSupport();
setUpInstallPrompt();
setUpGameMode();
