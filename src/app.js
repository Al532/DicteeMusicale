import {
  DEFAULT_PERFORMERS,
  NOTE_NAMES,
  WJAZZD_PERFORMERS,
  isCorrectMidi,
  jazzPhraseCatalog,
  makeJazzTranspositionCycle,
  keyboardLayoutForNotes,
  makeSequence,
  pitchClass,
  voiceBassHits,
} from "./engine.js";
import { pitchShiftAudioBuffer, sliceAudioBuffer } from "./audio.js";
import {
  advanceTraining,
  beginSuddenDeath,
  createChallengeSession,
  currentChallengePhrase,
  drawNextTransposition,
  isResumableChallengeSession,
  resolveSuddenDeath,
  selectChallengePhrases,
} from "./session.js";
import {
  RATING_PROTOCOL_VERSION,
  RATING_REPORT_INTERVAL,
  mergePhraseRatings,
  mergeRatingScopes,
  pickRatingPhrase,
  ratingProtocolSummary,
} from "./ratings.js";
import {
  DEFAULT_PHRASE_RATINGS,
  DEFAULT_RATING_SCOPES,
} from "../data/default-ratings.js";

const SETTINGS_KEY = "dictee-musicale.settings.v1";
const RATINGS_KEY = "dictee-musicale.ratings.v1";
const RATING_SCOPES_KEY = "dictee-musicale.rating-scopes.v1";
const CHALLENGE_SESSION_KEY = "dictee-musicale.challenge-session.v1";
const COMPLETED_PHRASES_KEY = "dictee-musicale.completed-phrases.v1";
const FAVORITES_KEY = "dictee-musicale.favorites.v1";
const REAL_MAX_NOTES = 20;
const RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE = 100;
const LEGATO_RELEASE_SECONDS = 0.035;
const WRONG_NOTE_REPLAY_DELAY_MS = 650;
const ROUND_ADVANCE_DELAY_MS = 720;
const RANDOM_SLIDER_MIN = 25;
const RANDOM_SLIDER_MAX = 100;
const RANDOM_PLAYBACK_MIN_PERCENT = 50;
const RANDOM_PLAYBACK_MAX_PERCENT = 640;
const ORIGINAL_TAIL_SECONDS = 0.25;
const COMPLETION_MODAL_DELAY_MS = 350;
const GAME_MODE_START_DELAY_MS = 900;
const QUICK_RATING_ADVANCE_DELAY_MS = 180;
const INPUT_BURST_QUIET_MS = 500;
const MELODY_SAMPLE_INSTRUMENTS = {
  clarinet: {
    label: "clarinette",
    minMidi: 50,
    maxMidi: 92,
    headSeconds: 0.025,
  },
  piano: {
    label: "piano",
    minMidi: 36,
    maxMidi: 96,
    headSeconds: 0,
  },
};
const MELODY_GAIN = 0.8;
const MELODY_EMPHASIS_GAIN = 0.96;
const MELODY_ATTACK_SECONDS = 0.006;
const MELODY_RELEASE_SECONDS = 0.035;
const BASS_GAIN = 0.3;
const BASS_ATTACK_SECONDS = 0.005;
const BASS_RELEASE_SECONDS = 0.075;

const elements = {
  homePanel: document.querySelector("#home-panel"),
  favoritesPanel: document.querySelector("#favorites-panel"),
  startChallenge: document.querySelector("#start-challenge"),
  resumeChallenge: document.querySelector("#resume-challenge"),
  newChallenge: document.querySelector("#new-challenge"),
  sessionStatus: document.querySelector("#session-status"),
  openFavorites: document.querySelector("#open-favorites"),
  closeFavorites: document.querySelector("#close-favorites"),
  favoritesList: document.querySelector("#favorites-list"),
  favoritesEmpty: document.querySelector("#favorites-empty"),
  favoriteToggle: document.querySelector("#favorite-toggle"),
  freeTranspose: document.querySelector("#free-transpose"),
  challengeProgress: document.querySelector("#challenge-progress"),
  progressTitle: document.querySelector("#progress-title"),
  progressDetail: document.querySelector("#progress-detail"),
  progressDots: document.querySelector("#progress-dots"),
  sourceSummary: document.querySelector("#source-summary"),
  suddenDeathModal: document.querySelector("#sudden-death-modal"),
  startSuddenDeath: document.querySelector("#start-sudden-death"),
  challengeCompleteModal: document.querySelector("#challenge-complete-modal"),
  completedPhrases: document.querySelector("#completed-phrases"),
  finishNewChallenge: document.querySelector("#finish-new-challenge"),
  finishHome: document.querySelector("#finish-home"),
  gameLength: document.querySelector("#game-length"),
  gameLengthLabel: document.querySelector("#game-length-label"),
  gameLengthOutput: document.querySelector("#game-length-output"),
  gameSpeed: document.querySelector("#game-speed"),
  gameSpeedOutput: document.querySelector("#game-speed-output"),
  gameSpeedSetting: document.querySelector("#game-speed-setting"),
  startReal: document.querySelector("#start-real"),
  startRandom: document.querySelector("#start-random"),
  startRating: document.querySelector("#start-rating"),
  musicianPicker: document.querySelector("#musician-picker"),
  musicianList: document.querySelector("#musician-list"),
  musicianSelectionCount: document.querySelector("#musician-selection-count"),
  selectionWarning: document.querySelector("#selection-warning"),
  selectDefaultPerformers: document.querySelector("#select-default-performers"),
  selectAllPerformers: document.querySelector("#select-all-performers"),
  clearPerformers: document.querySelector("#clear-performers"),
  minimumRating: document.querySelector("#minimum-rating"),
  developerMode: document.querySelector("#developer-mode"),
  developerOnly: document.querySelectorAll("[data-developer-only]"),
  ratingHomeSummary: document.querySelector("#rating-home-summary"),
  ratingWorkspace: document.querySelector("#rating-workspace"),
  ratingSessionSummary: document.querySelector("#rating-session-summary"),
  ratingCoverageSummary: document.querySelector("#rating-coverage-summary"),
  undoRating: document.querySelector("#undo-rating"),
  quickRatingButtons: document.querySelectorAll("[data-quick-rating]"),
  nextExercise: document.querySelector("#next-exercise"),
  replay: document.querySelector("#replay"),
  feedback: document.querySelector("#feedback"),
  kicker: document.querySelector("#exercise-kicker"),
  exerciseTitle: document.querySelector("#exercise-title"),
  piano: document.querySelector("#piano"),
  exportRatings: document.querySelector("#export-ratings"),
  installButton: document.querySelector("#install-button"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  exitPortraitMode: document.querySelector("#exit-portrait-mode"),
  sourceLine: document.querySelector("#source-line"),
  sourceDetails: document.querySelector("#source-details"),
  phraseReference: document.querySelector("#phrase-reference"),
  phraseId: document.querySelector("#phrase-id"),
  copyPhraseId: document.querySelector("#copy-phrase-id"),
  sourceLink: document.querySelector("#source-link"),
  audioSourceLink: document.querySelector("#audio-source-link"),
  originalControls: document.querySelector("#original-controls"),
  playOriginal: document.querySelector("#play-original"),
  transposeOriginal: document.querySelector("#transpose-original"),
  exerciseRating: document.querySelector("#exercise-rating"),
  completionModal: document.querySelector("#completion-modal"),
  completionRating: document.querySelector("#completion-rating"),
  completionOriginal: document.querySelector("#completion-original"),
  restartExercise: document.querySelector("#restart-exercise"),
  transposeExercise: document.querySelector("#transpose-exercise"),
  completionNext: document.querySelector("#completion-next"),
  completionExit: document.querySelector("#completion-exit"),
};

let audioContext;
let exercise = null;
let acceptingInput = false;
let deferredInstallPrompt = null;
let localPhraseRatings = readJson(RATINGS_KEY, {});
if (
  !localPhraseRatings ||
  typeof localPhraseRatings !== "object" ||
  Array.isArray(localPhraseRatings)
) {
  localPhraseRatings = {};
}
let phraseRatings = mergePhraseRatings(
  DEFAULT_PHRASE_RATINGS,
  localPhraseRatings,
);
let localRatingScopes = readJson(RATING_SCOPES_KEY, []);
if (!Array.isArray(localRatingScopes)) localRatingScopes = [];
let fixedRatingScopes = mergeRatingScopes(
  DEFAULT_RATING_SCOPES,
  localRatingScopes,
);
let currentMode = "challenge";
let randomLength = 5;
let realMaxNotes = REAL_MAX_NOTES;
let realSpeedPercent = 100;
let randomPlaybackSpeedPercent = 88;
let melodySound = "synthetic";
let minimumRating = 0;
let developerMode = false;
let selectedPerformers = new Set(DEFAULT_PERFORMERS);
let ratingSessionHistory = [];
let ratingSessionBaselineScopes = new Set();
let challengeSession = readJson(CHALLENGE_SESSION_KEY, null);
let completedPhraseKeys = readJson(COMPLETED_PHRASES_KEY, []);
let favoritePhraseKeys = readJson(FAVORITES_KEY, []);
if (!Array.isArray(completedPhraseKeys)) completedPhraseKeys = [];
if (!Array.isArray(favoritePhraseKeys)) favoritePhraseKeys = [];
let freePhraseKey = null;
let freeToneState = null;
let lastCompletedChallengePhrases = [];
const fullscreenDisplayMode = window.matchMedia("(display-mode: fullscreen)");
const activeAudioSources = new Set();
const decodedAudioBuffers = new Map();
const melodySampleBuffers = new Map();
const melodySampleLoads = new Map();
const bassSampleBuffers = new Map();
const bassSampleLoads = new Map();
let playbackTimer = null;
let restartTimer = null;
let completionTimer = null;
let gameModeStartTimer = null;
let quickRatingAdvanceTimer = null;
let roundAdvanceTimer = null;
let phraseIdCopyTimer = null;
let chickBuffer = null;
let isPlaying = false;
let isOriginalPlaying = false;
let originalPlaybackToken = 0;
let guardPlaybackFromInputBurst = false;
let lastPianoInputAt = Number.NEGATIVE_INFINITY;

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
  currentMode = "challenge";
  developerMode = Boolean(settings.developerMode);
  randomLength = clamp(
    Math.round(settings.randomLength ?? settings.length ?? 5),
    3,
    15,
  );
  realMaxNotes = clamp(
    Math.round(settings.realMaxNotes ?? settings.parkerMaxNotes ?? REAL_MAX_NOTES),
    5,
    REAL_MAX_NOTES,
  );
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
  realSpeedPercent = clamp(
    Number(settings.realSpeed ?? settings.parkerSpeed ?? 100),
    25,
    100,
  );
  melodySound = "synthetic";
  minimumRating =
    settings.minimumRating === "unrated"
      ? "unrated"
      : [2, 3].includes(Number(settings.minimumRating))
        ? Number(settings.minimumRating)
        : 0;
  const knownPerformers = new Set(
    WJAZZD_PERFORMERS.map(({ name }) => name),
  );
  const savedPerformers = Array.isArray(settings.selectedPerformers)
    ? settings.selectedPerformers.filter((name) => knownPerformers.has(name))
    : DEFAULT_PERFORMERS;
  selectedPerformers = new Set(savedPerformers);
  elements.minimumRating.value = String(minimumRating);
  elements.developerMode.checked = developerMode;
  elements.transposeOriginal.checked = Boolean(settings.transposeOriginal);
  renderDeveloperMode();
  updateModeSettings();
  renderPerformerOptions();
  updatePerformerSelectionState();
}

function saveSettings() {
  writeJson(SETTINGS_KEY, {
    randomLength,
    realMaxNotes,
    randomPlaybackPercent: randomPlaybackSpeedPercent,
    realSpeed: realSpeedPercent,
    minimumRating,
    developerMode,
    selectedPerformers: [...selectedPerformers],
    transposeOriginal: elements.transposeOriginal.checked,
  });
}

function activeMinimumRating() {
  return developerMode ? minimumRating : 3;
}

function currentRatingProtocol(selectedOnly = false) {
  return ratingProtocolSummary({
    phraseRatings,
    fixedScopes: fixedRatingScopes,
    selectedPerformers: selectedOnly ? [...selectedPerformers] : null,
  });
}

function renderProtocolHomeSummary() {
  const summary = currentRatingProtocol(true);
  const scopeCount =
    summary.tuneScopes.length + summary.performerScopes.length;
  elements.ratingHomeSummary.textContent =
    `${summary.explicit} notes directes · ` +
    `${summary.covered} sur ${summary.total} phrases couvertes` +
    (summary.structuralExcluded
      ? ` · ${summary.structuralExcluded} exclusions structurelles`
      : "") +
    (scopeCount
      ? ` · ${scopeCount} décision${scopeCount > 1 ? "s" : ""} globale${scopeCount > 1 ? "s" : ""}`
      : "");
}

function renderDeveloperMode() {
  document.body.classList.toggle("developer-mode", developerMode);
  for (const element of elements.developerOnly) {
    element.hidden = !developerMode;
  }
  elements.developerMode.checked = developerMode;
  renderProtocolHomeSummary();
}

async function setDeveloperMode(enabled) {
  developerMode = Boolean(enabled);
  if (!developerMode && currentMode === "rating") {
    currentMode = "jazz";
    await leaveGameMode();
  }
  renderDeveloperMode();
  renderRatingControls();
  saveSettings();
}

function updatePerformerSelectionState() {
  const selectedSoloCount = WJAZZD_PERFORMERS.reduce(
    (sum, { name, soloCount }) =>
      sum + (selectedPerformers.has(name) ? soloCount : 0),
    0,
  );
  elements.musicianSelectionCount.textContent =
    `${selectedPerformers.size} sur ${WJAZZD_PERFORMERS.length}` +
    ` · ${selectedSoloCount} solos`;
  const hasSelection = selectedPerformers.size > 0;
  elements.startReal.disabled = !hasSelection;
  elements.startRandom.disabled = false;
  elements.startRating.disabled = !hasSelection;
  elements.selectionWarning.hidden = hasSelection;
  renderProtocolHomeSummary();
}

function updatePerformerCheckboxes() {
  for (const input of elements.musicianList.querySelectorAll(
    'input[type="checkbox"]',
  )) {
    input.checked = selectedPerformers.has(input.value);
  }
}

function setPerformerSelection(names) {
  selectedPerformers = new Set(names);
  updatePerformerCheckboxes();
  updatePerformerSelectionState();
  saveSettings();
}

function renderPerformerOptions() {
  const performers = [...WJAZZD_PERFORMERS].sort((left, right) =>
    left.name.localeCompare(right.name, "fr"),
  );
  const fragment = document.createDocumentFragment();
  for (const { name, soloCount } of performers) {
    const label = document.createElement("label");
    label.className = "musician-option";
    label.title = `${name} — ${soloCount} solo${soloCount > 1 ? "s" : ""}`;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = selectedPerformers.has(name);
    input.addEventListener("change", () => {
      if (input.checked) selectedPerformers.add(name);
      else selectedPerformers.delete(name);
      updatePerformerSelectionState();
      saveSettings();
    });

    const musicianName = document.createElement("span");
    musicianName.textContent = name;
    const count = document.createElement("small");
    count.textContent = String(soloCount);
    label.append(input, musicianName, count);
    fragment.append(label);
  }
  elements.musicianList.replaceChildren(fragment);
}

function updateSettingLabels() {
  elements.gameLengthOutput.value = elements.gameLength.value;
  elements.gameSpeedOutput.value = `${Math.round(elements.gameSpeed.value)} %`;
}

function updateModeSettings() {
  const isReal = currentMode !== "random";
  elements.gameSpeedSetting.hidden = false;
  elements.gameLengthLabel.textContent = isReal ? "Notes max" : "Notes";
  elements.gameLength.min = isReal ? "5" : "3";
  elements.gameLength.max = isReal ? String(REAL_MAX_NOTES) : "15";
  elements.gameLength.value = isReal ? realMaxNotes : randomLength;
  if (isReal) {
    elements.gameSpeed.min = "25";
    elements.gameSpeed.max = "100";
    elements.gameSpeed.step = "5";
    elements.gameSpeed.value = realSpeedPercent;
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
  if (currentMode !== "random") realMaxNotes = numericValue;
  else randomLength = numericValue;
  elements.gameLength.value = value;
  updateSettingLabels();
  saveSettings();
}

function syncRealSpeed(value) {
  realSpeedPercent = Number(value);
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
  if (currentMode !== "random") syncRealSpeed(value);
  else syncRandomSpeed(value);
}

function syncMinimumRating(value) {
  minimumRating =
    value === "unrated"
      ? "unrated"
      : [2, 3].includes(Number(value))
        ? Number(value)
        : 0;
  elements.minimumRating.value = String(minimumRating);
  saveSettings();
}

function startMode(mode) {
  if ((mode === "jazz" || mode === "rating") && !selectedPerformers.size) {
    elements.selectionWarning.hidden = false;
    elements.musicianPicker.open = true;
    return;
  }
  if (mode === "rating" && !developerMode) return;
  if (mode === "rating") {
    ratingSessionHistory = [];
    ratingSessionBaselineScopes = new Set(
      currentRatingProtocol(true).scopes.map(
        (scope) => `${scope.scope}:${scope.scopeId}`,
      ),
    );
    renderRatingSession();
  }
  currentMode = mode;
  document.body.classList.remove(
    "challenge-mode",
    "free-mode",
    "sudden-death-mode",
  );
  elements.challengeProgress.hidden = true;
  elements.sourceSummary.hidden = true;
  elements.favoriteToggle.hidden = true;
  elements.freeTranspose.hidden = true;
  updateModeSettings();
  saveSettings();
  startExercise();
}

function effectivePhraseRatings() {
  return currentRatingProtocol(false).effectiveRatings;
}

function challengeCatalog() {
  return jazzPhraseCatalog({
    phraseRatings: effectivePhraseRatings(),
    minimumRating: 3,
  });
}

function allPhraseCatalog() {
  return jazzPhraseCatalog({
    phraseRatings: effectivePhraseRatings(),
    minimumRating: 0,
  });
}

function catalogMap(catalog = allPhraseCatalog()) {
  return new Map(catalog.map((phrase) => [phrase.phraseKey, phrase]));
}

function persistChallengeSession() {
  if (challengeSession?.phase === "complete" || !challengeSession) {
    localStorage.removeItem(CHALLENGE_SESSION_KEY);
    return;
  }
  writeJson(CHALLENGE_SESSION_KEY, challengeSession);
}

function normalizePersistedChallenge() {
  const catalog = challengeCatalog();
  if (
    !isResumableChallengeSession(
      challengeSession,
      catalog.map(({ phraseKey }) => phraseKey),
    )
  ) {
    challengeSession = null;
    localStorage.removeItem(CHALLENGE_SESSION_KEY);
  }
  return catalog;
}

function renderHomeState() {
  normalizePersistedChallenge();
  const hasSession = Boolean(challengeSession);
  elements.startChallenge.hidden = hasSession;
  elements.resumeChallenge.hidden = !hasSession;
  elements.newChallenge.hidden = !hasSession;
  if (!hasSession) {
    elements.sessionStatus.hidden = true;
    elements.sessionStatus.textContent = "";
    return;
  }

  elements.sessionStatus.hidden = false;
  if (challengeSession.phase === "training") {
    elements.sessionStatus.textContent =
      `Session en cours · phrase ${challengeSession.phraseIndex + 1} sur 3, ` +
      `ton ${challengeSession.toneIndex + 1} sur 3.`;
  } else if (challengeSession.phase === "transition") {
    elements.sessionStatus.textContent =
      "Les neuf manches sont terminées · mort subite à lancer.";
  } else {
    elements.sessionStatus.textContent =
      `Mort subite en cours · ${challengeSession.suddenQueue.length} ` +
      `phrase${challengeSession.suddenQueue.length > 1 ? "s" : ""} restante${challengeSession.suddenQueue.length > 1 ? "s" : ""}.`;
  }
}

function showHome() {
  document.body.classList.add("home-view");
  elements.homePanel.hidden = false;
  elements.favoritesPanel.hidden = true;
  renderHomeState();
}

function renderFavorites() {
  const phrasesByKey = catalogMap();
  const favorites = [...new Set(favoritePhraseKeys)]
    .map((phraseKey) => phrasesByKey.get(phraseKey))
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.performer.localeCompare(right.performer, "fr") ||
        left.title.localeCompare(right.title, "fr"),
    );

  elements.favoritesList.replaceChildren();
  elements.favoritesEmpty.hidden = favorites.length > 0;
  for (const phrase of favorites) {
    const row = document.createElement("article");
    row.className = "favorite-row";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "favorite-row-main";
    const performer = document.createElement("strong");
    performer.textContent = phrase.performer;
    const title = document.createElement("span");
    title.textContent = phrase.title;
    open.append(performer, title);
    open.addEventListener("click", () => startFreePhrase(phrase.phraseKey));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "favorite-row-remove";
    remove.textContent = "♥";
    remove.setAttribute(
      "aria-label",
      `Retirer ${phrase.performer}, ${phrase.title} des favoris`,
    );
    remove.addEventListener("click", () => {
      favoritePhraseKeys = favoritePhraseKeys.filter(
        (phraseKey) => phraseKey !== phrase.phraseKey,
      );
      writeJson(FAVORITES_KEY, favoritePhraseKeys);
      renderFavorites();
    });

    row.append(open, remove);
    elements.favoritesList.append(row);
  }
}

function showFavorites() {
  document.body.classList.remove("home-view");
  elements.homePanel.hidden = true;
  elements.favoritesPanel.hidden = false;
  renderFavorites();
}

function isFavorite(phraseKey) {
  return Boolean(phraseKey && favoritePhraseKeys.includes(phraseKey));
}

function renderFavoriteButton() {
  const phraseKey = exercise?.source?.phraseKey;
  const favorite = isFavorite(phraseKey);
  elements.favoriteToggle.hidden = !phraseKey || currentMode === "rating";
  elements.favoriteToggle.classList.toggle("active", favorite);
  elements.favoriteToggle.textContent = favorite ? "♥" : "♡";
  elements.favoriteToggle.setAttribute("aria-pressed", String(favorite));
  elements.favoriteToggle.setAttribute(
    "aria-label",
    favorite ? "Retirer des favoris" : "Ajouter aux favoris",
  );
}

function toggleCurrentFavorite() {
  const phraseKey = exercise?.source?.phraseKey;
  if (!phraseKey) return;
  if (isFavorite(phraseKey)) {
    favoritePhraseKeys = favoritePhraseKeys.filter(
      (favoriteKey) => favoriteKey !== phraseKey,
    );
  } else {
    favoritePhraseKeys = [...favoritePhraseKeys, phraseKey];
  }
  writeJson(FAVORITES_KEY, favoritePhraseKeys);
  renderFavoriteButton();
}

function currentTrainingRoundIndex() {
  if (!challengeSession || challengeSession.phase !== "training") return 0;
  return challengeSession.phraseIndex * 3 + challengeSession.toneIndex;
}

function renderProgressDots(total, completed, current = null) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < total; index += 1) {
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    if (index < completed) dot.classList.add("complete");
    if (index === current) dot.classList.add("current");
    fragment.append(dot);
  }
  elements.progressDots.replaceChildren(fragment);
}

function renderChallengeProgress() {
  elements.challengeProgress.hidden = false;
  document.body.classList.toggle(
    "sudden-death-mode",
    challengeSession?.phase === "sudden-death",
  );
  if (challengeSession?.phase === "training") {
    elements.progressTitle.textContent =
      `Phrase ${challengeSession.phraseIndex + 1} sur 3`;
    elements.progressDetail.textContent =
      `Ton ${challengeSession.toneIndex + 1} sur 3`;
    const current = currentTrainingRoundIndex();
    renderProgressDots(9, current, current);
    return;
  }
  if (challengeSession?.phase === "sudden-death") {
    const remaining = challengeSession.suddenQueue.length;
    elements.progressTitle.textContent = "Mort subite";
    elements.progressDetail.textContent =
      `${remaining} phrase${remaining > 1 ? "s" : ""} à valider`;
    renderProgressDots(
      3,
      challengeSession.suddenCompleted.length,
      Math.min(challengeSession.suddenCompleted.length, 2),
    );
  }
}

function showSuddenDeathTransition() {
  stopAllTones();
  acceptingInput = false;
  exercise = null;
  renderChallengeProgress();
  elements.suddenDeathModal.hidden = false;
  window.requestAnimationFrame(() => elements.startSuddenDeath.focus());
}

function createToneState() {
  return {
    remainingTranspositions: [],
    lastTransposition: null,
    transpositionsUsed: [],
    cycleNumber: 0,
  };
}

async function startNewChallenge() {
  elements.challengeCompleteModal.hidden = true;
  elements.suddenDeathModal.hidden = true;
  const catalog = challengeCatalog();
  const selection = selectChallengePhrases({
    catalog,
    completedPhraseKeys,
  });
  if (selection.resetPhraseKeys.length) {
    const resetKeys = new Set(selection.resetPhraseKeys);
    completedPhraseKeys = completedPhraseKeys.filter(
      (phraseKey) => !resetKeys.has(phraseKey),
    );
    writeJson(COMPLETED_PHRASES_KEY, completedPhraseKeys);
  }
  challengeSession = createChallengeSession(selection.phrases);
  persistChallengeSession();
  currentMode = "challenge";
  await loadChallengeRound();
}

async function resumeChallenge() {
  normalizePersistedChallenge();
  if (!challengeSession) {
    await startNewChallenge();
    return;
  }
  currentMode = "challenge";
  if (challengeSession.phase === "transition") {
    const enteringGameMode =
      !document.body.classList.contains("game-mode");
    document.body.classList.add("challenge-mode");
    if (enteringGameMode) await enterGameMode();
    showSuddenDeathTransition();
    return;
  }
  await loadChallengeRound();
}

async function startFreePhrase(phraseKey) {
  freePhraseKey = phraseKey;
  freeToneState = createToneState();
  currentMode = "free";
  const transposition = drawNextTransposition(freeToneState);
  await loadPublicPhrase({ phraseKey, transposition });
}

async function transposeFreePhrase() {
  if (!freePhraseKey || !freeToneState) return;
  const transposition = drawNextTransposition(freeToneState);
  await loadPublicPhrase({
    phraseKey: freePhraseKey,
    transposition,
  });
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

function loadMelodySample(midi, sound = melodySound) {
  const instrument = MELODY_SAMPLE_INSTRUMENTS[sound];
  const sampleMidi = melodySampleMidi(midi, sound);
  const sampleKey = `${sound}:${sampleMidi}`;
  if (melodySampleBuffers.has(sampleKey)) {
    return Promise.resolve(melodySampleBuffers.get(sampleKey));
  }
  if (!melodySampleLoads.has(sampleKey)) {
    const path = `audio/${sound}/${sampleMidi}.mp3`;
    const loading = fetch(new URL(path, document.baseURI))
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Sample de ${instrument.label} indisponible (${response.status})`,
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

async function preloadMelodySamples(notes) {
  const sound = melodySound;
  if (!Object.hasOwn(MELODY_SAMPLE_INSTRUMENTS, sound)) return;
  const midiNotes = [
    ...new Set(notes.map((midi) => melodySampleMidi(midi, sound))),
  ];
  await Promise.all(midiNotes.map((midi) => loadMelodySample(midi, sound)));
}

function keyboardMidiNotes(keyboard) {
  return Array.from(
    { length: keyboard.endMidi - keyboard.startMidi + 1 },
    (_, index) => keyboard.startMidi + index,
  );
}

function playSyntheticTone(midi, startAt, duration, emphasis) {
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

function playTone(midi, startAt = 0, duration = 0.48, emphasis = false) {
  if (melodySound === "synthetic") {
    playSyntheticTone(midi, startAt, duration, emphasis);
    return;
  }
  const sound = melodySound;
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
  const availableDuration = (buffer.duration - sampleOffset) / playbackRate;
  const safeDuration = Math.max(
    0.012,
    Math.min(duration, availableDuration),
  );
  const stop = start + safeDuration;
  const attack = Math.min(MELODY_ATTACK_SECONDS, safeDuration * 0.25);
  const release = Math.max(
    start + attack + 0.001,
    stop - Math.min(MELODY_RELEASE_SECONDS, safeDuration * 0.2),
  );
  const volume = emphasis ? MELODY_EMPHASIS_GAIN : MELODY_GAIN;

  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.setValueAtTime(volume, release);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  source.connect(gain).connect(context.destination);
  activeAudioSources.add(source);
  source.addEventListener("ended", () => activeAudioSources.delete(source));
  source.start(start, sampleOffset);
  source.stop(stop + 0.02);
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
  gain.gain.setValueAtTime(0.055, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  source.connect(filter).connect(gain).connect(context.destination);
  activeAudioSources.add(source);
  source.addEventListener("ended", () => activeAudioSources.delete(source));
  source.start(start);
  source.stop(stop);
}

function loadBassSample(midi) {
  if (bassSampleBuffers.has(midi)) {
    return Promise.resolve(bassSampleBuffers.get(midi));
  }
  if (!bassSampleLoads.has(midi)) {
    const path = `audio/bass/${midi}.mp3`;
    const loading = fetch(new URL(path, document.baseURI))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Sample de basse indisponible (${response.status})`);
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
  const safeDuration = Math.max(0.04, Math.min(duration, buffer.duration));
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
  activeAudioSources.add(source);
  source.addEventListener("ended", () => activeAudioSources.delete(source));
  source.start(start);
  source.stop(stop + 0.02);
}

function setPlaybackState(playing) {
  isPlaying = playing;
  elements.replay.textContent = playing ? "Stop" : "Réécouter";
  elements.replay.setAttribute("aria-pressed", String(playing));
}

function setOriginalPlaybackState(playing) {
  isOriginalPlaying = playing;
  elements.playOriginal.textContent = playing ? "Stop" : "Écouter l’original";
  elements.playOriginal.setAttribute("aria-pressed", String(playing));
  elements.completionOriginal.textContent = playing ? "Stop" : "Écouter l’original";
  elements.completionOriginal.setAttribute("aria-pressed", String(playing));
}

function stopAllTones() {
  originalPlaybackToken += 1;
  guardPlaybackFromInputBurst = false;
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
  if (quickRatingAdvanceTimer !== null) {
    window.clearTimeout(quickRatingAdvanceTimer);
    quickRatingAdvanceTimer = null;
  }
  if (roundAdvanceTimer !== null) {
    window.clearTimeout(roundAdvanceTimer);
    roundAdvanceTimer = null;
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
  if (currentMode === "rating") {
    acceptingInput = false;
    setQuickRatingEnabled(true);
    elements.feedback.className = "feedback";
    elements.feedback.textContent =
      message ?? "Attribue 1, 2 ou 3 étoiles — touches 1, 2 ou 3.";
    return;
  }
  acceptingInput = exercise.currentIndex < exercise.notes.length;
  if (!acceptingInput) return;
  exercise.guessStartedAt = performance.now();
  elements.feedback.className = "feedback";
  if (message) {
    elements.feedback.textContent = message;
  } else if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
  ) {
    elements.feedback.textContent =
      "Réécoute si nécessaire. Ta première note lancera l’unique tentative.";
  } else {
    elements.feedback.textContent =
      `À toi — retrouve la note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
  }
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

function playSequence({ guardInputBurst = false } = {}) {
  if (!exercise) return;
  stopAllTones();
  guardPlaybackFromInputBurst = guardInputBurst;
  setPlaybackState(true);
  elements.replay.disabled = false;
  if (currentMode === "rating") setQuickRatingEnabled(true);
  acceptingInput = false;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Écoute bien…";
  let playbackDuration;
  if (exercise.timings) {
    exercise.speedPercent = realSpeedPercent;
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
    for (const bassHit of exercise.bassHits ?? []) {
      playBass(
        bassHit.midi,
        bassHit.offset * timeScale,
        bassHit.duration * timeScale,
      );
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
    if (currentMode === "rating") {
      restoreExerciseInput();
      return;
    }
    acceptingInput = exercise.currentIndex < exercise.notes.length;
    exercise.guessStartedAt = performance.now();
    if (
      currentMode === "challenge" &&
      challengeSession?.phase === "sudden-death"
    ) {
      elements.feedback.textContent =
        "Réécoute si nécessaire. Ta première note lancera l’unique tentative.";
    } else {
      elements.feedback.textContent =
        `À toi — retrouve la note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
    }
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

function refreshRatingsFromLocal() {
  phraseRatings = mergePhraseRatings(
    DEFAULT_PHRASE_RATINGS,
    localPhraseRatings,
  );
  fixedRatingScopes = mergeRatingScopes(
    DEFAULT_RATING_SCOPES,
    localRatingScopes,
  );
}

function setQuickRatingEnabled(enabled) {
  for (const button of elements.quickRatingButtons) {
    button.disabled = !enabled;
  }
}

function renderRatingSession() {
  const sessionCount = ratingSessionHistory.length;
  const distribution = { 1: 0, 2: 0, 3: 0 };
  for (const item of ratingSessionHistory) distribution[item.rating] += 1;
  const summary = currentRatingProtocol(true);
  const newScopes = summary.scopes.filter(
    (scope) =>
      !ratingSessionBaselineScopes.has(`${scope.scope}:${scope.scopeId}`),
  );

  elements.ratingSessionSummary.textContent =
    `${sessionCount} phrase${sessionCount > 1 ? "s" : ""} notée${sessionCount > 1 ? "s" : ""}` +
    (sessionCount
      ? ` · ${distribution[1]} / ${distribution[2]} / ${distribution[3]} en 1★ / 2★ / 3★`
      : " dans cette session");
  elements.ratingCoverageSummary.textContent =
    `${summary.covered} sur ${summary.total} phrases couvertes` +
    ` (${summary.total ? Math.round((summary.covered / summary.total) * 100) : 0} %)` +
    (summary.structuralExcluded
      ? ` · ${summary.structuralExcluded} exclusions structurelles`
      : "") +
    (newScopes.length
      ? ` · ${newScopes.length} nouvelle${newScopes.length > 1 ? "s" : ""} décision${newScopes.length > 1 ? "s" : ""} globale${newScopes.length > 1 ? "s" : ""}`
      : "");
  elements.undoRating.disabled = !sessionCount;
  renderProtocolHomeSummary();
}

function currentPhraseRating() {
  const phraseKey = exercise?.source?.phraseKey;
  if (!phraseKey) return 0;
  const stored = phraseRatings[phraseKey];
  const storedRating = Number(
    stored && typeof stored === "object" ? stored.rating : stored,
  );
  const sourceRating = Number(exercise.source.rating);
  return Number.isFinite(storedRating)
    ? storedRating
    : Number.isFinite(sourceRating)
      ? sourceRating
      : 0;
}

function renderStarRating(element, rating) {
  const isRealPhrase = Boolean(exercise?.source?.phraseKey);
  element.hidden =
    !developerMode || currentMode === "rating" || !isRealPhrase;
  element.setAttribute(
    "aria-label",
    rating
      ? `Note actuelle : ${rating} étoile${rating > 1 ? "s" : ""}`
      : "Phrase non notée",
  );
  for (const button of element.querySelectorAll("[data-rating]")) {
    const value = Number(button.dataset.rating);
    button.classList.toggle("selected", value <= rating);
    button.setAttribute("aria-pressed", String(value === rating));
  }
}

function renderRatingControls() {
  const rating = currentPhraseRating();
  renderStarRating(elements.exerciseRating, rating);
  renderStarRating(elements.completionRating, rating);
}

function setPhraseRating(
  rating,
  { automatic = false, origin = automatic ? "automatic" : "manual" } = {},
) {
  if (!developerMode) return false;
  const source = exercise?.source;
  if (!source?.phraseKey) return false;
  const safeRating = clamp(Math.round(Number(rating) || 0), 1, 3);
  const existingRating = currentPhraseRating();
  if (automatic && existingRating >= safeRating) return false;
  localPhraseRatings[source.phraseKey] = {
    rating: safeRating,
    updatedAt: new Date().toISOString(),
    soloId: source.soloId,
    performer: source.performer,
    title: source.title,
    phrase: source.phrase,
    sourceUrl: source.url,
    origin,
  };
  refreshRatingsFromLocal();
  exercise.source = {
    ...source,
    rating: safeRating,
    ratingScope: "phrase",
  };
  writeJson(RATINGS_KEY, localPhraseRatings);
  renderRatingControls();
  renderRatingSession();
  return true;
}

function setRatingFromButton(event) {
  const rating = Number(event.currentTarget.dataset.rating);
  setPhraseRating(rating);
}

function setQuickRating(event) {
  if (
    currentMode !== "rating" ||
    !developerMode ||
    !exercise
  ) {
    return;
  }
  const rating = Number(event.currentTarget?.dataset.quickRating ?? event);
  if (![1, 2, 3].includes(rating)) return;
  const source = exercise.source;
  const previousLocal = localPhraseRatings[source.phraseKey] ?? null;
  stopAllTones();
  if (!setPhraseRating(rating, { origin: "protocol" })) return;
  ratingSessionHistory.push({
    phraseKey: source.phraseKey,
    performer: source.performer,
    title: source.title,
    phrase: source.phrase,
    rating,
    previousLocal,
  });
  setQuickRatingEnabled(false);
  renderRatingSession();
  elements.feedback.className = "feedback success";
  elements.feedback.textContent =
    ratingSessionHistory.length % RATING_REPORT_INTERVAL === 0
      ? `Point d’étape : ${ratingSessionHistory.length} notes saisies.`
      : `${rating} étoile${rating > 1 ? "s" : ""} enregistrée${rating > 1 ? "s" : ""}.`;
  quickRatingAdvanceTimer = window.setTimeout(() => {
    quickRatingAdvanceTimer = null;
    startExercise();
  }, QUICK_RATING_ADVANCE_DELAY_MS);
}

function undoLastRating() {
  const last = ratingSessionHistory.pop();
  if (!last) return;
  stopAllTones();
  if (last.previousLocal) {
    localPhraseRatings[last.phraseKey] = last.previousLocal;
  } else {
    delete localPhraseRatings[last.phraseKey];
  }
  refreshRatingsFromLocal();
  writeJson(RATINGS_KEY, localPhraseRatings);
  renderRatingSession();
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Dernière note annulée.";
  setQuickRatingEnabled(true);
}

async function loadPublicPhrase({ phraseKey, transposition }) {
  hideCompletionModal();
  elements.suddenDeathModal.hidden = true;
  stopAllTones();
  getAudioContext();

  const enteringGameMode =
    !document.body.classList.contains("game-mode");
  const isChallenge = currentMode === "challenge";
  const isFree = currentMode === "free";
  updateModeSettings();
  document.body.classList.toggle("challenge-mode", isChallenge);
  document.body.classList.toggle("free-mode", isFree);
  document.body.classList.remove("rating-mode");
  document.body.classList.toggle(
    "sudden-death-mode",
    isChallenge && challengeSession?.phase === "sudden-death",
  );

  let generated;
  try {
    generated = makeSequence({
      maxNotes: REAL_MAX_NOTES,
      mode: "jazz",
      selectedPerformers: WJAZZD_PERFORMERS.map(({ name }) => name),
      phraseRatings: effectivePhraseRatings(),
      minimumRating: isChallenge ? 3 : 0,
      targetPhraseKey: phraseKey,
      transpositionOverride: transposition,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cette phrase est indisponible.";
    elements.sessionStatus.textContent = message;
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = message;
    return;
  }

  if (enteringGameMode) await enterGameMode();
  try {
    await preloadMelodySamples(keyboardMidiNotes(generated.keyboard));
  } catch {
    // Un oscillateur de secours garde la dictée jouable hors connexion.
  }
  try {
    await preloadBassSamples(generated.bassHits ?? []);
  } catch {
    // La mélodie reste jouable si un sample de basse manque.
  }

  exercise = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    mode: currentMode,
    label: generated.meta.label,
    source: generated.meta.source,
    tempo: null,
    speedPercent: realSpeedPercent,
    playbackRatePercent: null,
    originalTempo: generated.meta.originalTempo ?? null,
    notes: generated.notes,
    originalNotes: generated.notes.map((midi) => midi - transposition),
    transposition,
    transpositionCycle: [],
    timings: generated.timings ?? null,
    chicks: generated.chicks ?? null,
    bassHits: generated.bassHits ?? null,
    keyboard: generated.keyboard,
    currentIndex: 0,
    attempts: [],
    replayCount: 0,
    guessStartedAt: null,
    solvedAtLeastOnce: false,
    executionStarted: false,
  };

  elements.kicker.textContent =
    isFree
      ? "Mode libre"
      : challengeSession?.phase === "sudden-death"
        ? "Mort subite"
        : "Défi 3×3";
  elements.exerciseTitle.textContent =
    isFree
      ? "Explore la phrase"
      : challengeSession?.phase === "sudden-death"
        ? "Du premier coup"
        : "Écoute, puis retrouve la phrase";
  renderSource(generated.meta.source);
  elements.sourceLine.hidden = true;
  elements.originalControls.hidden = true;
  elements.nextExercise.disabled = true;
  elements.ratingWorkspace.hidden = true;
  elements.freeTranspose.hidden = !isFree;
  elements.challengeProgress.hidden = isFree;
  if (isChallenge) renderChallengeProgress();
  renderFavoriteButton();
  buildPiano(generated.keyboard);
  markReferenceKey();
  elements.replay.disabled = enteringGameMode;

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

async function loadChallengeRound() {
  if (!challengeSession) return;
  persistChallengeSession();
  if (challengeSession.phase === "transition") {
    showSuddenDeathTransition();
    return;
  }
  const phrase = currentChallengePhrase(challengeSession);
  if (!phrase || !Number.isFinite(challengeSession.currentTransposition)) {
    challengeSession = null;
    persistChallengeSession();
    showHome();
    return;
  }
  currentMode = "challenge";
  await loadPublicPhrase({
    phraseKey: phrase.phraseKey,
    transposition: challengeSession.currentTransposition,
  });
}

async function launchSuddenDeath() {
  if (challengeSession?.phase !== "transition") return;
  beginSuddenDeath(challengeSession);
  persistChallengeSession();
  elements.suddenDeathModal.hidden = true;
  await loadChallengeRound();
}

async function startExercise() {
  hideCompletionModal();
  getAudioContext();
  const isRatingMode = currentMode === "rating";
  const protocol = currentRatingProtocol(false);
  const targetPhraseKey = isRatingMode
    ? pickRatingPhrase({
        phraseRatings,
        fixedScopes: fixedRatingScopes,
        selectedPerformers: [...selectedPerformers],
        sessionHistory: ratingSessionHistory,
      })
    : null;
  if (isRatingMode && !targetPhraseKey) {
    elements.feedback.className = "feedback success";
    elements.feedback.textContent =
      "Toutes les phrases sélectionnées sont couvertes par le protocole.";
    renderRatingSession();
    return;
  }
  const enteringGameMode = !document.body.classList.contains("game-mode");
  document.body.classList.toggle("rating-mode", isRatingMode);
  saveSettings();
  let generated;
  try {
    generated = makeSequence({
      length: randomLength,
      maxNotes: realMaxNotes,
      mode: isRatingMode ? "jazz" : currentMode,
      selectedPerformers: [...selectedPerformers],
      phraseRatings: protocol.effectiveRatings,
      minimumRating: isRatingMode ? 0 : activeMinimumRating(),
      targetPhraseKey,
      fullPhrase: isRatingMode,
      transpositionOverride: isRatingMode ? 0 : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aucune phrase disponible.";
    elements.selectionWarning.textContent = message;
    elements.selectionWarning.hidden = false;
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = message;
    return;
  }
  elements.selectionWarning.textContent =
    "Sélectionne au moins un musicien pour les phrases réelles.";
  elements.selectionWarning.hidden = true;
  if (enteringGameMode) await enterGameMode();
  try {
    await preloadMelodySamples(keyboardMidiNotes(generated.keyboard));
  } catch {
    // Un oscillateur de secours garde la dictée jouable en cas d’échec réseau.
  }
  try {
    await preloadBassSamples(generated.bassHits ?? []);
  } catch {
    // La dictée reste jouable si un sample de basse est momentanément indisponible.
  }
  exercise = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    mode: currentMode,
    label: generated.meta.label,
    source: generated.meta.source,
    tempo: null,
    speedPercent: generated.timings
      ? realSpeedPercent
      : Number(elements.gameSpeed.value),
    playbackRatePercent: generated.timings ? null : randomPlaybackSpeedPercent,
    originalTempo: generated.meta.originalTempo ?? null,
    notes: generated.notes,
    originalNotes: generated.notes.map(
      (midi) => midi - (generated.meta.source.transposition ?? 0),
    ),
    transposition: generated.meta.source.transposition ?? 0,
    transpositionCycle: makeJazzTranspositionCycle({
      excludeTransposition: generated.meta.source.transposition ?? 0,
    }),
    timings: generated.timings ?? null,
    chicks: generated.chicks ?? null,
    bassHits: generated.bassHits ?? null,
    keyboard: generated.keyboard,
    currentIndex: 0,
    attempts: [],
    replayCount: 0,
    guessStartedAt: null,
    solvedAtLeastOnce: false,
  };

  elements.kicker.textContent = generated.meta.label;
  elements.exerciseTitle.textContent = isRatingMode
    ? "Écoute, puis note la phrase"
    : "Écoute, puis retrouve la phrase";
  renderSource(generated.meta.source);
  const hasOriginal = Boolean(generated.meta.source.audioFile);
  elements.originalControls.hidden = isRatingMode || !hasOriginal;
  elements.playOriginal.disabled = !hasOriginal;
  elements.transposeOriginal.disabled = !hasOriginal;
  elements.replay.disabled = enteringGameMode;
  elements.nextExercise.disabled = false;
  elements.nextExercise.textContent = isRatingMode ? "Passer" : "Suivant";
  elements.ratingWorkspace.hidden = !isRatingMode;
  setQuickRatingEnabled(false);
  renderRatingControls();
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
  if (isRatingMode) renderRatingSession();
}

function renderSource(source) {
  elements.sourceSummary.hidden = !source.performer;
  elements.sourceSummary.replaceChildren();
  if (source.performer) {
    const performer = document.createElement("strong");
    performer.textContent = source.performer;
    elements.sourceSummary.append(
      performer,
      document.createTextNode(` — ${source.title}`),
    );
  }
  elements.sourceLine.hidden =
    !developerMode || currentMode === "challenge" || currentMode === "free";
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
  window.clearTimeout(phraseIdCopyTimer);
  phraseIdCopyTimer = null;
  elements.copyPhraseId.textContent = "Copier";
  if (source.phraseKey) {
    elements.phraseReference.hidden = false;
    elements.phraseId.textContent = source.phraseKey;
    elements.copyPhraseId.setAttribute(
      "aria-label",
      `Copier l’identifiant ${source.phraseKey}`,
    );
  } else {
    elements.phraseReference.hidden = true;
    elements.phraseId.textContent = "";
    elements.copyPhraseId.removeAttribute("aria-label");
  }
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
  renderFavoriteButton();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
}

async function copyCurrentPhraseId() {
  const phraseId = exercise?.source?.phraseKey;
  if (!phraseId) return;
  const copied = await copyText(phraseId);
  elements.copyPhraseId.textContent = copied ? "Copié" : "Échec";
  window.clearTimeout(phraseIdCopyTimer);
  phraseIdCopyTimer = window.setTimeout(() => {
    phraseIdCopyTimer = null;
    elements.copyPhraseId.textContent = "Copier";
  }, 1_500);
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
  renderRatingControls();
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
  exercise.executionStarted = false;
}

function restartSameExercise() {
  if (!exercise) return;
  hideCompletionModal();
  stopAllTones();
  prepareRepeatedExercise();
  resetExerciseProgress();
  playSequence();
}

async function transposeSameExercise() {
  if (!exercise) return;
  hideCompletionModal();
  stopAllTones();
  setPhraseRating(3, { automatic: true });
  if (!exercise.transpositionCycle.length) {
    exercise.transpositionCycle = makeJazzTranspositionCycle({
      avoidFirstTransposition: exercise.transposition,
    });
  }
  const transposition = exercise.transpositionCycle.shift();
  exercise.transposition = transposition;
  exercise.notes = exercise.originalNotes.map((midi) => midi + transposition);
  exercise.bassHits = voiceBassHits(exercise.bassHits ?? [], transposition);
  exercise.source = { ...exercise.source, transposition };
  exercise.keyboard = keyboardLayoutForNotes(exercise.notes);
  prepareRepeatedExercise();
  resetExerciseProgress();
  renderSource(exercise.source);
  buildPiano(exercise.keyboard);
  markReferenceKey();
  try {
    await preloadMelodySamples(keyboardMidiNotes(exercise.keyboard));
  } catch {
    // Un oscillateur de secours garde la dictée jouable en cas d’échec réseau.
  }
  try {
    await preloadBassSamples(exercise.bassHits);
  } catch {
    // La mélodie reste prioritaire si le chargement d’une basse échoue.
  }
  playSequence();
}

function togglePlayback() {
  if (!exercise) return;
  if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death" &&
    exercise.executionStarted
  ) {
    elements.feedback.className = "feedback";
    elements.feedback.textContent =
      "Tentative en cours — termine la phrase sans réécouter.";
    return;
  }
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
  exercise.executionStarted = false;
  elements.replay.disabled = false;
}

function restartAfterMistake() {
  resetExerciseProgress();
  elements.feedback.className = "feedback error";
  elements.feedback.textContent = "Erreur — on réécoute depuis le début.";
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    playSequence({ guardInputBurst: true });
  }, WRONG_NOTE_REPLAY_DELAY_MS);
}

function failSuddenDeath() {
  acceptingInput = false;
  elements.replay.disabled = true;
  elements.feedback.className = "feedback error";
  elements.feedback.textContent = "Raté — on passe à la phrase suivante.";
  resolveSuddenDeath(challengeSession, false);
  persistChallengeSession();
  roundAdvanceTimer = window.setTimeout(async () => {
    roundAdvanceTimer = null;
    await loadChallengeRound();
  }, ROUND_ADVANCE_DELAY_MS);
}

function handlePianoInput(midi, key) {
  const inputAt = performance.now();
  const quietBeforeInput = inputAt - lastPianoInputAt;
  lastPianoInputAt = inputAt;
  if (guardPlaybackFromInputBurst) {
    if (quietBeforeInput < INPUT_BURST_QUIET_MS) return;
    guardPlaybackFromInputBurst = false;
  }
  if (isPlaying || isOriginalPlaying) {
    stopAllTones();
    restoreExerciseInput("Lecture interrompue. À toi.");
  }

  playTone(midi, 0, 0.36);
  key.classList.add("active");
  window.setTimeout(() => key.classList.remove("active"), 160);
  if (!exercise || !acceptingInput) return;

  if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death" &&
    !exercise.executionStarted
  ) {
    exercise.executionStarted = true;
    elements.replay.disabled = true;
    elements.feedback.className = "feedback";
    elements.feedback.textContent = "Tentative lancée.";
  }

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
    if (
      currentMode === "challenge" &&
      challengeSession?.phase === "sudden-death"
    ) {
      failSuddenDeath();
      return;
    }
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
  elements.feedback.textContent =
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
      ? `${exercise.currentIndex} sur ${exercise.notes.length}.`
      : `Juste. Note ${exercise.currentIndex + 1} sur ${exercise.notes.length}.`;
}

function renderCompletedChallenge(phrases) {
  const fragment = document.createDocumentFragment();
  for (const phrase of phrases) {
    const row = document.createElement("div");
    const performer = document.createElement("strong");
    performer.textContent = phrase.performer;
    const title = document.createElement("span");
    title.textContent = phrase.title;
    row.append(performer, title);
    fragment.append(row);
  }
  elements.completedPhrases.replaceChildren(fragment);
}

function completeChallenge() {
  lastCompletedChallengePhrases = challengeSession.phrases.map((phrase) => ({
    phraseKey: phrase.phraseKey,
    performer: phrase.performer,
    title: phrase.title,
  }));
  completedPhraseKeys = [
    ...new Set([
      ...completedPhraseKeys,
      ...lastCompletedChallengePhrases.map(({ phraseKey }) => phraseKey),
    ]),
  ];
  writeJson(COMPLETED_PHRASES_KEY, completedPhraseKeys);
  challengeSession = null;
  localStorage.removeItem(CHALLENGE_SESSION_KEY);
  renderCompletedChallenge(lastCompletedChallengePhrases);
  elements.challengeCompleteModal.hidden = false;
  window.requestAnimationFrame(() => elements.finishNewChallenge.focus());
}

function finishExercise() {
  acceptingInput = false;
  exercise.completedAt = new Date().toISOString();
  exercise.solvedAtLeastOnce = true;
  elements.feedback.className = "feedback success";
  if (currentMode === "challenge" && challengeSession?.phase === "training") {
    elements.feedback.textContent = "Ton validé.";
    advanceTraining(challengeSession);
    persistChallengeSession();
    roundAdvanceTimer = window.setTimeout(async () => {
      roundAdvanceTimer = null;
      if (challengeSession.phase === "transition") {
        showSuddenDeathTransition();
      } else {
        await loadChallengeRound();
      }
    }, ROUND_ADVANCE_DELAY_MS);
    return;
  }
  if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
  ) {
    elements.feedback.textContent = "Phrase validée du premier coup.";
    resolveSuddenDeath(challengeSession, true);
    if (challengeSession.phase === "complete") {
      completeChallenge();
      return;
    }
    persistChallengeSession();
    roundAdvanceTimer = window.setTimeout(async () => {
      roundAdvanceTimer = null;
      await loadChallengeRound();
    }, ROUND_ADVANCE_DELAY_MS);
    return;
  }
  if (currentMode === "free") {
    elements.feedback.textContent =
      "Phrase retrouvée. Rejoue-la ou change de ton.";
    elements.replay.disabled = false;
    return;
  }

  elements.feedback.textContent = "Phrase terminée.";
  scheduleCompletionModal();
}

function goToNextExercise() {
  if (
    developerMode &&
    currentMode !== "rating" &&
    exercise &&
    !exercise.solvedAtLeastOnce
  ) {
    setPhraseRating(1, { automatic: true });
  }
  startExercise();
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

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportRatings() {
  const protocol = currentRatingProtocol(false);
  const rows = [
    [
      "protocole_version",
      "portee",
      "identifiant",
      "etoiles",
      "musicien",
      "morceau",
      "phrase",
      "origine",
      "taille_echantillon",
      "accord",
      "couverture",
      "source_url",
      "mise_a_jour",
    ],
  ];
  for (const [phraseKey, stored] of Object.entries(phraseRatings).sort()) {
    const entry =
      stored && typeof stored === "object" ? stored : { rating: stored };
    const rating = Number(entry.rating);
    if (rating < 1 || rating > 3) continue;
    rows.push([
      RATING_PROTOCOL_VERSION,
      "phrase",
      phraseKey,
      rating,
      entry.performer,
      entry.title,
      entry.phrase,
      entry.origin ?? "manual",
      1,
      1,
      1,
      entry.sourceUrl,
      entry.updatedAt,
    ]);
  }
  for (const scope of [...protocol.scopes, ...protocol.structuralRules]) {
    rows.push([
      RATING_PROTOCOL_VERSION,
      scope.scope,
      scope.scopeId,
      scope.rating,
      scope.performer,
      scope.title,
      null,
      scope.origin,
      scope.sampleSize,
      Number.isFinite(scope.agreement) ? scope.agreement.toFixed(4) : null,
      Number.isFinite(scope.coverage) ? scope.coverage.toFixed(4) : null,
      null,
      scope.updatedAt,
    ]);
  }
  download(
    `dictee-musicale-protocole-${new Date().toISOString().slice(0, 10)}.csv`,
    `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`,
    "text/csv;charset=utf-8",
  );
}

function registerOfflineSupport() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
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
  document.body.classList.remove("home-view");
  document.body.classList.add("game-mode");
  updateGameModeButton();
}

function deactivateGameLayout() {
  document.body.classList.remove(
    "game-mode",
    "rating-mode",
    "challenge-mode",
    "free-mode",
    "sudden-death-mode",
  );
  elements.ratingWorkspace.hidden = true;
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

  if (currentMode !== "rating") {
    try {
      await screen.orientation?.lock?.("landscape");
    } catch {
      // iOS et certains navigateurs imposent une rotation manuelle.
    }
  }
}

async function leaveGameMode(
  destination = currentMode === "free" ? "favorites" : "home",
) {
  stopAllTones();
  hideCompletionModal();
  elements.suddenDeathModal.hidden = true;
  elements.challengeCompleteModal.hidden = true;
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
  exercise = null;
  if (destination === "favorites") showFavorites();
  else showHome();
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
      exercise = null;
      if (currentMode === "free") showFavorites();
      else showHome();
    }
  });
}

elements.gameLength.addEventListener("input", () =>
  syncLength(elements.gameLength.value),
);
elements.gameSpeed.addEventListener("input", () => syncGameSpeed(elements.gameSpeed.value));
elements.minimumRating.addEventListener("change", () =>
  syncMinimumRating(elements.minimumRating.value),
);
elements.startReal.addEventListener("click", () => startMode("jazz"));
elements.startRandom.addEventListener("click", () => startMode("random"));
elements.startRating.addEventListener("click", () => startMode("rating"));
elements.startChallenge.addEventListener("click", startNewChallenge);
elements.resumeChallenge.addEventListener("click", resumeChallenge);
elements.newChallenge.addEventListener("click", startNewChallenge);
elements.openFavorites.addEventListener("click", showFavorites);
elements.closeFavorites.addEventListener("click", showHome);
elements.favoriteToggle.addEventListener("click", toggleCurrentFavorite);
elements.freeTranspose.addEventListener("click", transposeFreePhrase);
elements.startSuddenDeath.addEventListener("click", launchSuddenDeath);
elements.finishNewChallenge.addEventListener("click", startNewChallenge);
elements.finishHome.addEventListener("click", () => leaveGameMode("home"));
elements.developerMode.addEventListener("change", () =>
  setDeveloperMode(elements.developerMode.checked),
);
elements.selectDefaultPerformers.addEventListener("click", () =>
  setPerformerSelection(DEFAULT_PERFORMERS),
);
elements.selectAllPerformers.addEventListener("click", () =>
  setPerformerSelection(WJAZZD_PERFORMERS.map(({ name }) => name)),
);
elements.clearPerformers.addEventListener("click", () =>
  setPerformerSelection([]),
);
elements.nextExercise.addEventListener("click", goToNextExercise);
elements.replay.addEventListener("click", togglePlayback);
elements.playOriginal.addEventListener("click", toggleOriginalPlayback);
elements.copyPhraseId.addEventListener("click", copyCurrentPhraseId);
elements.transposeOriginal.addEventListener("change", saveSettings);
elements.completionOriginal.addEventListener("click", toggleCompletionOriginal);
elements.restartExercise.addEventListener("click", restartSameExercise);
elements.transposeExercise.addEventListener("click", transposeSameExercise);
elements.completionNext.addEventListener("click", goToNextExercise);
elements.completionExit.addEventListener("click", () => leaveGameMode("home"));
elements.exportRatings.addEventListener("click", exportRatings);
elements.undoRating.addEventListener("click", undoLastRating);
elements.fullscreenButton.addEventListener("click", toggleGameMode);
elements.exitPortraitMode.addEventListener("click", () => leaveGameMode());
for (const button of document.querySelectorAll(".star-rating [data-rating]")) {
  button.addEventListener("click", setRatingFromButton);
}
for (const button of elements.quickRatingButtons) {
  button.addEventListener("click", setQuickRating);
}
document.addEventListener("keydown", (event) => {
  if (currentMode !== "rating" || !document.body.classList.contains("game-mode")) {
    return;
  }
  if (["1", "2", "3"].includes(event.key)) {
    event.preventDefault();
    setQuickRating(Number(event.key));
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }
});

loadSettings();
showHome();
registerOfflineSupport();
setUpInstallPrompt();
setUpGameMode();
