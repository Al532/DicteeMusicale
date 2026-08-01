import {
  WJAZZD_PERFORMERS,
  jazzTranspositionInRange,
  jazzTranspositionRangeForNotes,
  jazzPhraseCatalog,
  loadPhraseCatalogEntry,
  loadSequence,
  pitchClass,
} from "./engine.js";
import {
  createAudioRuntime,
  keyboardMidiNotes,
} from "./audio-runtime.js";
import { createOriginalPlayer } from "./original-player.js";
import { mergeRecordingValidations } from "./recording.js";
import {
  advanceTraining,
  beginSuddenDeath,
  createChallengeSession,
  createTranspositionState,
  currentChallengePhrase,
  drawNextTransposition,
  isResumableChallengeSession,
  retargetTranspositionState,
  resolveSuddenDeath,
  selectChallengePhrases,
} from "./session.js";
import {
  RATING_PROTOCOL_VERSION,
  RATING_REPORT_INTERVAL,
  pickRatingPhrase,
} from "./ratings.js";
import { createRatingWorkflow } from "./rating-workflow.js";
import {
  DEFAULT_PHRASE_MAX_NOTES,
  materializeLegacyPhraseEvents,
  mergePhraseSettings,
  normalizeEditedPhraseEvents,
  resolvePhraseSettings,
} from "./phrase-settings.js";
import {
  WJAZZD_SOLO_INDEX,
  loadPhraseCorpus,
} from "./corpus-loader.js";
import { createPhraseEditor } from "./phrase-editor.js";
import { createDataExportCsv } from "./data-export.js";
import {
  applyDocumentTranslations,
  locale,
  localizeError,
  noteName,
  sourceLabel,
  t,
} from "./i18n.js";
import { activateEmbeddedBrowserGuard } from "./embedded-browser.js";
import { bindAppEvents, queryAppElements } from "./app-dom.js";
import { createAppRenderer } from "./app-renderer.js";
import { createAppShell } from "./app-shell.js";
import {
  createExerciseState,
  enterExerciseMidi,
  exercisePlaybackDurationMs,
  originalExerciseNotes,
  resetExerciseProgress as resetExerciseState,
} from "./exercise.js";
import {
  CHALLENGE_SESSION_KEY,
  COMPLETED_PHRASES_KEY,
  FAVORITES_KEY,
  PHRASE_SETTINGS_KEY,
  RECORDING_VALIDATIONS_KEY,
  RATINGS_KEY,
  RATING_SCOPES_KEY,
  loadAndMigrateGlobalSettings,
  loadStoredArray,
  loadStoredObject,
  readJson,
  removeStoredValue,
  saveGlobalSettings,
  writeJson,
} from "./persistence.js";
import {
  DEFAULT_PHRASE_RATINGS,
  DEFAULT_RATING_SCOPES,
} from "../data/default-ratings.js";
import { DEFAULT_PHRASE_SETTINGS } from "../data/default-phrase-settings.js";
import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";

applyDocumentTranslations();
activateEmbeddedBrowserGuard({
  copiedMessage: t("embedded.copied"),
  copyFailedMessage: t("embedded.copyFailed"),
});

const REAL_MAX_NOTES = DEFAULT_PHRASE_MAX_NOTES;
const ALL_PERFORMER_NAMES = WJAZZD_PERFORMERS.map(({ name }) => name);
const WRONG_NOTE_REPLAY_DELAY_MS = 650;
const ROUND_ADVANCE_DELAY_MS = 720;
const GAME_MODE_START_DELAY_MS = 900;
const QUICK_RATING_ADVANCE_DELAY_MS = 180;
const PHRASE_ADJUSTMENT_RELOAD_DELAY_MS = 140;
const INPUT_BURST_QUIET_MS = 500;

const elements = queryAppElements(document);
const appRenderer = createAppRenderer({
  document,
  elements,
  noteName,
  pitchClass,
  translate: t,
});
let phraseEditorTarget = null;
const phraseEditor = createPhraseEditor({
  documentObject: document,
  noteLabel: appRenderer.noteLabel,
  onClose: () => {
    if (exercise) restoreExerciseInput();
  },
  onPreview: previewPhraseEditorEvents,
  onSave: saveCurrentPhraseEvents,
  onStopPreview: () => stopAllTones(),
  translate: t,
  windowObject: window,
});
const audioRuntime = createAudioRuntime({
  baseUrl: document.baseURI,
  translate: t,
});
let localRecordingValidations = loadStoredObject(
  RECORDING_VALIDATIONS_KEY,
);
let recordingValidations = mergeRecordingValidations(
  RECORDING_VALIDATIONS,
  localRecordingValidations,
);
let recordingWorkshop = null;
let lickExplorer = null;
let lickExerciseToolsPromise = null;
const {
  getAudioContext,
  playBass,
  playChick,
  playTone,
  preloadBassSamples,
  preloadMelodySamples,
} = audioRuntime;
const originalPlayer = createOriginalPlayer({
  documentObject: document,
  elements,
  getRecordingValidations: () => recordingValidations,
  onBeforePlay: () => stopAllTones(),
  onDisableInput: () => {
    acceptingInput = false;
  },
  onRestoreInput: (message) => restoreExerciseInput(message),
  translate: t,
  windowObject: window,
});

let exercise = null;
let acceptingInput = false;
const ratingWorkflow = createRatingWorkflow({
  embeddedRatings: DEFAULT_PHRASE_RATINGS,
  embeddedScopes: DEFAULT_RATING_SCOPES,
  localRatings: loadStoredObject(RATINGS_KEY),
  localScopes: loadStoredArray(RATING_SCOPES_KEY),
});
let localPhraseSettings = loadStoredObject(PHRASE_SETTINGS_KEY);
let phraseSettings = mergePhraseSettings(
  DEFAULT_PHRASE_SETTINGS,
  localPhraseSettings,
);
let catalogOverrides = {};
let currentMode = "challenge";
let realSpeedPercent = 100;
let melodySound = "synthetic";
let developerMode = false;
let challengeSession = readJson(CHALLENGE_SESSION_KEY, null);
let completedPhraseKeys = loadStoredArray(COMPLETED_PHRASES_KEY);
let favoritePhraseKeys = loadStoredArray(FAVORITES_KEY);
let freePhraseKey = null;
let freeBrowsePhraseKeys = [];
let freeToneState = null;
let lickExerciseDeck = [];
let lickExerciseIndex = -1;
let lickExerciseNumber = 0;
let lickExerciseToneState = null;
let lastCompletedChallengePhrases = [];
let playbackTimer = null;
let restartTimer = null;
let gameModeStartTimer = null;
let quickRatingAdvanceTimer = null;
let phraseAdjustmentTimer = null;
let roundAdvanceTimer = null;
let phraseIdCopyTimer = null;
let isPlaying = false;
let exerciseLaunchVersion = 0;
let guardPlaybackFromInputBurst = false;
let lastPianoInputAt = Number.NEGATIVE_INFINITY;
const appShell = createAppShell({
  closeOriginalPlayer: originalPlayer.close,
  documentObject: document,
  elements,
  navigatorObject: navigator,
  onFullscreenExit: () => {
    phraseEditor.close({ restoreFocus: false });
    stopAllTones();
    cancelPhraseAdjustmentReload();
    acceptingInput = false;
    exercise = null;
    if (currentMode === "lick-exercise") resetLickExerciseSession();
    if (currentMode === "free") showFavorites();
    else showHome();
  },
  screenObject: screen,
  translate: t,
  windowObject: window,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadSettings() {
  const settings = loadAndMigrateGlobalSettings();
  currentMode = "challenge";
  developerMode = settings.developerMode;
  realSpeedPercent = settings.realSpeed;
  melodySound = settings.melodySound;
  audioRuntime.setMelodySound(melodySound);
  elements.developerMode.checked = developerMode;
  renderDeveloperMode();
  renderSpeedSetting();
}

function saveSettings() {
  saveGlobalSettings({
    realSpeed: realSpeedPercent,
    developerMode,
  });
}

function currentRatingProtocol() {
  return ratingWorkflow.protocol();
}

function renderDeveloperMode() {
  document.body.classList.toggle("developer-mode", developerMode);
  for (const element of elements.developerOnly) {
    element.hidden = !developerMode;
  }
  elements.developerMode.checked = developerMode;
  renderRatingControls();
  renderPhraseControls();
}

async function ensureRecordingWorkshop() {
  if (recordingWorkshop) return recordingWorkshop;
  const { createRecordingWorkshop } = await import(
    "./recording-workshop.js"
  );
  recordingWorkshop = createRecordingWorkshop({
    documentObject: document,
    elements,
    getReviewPhraseKeys: () =>
      threeStarReviewCatalog().map(({ phraseKey }) => phraseKey),
    initialLocalValidations: localRecordingValidations,
    loadPhrasePreview: loadRecordingWorkshopPhrase,
    onChange(nextLocalValidations) {
      localRecordingValidations = nextLocalValidations;
      writeJson(
        RECORDING_VALIDATIONS_KEY,
        localRecordingValidations,
      );
      recordingValidations = mergeRecordingValidations(
        RECORDING_VALIDATIONS,
        localRecordingValidations,
      );
      if (exercise?.source) {
        originalPlayer.renderSource(exercise.source);
      }
    },
    onPlayPhrase: playRecordingWorkshopPhrase,
    onStopPhrase: stopAllTones,
    translate: t,
    windowObject: window,
  });
  return recordingWorkshop;
}

async function openRecordingWorkshop() {
  if (!developerMode) return;
  lickExplorer?.stop();
  elements.lickExplorerPanel.hidden = true;
  const workshop = await ensureRecordingWorkshop();
  appRenderer.showHomePanel(false);
  elements.favoritesPanel.hidden = true;
  elements.recordingWorkshopPanel.hidden = false;
  workshop.open();
}

function closeRecordingWorkshop() {
  recordingWorkshop?.stopPreview();
  elements.recordingWorkshopPanel.hidden = true;
  showHome();
}

function selectRecordingWorkshopSolo() {
  recordingWorkshop?.selectSolo();
}

function selectRecordingWorkshopCandidate() {
  recordingWorkshop?.selectCandidate();
}

function useManualRecordingCandidate() {
  recordingWorkshop?.useManualCandidate();
}

function adjustRecordingOffset(delta) {
  recordingWorkshop?.adjustOffset(delta);
}

function previewRecordingWorkshop() {
  void recordingWorkshop?.preview();
}

function playSelectedRecordingWorkshopPhrase() {
  void recordingWorkshop?.playPhrase();
}

function editSelectedRecordingWorkshopPhrase() {
  const phraseKey = recordingWorkshop?.selectedPhraseKey();
  if (!phraseKey) return;
  recordingWorkshop.stopPreview();
  void openPhraseEditorForPhrase(phraseKey, { origin: "workshop" });
}

function verifyRecordingWorkshop() {
  recordingWorkshop?.verify();
}

function rejectRecordingWorkshop() {
  recordingWorkshop?.reject();
}

function markRecordingUnavailable() {
  recordingWorkshop?.markUnavailable();
}

async function ensureLickExplorer() {
  if (lickExplorer) return lickExplorer;
  const { createLickExplorer } = await import("./lick-explorer.js");
  lickExplorer = createLickExplorer({
    audioRuntime,
    documentObject: document,
    onClose: showHome,
    translate: t,
    windowObject: window,
  });
  return lickExplorer;
}

async function openLickExplorer() {
  if (!developerMode) return;
  stopAllTones();
  recordingWorkshop?.stopPreview();
  elements.recordingWorkshopPanel.hidden = true;
  const explorer = await ensureLickExplorer();
  if (!developerMode) return;
  appRenderer.showHomePanel(false);
  elements.favoritesPanel.hidden = true;
  elements.lickExplorerPanel.hidden = false;
  explorer.open();
}

function resetLickExerciseSession() {
  lickExerciseDeck = [];
  lickExerciseIndex = -1;
  lickExerciseNumber = 0;
  lickExerciseToneState = null;
  document.body.classList.remove("lick-exercise-mode");
  elements.nextExercise.hidden = true;
  elements.nextExercise.disabled = true;
  elements.freeTranspose.hidden = true;
}

async function ensureLickExerciseTools() {
  if (!lickExerciseToolsPromise) {
    lickExerciseToolsPromise = import("./lick-explorer.js");
  }
  return lickExerciseToolsPromise;
}

async function startLickExercise() {
  currentMode = "lick-exercise";
  stopAllTones();
  recordingWorkshop?.stopPreview();
  lickExplorer?.stop();
  elements.recordingWorkshopPanel.hidden = true;
  elements.lickExplorerPanel.hidden = true;
  try {
    const tools = await ensureLickExerciseTools();
    if (currentMode !== "lick-exercise") return false;
    lickExerciseDeck = tools.shuffledLickDeck(
      tools.classifiedVeryTypicalLicks(),
    );
    lickExerciseIndex = 0;
    lickExerciseNumber = 1;
    lickExerciseToneState = null;
    const loaded = await loadCurrentLickExercise();
    if (!loaded && currentMode === "lick-exercise") {
      const message =
        elements.feedback.textContent || t("phrase.noneAvailable");
      resetLickExerciseSession();
      currentMode = "challenge";
      showHome();
      elements.sessionStatus.hidden = false;
      elements.sessionStatus.textContent = message;
    }
    return loaded;
  } catch (error) {
    if (currentMode !== "lick-exercise") return false;
    resetLickExerciseSession();
    currentMode = "challenge";
    const message = localizeError(
      error instanceof Error ? error.message : t("phrase.noneAvailable"),
    );
    showHome();
    elements.sessionStatus.hidden = false;
    elements.sessionStatus.textContent = message;
    return false;
  }
}

async function setDeveloperMode(enabled) {
  developerMode = Boolean(enabled);
  elements.developerMode.closest("details")?.removeAttribute("open");
  if (!developerMode && !elements.lickExplorerPanel.hidden) {
    lickExplorer?.close();
  }
  if (
    !developerMode &&
    ["rating", "review"].includes(currentMode)
  ) {
    resetLickExerciseSession();
    currentMode = "challenge";
    await leaveGameMode();
  }
  renderDeveloperMode();
  saveSettings();
}

function renderSpeedSetting() {
  elements.gameSpeedSetting.hidden = false;
  elements.gameSpeed.min = "25";
  elements.gameSpeed.max = "100";
  elements.gameSpeed.step = "5";
  elements.gameSpeed.value = String(realSpeedPercent);
  elements.gameSpeedOutput.value = `${Math.round(elements.gameSpeed.value)} %`;
}

function syncGameSpeed(value) {
  realSpeedPercent = clamp(Number(value), 25, 100);
  renderSpeedSetting();
  saveSettings();
}

function startMode(mode) {
  if (!developerMode || !["rating", "review"].includes(mode)) return;
  if (mode === "rating") {
    ratingWorkflow.beginRatingSession();
    renderRatingSession();
  }
  if (mode === "review") {
    ratingWorkflow.beginReview(
      threeStarReviewCatalog().map(({ phraseKey }) => phraseKey),
    );
  }
  currentMode = mode;
  document.body.classList.remove(
    "challenge-mode",
    "free-mode",
    "lick-exercise-mode",
    "sudden-death-mode",
    "review-mode",
  );
  elements.challengeProgress.hidden = true;
  elements.sourceSummary.hidden = true;
  elements.favoriteToggle.hidden = true;
  elements.freeTranspose.hidden = true;
  saveSettings();
  startExercise();
}

function effectivePhraseRatings() {
  return ratingWorkflow.effectiveRatings();
}

function challengeCatalog() {
  return jazzPhraseCatalog({
    catalogOverrides,
    phraseRatings: effectivePhraseRatings(),
    phraseSettings,
    minimumRating: 3,
  });
}

function allPhraseCatalog() {
  return jazzPhraseCatalog({
    catalogOverrides,
    phraseRatings: effectivePhraseRatings(),
    phraseSettings,
    minimumRating: 0,
  });
}

function threeStarReviewCatalog() {
  return jazzPhraseCatalog({
    catalogOverrides,
    phraseRatings: effectivePhraseRatings(),
    phraseSettings,
    minimumRating: 3,
  }).sort(
    (left, right) =>
      left.performer.localeCompare(right.performer, locale) ||
      left.title.localeCompare(right.title, locale) ||
      Number(left.phrase) - Number(right.phrase),
  );
}

function catalogMap(catalog = allPhraseCatalog()) {
  return new Map(catalog.map((phrase) => [phrase.phraseKey, phrase]));
}

function comparePhraseReferences(left, right) {
  return (
    left.performer.localeCompare(right.performer, locale) ||
    left.title.localeCompare(right.title, locale) ||
    Number(left.phrase) - Number(right.phrase)
  );
}

function favoritePhraseCatalog() {
  const phrasesByKey = catalogMap();
  return [...new Set(favoritePhraseKeys)]
    .map((phraseKey) => phrasesByKey.get(phraseKey))
    .filter(Boolean)
    .sort(comparePhraseReferences);
}

async function hydrateCatalogPhrase(phrase) {
  const detailed = await loadPhraseCatalogEntry(phrase.phraseKey, {
    phraseSettings,
  });
  catalogOverrides[detailed.phraseKey] = {
    noteCount: detailed.noteCount,
    transpositionRange: [...detailed.transpositionRange],
  };
  return {
    ...phrase,
    ...detailed,
  };
}

function persistChallengeSession() {
  if (challengeSession?.phase === "complete" || !challengeSession) {
    removeStoredValue(CHALLENGE_SESSION_KEY);
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
    removeStoredValue(CHALLENGE_SESSION_KEY);
  }
  return catalog;
}

function renderHomeState() {
  normalizePersistedChallenge();
  appRenderer.renderHomeState(challengeSession);
}

function showHome() {
  recordingWorkshop?.stopPreview();
  lickExplorer?.stop();
  document.body.classList.remove("lick-exercise-mode");
  elements.recordingWorkshopPanel.hidden = true;
  elements.lickExplorerPanel.hidden = true;
  appRenderer.showHomePanel(true);
  renderHomeState();
}

function renderFavorites() {
  const favorites = favoritePhraseCatalog();

  appRenderer.renderFavorites(favorites, {
    onOpen: startFreePhrase,
    onRemove: (phraseKey) => {
      favoritePhraseKeys = favoritePhraseKeys.filter(
        (favoriteKey) => favoriteKey !== phraseKey,
      );
      writeJson(FAVORITES_KEY, favoritePhraseKeys);
      renderFavorites();
    },
  });
}

function showFavorites() {
  recordingWorkshop?.stopPreview();
  lickExplorer?.stop();
  elements.recordingWorkshopPanel.hidden = true;
  elements.lickExplorerPanel.hidden = true;
  appRenderer.showHomePanel(false);
  renderFavorites();
}

function isFavorite(phraseKey) {
  return Boolean(phraseKey && favoritePhraseKeys.includes(phraseKey));
}

function renderFavoriteControl(button, phraseKey, subject = "") {
  appRenderer.renderFavoriteControl(button, {
    favorite: isFavorite(phraseKey),
    subject,
  });
}

function toggleFavoritePhrase(phraseKey) {
  if (!phraseKey) return false;
  if (isFavorite(phraseKey)) {
    favoritePhraseKeys = favoritePhraseKeys.filter(
      (favoriteKey) => favoriteKey !== phraseKey,
    );
  } else {
    favoritePhraseKeys = [...new Set([...favoritePhraseKeys, phraseKey])];
  }
  writeJson(FAVORITES_KEY, favoritePhraseKeys);
  return isFavorite(phraseKey);
}

function renderFavoriteButton() {
  const phraseKey = exercise?.source?.phraseKey;
  elements.favoriteToggle.hidden = !phraseKey || currentMode === "rating";
  renderFavoriteControl(elements.favoriteToggle, phraseKey);
}

function toggleCurrentFavorite() {
  const phraseKey = exercise?.source?.phraseKey;
  if (!phraseKey) return;
  toggleFavoritePhrase(phraseKey);
  renderFavoriteButton();
}

function currentTrainingRoundIndex() {
  if (!challengeSession || challengeSession.phase !== "training") return 0;
  return challengeSession.phraseIndex * 3 + challengeSession.toneIndex;
}

function renderChallengeProgress() {
  appRenderer.renderChallengeProgress(
    challengeSession,
    currentTrainingRoundIndex(),
  );
}

function renderReviewProgress() {
  appRenderer.renderReviewProgress(ratingWorkflow.reviewState());
}

function freeProgressState() {
  const index = freeBrowsePhraseKeys.indexOf(freePhraseKey);
  return {
    index: Math.max(0, index),
    total: freeBrowsePhraseKeys.length,
  };
}

function renderFreeProgress() {
  appRenderer.renderFreeProgress(freeProgressState());
}

async function moveReviewPhrase(offset) {
  if (currentMode !== "review") return;
  const phraseKey = ratingWorkflow.moveReview(offset);
  if (!phraseKey) return;
  await startExercise({
    targetPhraseKeyOverride: phraseKey,
  });
}

async function refreshReviewAfterRating() {
  if (currentMode !== "review") return;
  const review = ratingWorkflow.refreshReview(
    threeStarReviewCatalog().map(({ phraseKey }) => phraseKey),
  );
  if (!review.total) {
    stopAllTones();
    exercise = null;
    renderReviewProgress();
    renderPhraseControls();
    renderRatingControls();
    elements.feedback.className = "feedback success";
    elements.feedback.textContent = t("review.empty");
    return;
  }
  await startExercise({
    targetPhraseKeyOverride: review.currentKey,
  });
}

function showSuddenDeathTransition() {
  stopAllTones();
  acceptingInput = false;
  exercise = null;
  renderChallengeProgress();
  elements.suddenDeathModal.hidden = false;
  window.requestAnimationFrame(() => elements.startSuddenDeath.focus());
}

async function startNewChallenge() {
  elements.challengeCompleteModal.hidden = true;
  elements.suddenDeathModal.hidden = true;
  const catalog = challengeCatalog();
  const selection = selectChallengePhrases({
    catalog,
    completedPhraseKeys,
  });
  let hydratedPhrases;
  try {
    hydratedPhrases = await Promise.all(
      selection.phrases.map(hydrateCatalogPhrase),
    );
  } catch (error) {
    const message = localizeError(
      error instanceof Error ? error.message : t("phrase.noneAvailable"),
    );
    elements.sessionStatus.hidden = false;
    elements.sessionStatus.textContent = message;
    return;
  }
  if (selection.resetPhraseKeys.length) {
    const resetKeys = new Set(selection.resetPhraseKeys);
    completedPhraseKeys = completedPhraseKeys.filter(
      (phraseKey) => !resetKeys.has(phraseKey),
    );
    writeJson(COMPLETED_PHRASES_KEY, completedPhraseKeys);
  }
  challengeSession = createChallengeSession(hydratedPhrases);
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

async function startFreePhrase(
  phraseKey,
  { preserveBrowseList = false } = {},
) {
  if (!preserveBrowseList) {
    freeBrowsePhraseKeys = favoritePhraseCatalog().map(
      (phrase) => phrase.phraseKey,
    );
  }
  if (!freeBrowsePhraseKeys.includes(phraseKey)) {
    freeBrowsePhraseKeys = [...freeBrowsePhraseKeys, phraseKey];
  }
  freePhraseKey = phraseKey;
  freeToneState = null;
  currentMode = "free";
  const catalogPhrase = catalogMap().get(phraseKey);
  if (!catalogPhrase) return;
  let hydratedPhrase;
  try {
    hydratedPhrase = await hydrateCatalogPhrase(catalogPhrase);
  } catch (error) {
    if (freePhraseKey !== phraseKey || currentMode !== "free") return;
    const message = localizeError(
      error instanceof Error ? error.message : t("phrase.noneAvailable"),
    );
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = message;
    return;
  }
  if (freePhraseKey !== phraseKey || currentMode !== "free") return;
  freeToneState = createTranspositionState(
    hydratedPhrase.transpositionRange,
  );
  const transposition = drawNextTransposition(freeToneState);
  await loadPublicPhrase({ phraseKey, transposition });
}

async function moveFreePhrase(offset) {
  if (currentMode !== "free" || !freePhraseKey) return;
  const index = freeBrowsePhraseKeys.indexOf(freePhraseKey);
  const nextIndex = index + Number(offset);
  if (
    index < 0 ||
    nextIndex < 0 ||
    nextIndex >= freeBrowsePhraseKeys.length
  ) {
    return;
  }
  await startFreePhrase(freeBrowsePhraseKeys[nextIndex], {
    preserveBrowseList: true,
  });
}

async function transposeFreePhrase() {
  if (currentMode !== "free" || !freePhraseKey || !freeToneState) return;
  const transposition = drawNextTransposition(freeToneState);
  await loadPublicPhrase({
    phraseKey: freePhraseKey,
    transposition,
  });
}

function currentLickExercise() {
  return lickExerciseDeck[lickExerciseIndex] ?? null;
}

async function moveToNextLickExercise() {
  if (
    currentMode !== "lick-exercise" ||
    lickExerciseIndex < 0 ||
    !currentLickExercise()
  ) {
    return false;
  }
  const previousDeck = lickExerciseDeck;
  const previousIndex = lickExerciseIndex;
  const previousLick = currentLickExercise();
  const tools = await ensureLickExerciseTools();
  if (
    currentMode !== "lick-exercise" ||
    lickExerciseDeck !== previousDeck ||
    lickExerciseIndex !== previousIndex ||
    currentLickExercise() !== previousLick
  ) {
    return false;
  }
  if (lickExerciseIndex >= lickExerciseDeck.length - 1) {
    lickExerciseDeck = tools.shuffledLickDeck(
      tools.classifiedVeryTypicalLicks(),
      Math.random,
      previousLick.id,
    );
    lickExerciseIndex = 0;
  } else {
    lickExerciseIndex += 1;
  }
  lickExerciseNumber += 1;
  lickExerciseToneState = null;
  return loadCurrentLickExercise();
}

function setPlaybackState(playing) {
  isPlaying = playing;
  elements.replay.textContent = t(playing ? "audio.stop" : "game.replay");
  elements.replay.setAttribute("aria-pressed", String(playing));
}

function stopAllTones() {
  exerciseLaunchVersion += 1;
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
  audioRuntime.stopActiveSources();
  originalPlayer.stop();
  setPlaybackState(false);
  elements.setPhraseEnd.disabled = true;
}

function scheduleRoundTransition(callback) {
  if (roundAdvanceTimer !== null) {
    window.clearTimeout(roundAdvanceTimer);
  }
  roundAdvanceTimer = window.setTimeout(async () => {
    roundAdvanceTimer = null;
    await callback();
  }, ROUND_ADVANCE_DELAY_MS);
}

function restoreExerciseInput(message = null) {
  if (!exercise) return;
  if (currentMode === "rating") {
    acceptingInput = false;
    setQuickRatingEnabled(true);
    elements.feedback.className = "feedback";
    elements.feedback.textContent =
      message ?? t("rating.prompt");
    return;
  }
  if (currentMode === "review") {
    acceptingInput = false;
    elements.feedback.className = "feedback";
    elements.feedback.textContent =
      message ?? t("review.listenAdjust");
    return;
  }
  acceptingInput = exercise.currentIndex < exercise.notes.length;
  if (!acceptingInput) return;
  elements.feedback.className = "feedback";
  if (message) {
    elements.feedback.textContent = message;
  } else if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
  ) {
    elements.feedback.textContent = t("sudden.instructions");
  } else {
    elements.feedback.textContent = t("game.findNote", {
      current: exercise.currentIndex + 1,
      total: exercise.notes.length,
    });
  }
}

function flashPlayedKey(midi, delayMs, durationMs) {
  const key = elements.piano.querySelector(`[data-midi="${midi}"]`);
  if (!key) return;
  window.setTimeout(() => key.classList.add("active"), delayMs);
  window.setTimeout(() => key.classList.remove("active"), delayMs + durationMs);
}

function scheduleSequenceAudio(
  sequence,
  speedPercent,
  { flashFirstNote = false } = {},
) {
  const timeScale = 100 / speedPercent;
  sequence.notes.forEach((midi, index) => {
    const timing = sequence.timings[index];
    const startSeconds = timing.offset * timeScale;
    const durationSeconds = timing.duration * timeScale;
    playTone(midi, startSeconds, durationSeconds, index === 0);
    if (flashFirstNote && index === 0) {
      flashPlayedKey(
        midi,
        startSeconds * 1000,
        durationSeconds * 1000,
      );
    }
  });
  for (const chick of sequence.chicks ?? []) {
    playChick(chick.offset * timeScale);
  }
  for (const bassHit of sequence.bassHits ?? []) {
    playBass(
      bassHit.midi,
      bassHit.offset * timeScale,
      bassHit.duration * timeScale,
    );
  }
}

function previewPhraseEditorEvents(events) {
  const normalized = normalizeEditedPhraseEvents(events);
  if (!normalized) return 0;
  stopAllTones();
  acceptingInput = false;
  const firstOnset = normalized[0][1];
  const sequence = {
    notes: normalized.map(([midi]) => midi),
    timings: normalized.map((event) => ({
      offset: Math.max(0, event[1] - firstOnset),
      duration: event[2],
    })),
  };
  scheduleSequenceAudio(sequence, realSpeedPercent);
  const lastTiming = sequence.timings.at(-1);
  return Math.ceil(
    (lastTiming.offset + lastTiming.duration) *
      (100 / realSpeedPercent) *
      1000 +
      80,
  );
}

function playSequence({ guardInputBurst = false } = {}) {
  if (!exercise) return;
  stopAllTones();
  guardPlaybackFromInputBurst = guardInputBurst;
  setPlaybackState(true);
  exercise.playbackStartedAt = performance.now();
  elements.replay.disabled = false;
  if (currentMode === "rating") setQuickRatingEnabled(true);
  elements.setPhraseEnd.disabled =
    currentMode !== "rating" ||
    !exercise.quickRatingFullPreview ||
    !exercise.timings;
  acceptingInput = false;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = t("audio.listenCarefully");
  exercise.speedPercent = realSpeedPercent;
  scheduleSequenceAudio(exercise, exercise.speedPercent, {
    flashFirstNote: true,
  });
  const playbackDuration = exercisePlaybackDurationMs(exercise);

  playbackTimer = window.setTimeout(() => {
    playbackTimer = null;
    setPlaybackState(false);
    elements.setPhraseEnd.disabled = true;
    if (currentMode === "rating") {
      restoreExerciseInput();
      return;
    }
    if (currentMode === "review") {
      restoreExerciseInput();
      return;
    }
    acceptingInput = exercise.currentIndex < exercise.notes.length;
    if (
      currentMode === "challenge" &&
      challengeSession?.phase === "sudden-death"
    ) {
      elements.feedback.textContent = t("sudden.instructions");
    } else {
      elements.feedback.textContent = t("game.findNote", {
        current: exercise.currentIndex + 1,
        total: exercise.notes.length,
      });
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

function refreshPhraseSettingsFromLocal() {
  phraseSettings = mergePhraseSettings(
    DEFAULT_PHRASE_SETTINGS,
    localPhraseSettings,
  );
}

function currentResolvedPhraseSettings() {
  const source = exercise?.source;
  if (!source?.phraseKey || !Number.isFinite(source.fullPhraseNoteCount)) {
    return null;
  }
  return resolvePhraseSettings(
    phraseSettings[source.phraseKey],
    source.fullPhraseNoteCount,
  );
}

function phraseSettingsLocked() {
  return Boolean(
    currentMode === "challenge" &&
      challengeSession?.phase === "sudden-death" &&
      exercise?.executionStarted,
  );
}

function renderPhraseControls() {
  const settings = currentResolvedPhraseSettings();
  const visible = Boolean(
    developerMode &&
      settings &&
      exercise?.source?.kind === "transcription",
  );
  appRenderer.renderPhraseControls({
    visible,
    settings,
    locked: phraseSettingsLocked(),
  });
}

async function openPhraseEditorForPhrase(
  phraseKey,
  { origin = "exercise" } = {},
) {
  if (!developerMode || !phraseKey) return;
  if (origin === "exercise" && phraseSettingsLocked()) return;
  const openButton = origin === "workshop"
    ? elements.editRecordingWorkshopPhrase
    : elements.openPhraseEditor;
  phraseEditorTarget = null;
  stopAllTones();
  acceptingInput = false;
  openButton.disabled = true;
  try {
    const loaded = await loadPhraseCorpus(phraseKey);
    const stillCurrent = origin === "workshop"
      ? !elements.recordingWorkshopPanel.hidden &&
        recordingWorkshop?.selectedPhraseKey() === phraseKey
      : exercise?.source?.phraseKey === phraseKey;
    if (!stillCurrent || !developerMode) return;
    const originalEvents = loaded.solo.events.slice(
      loaded.phrase[0],
      loaded.phrase[1] + 1,
    );
    const storedEditedEvents = normalizeEditedPhraseEvents(
      phraseSettings[phraseKey]?.editedEvents,
    );
    const materialized = materializeLegacyPhraseEvents(
      originalEvents,
      phraseSettings[phraseKey],
    );
    phraseEditorTarget = {
      phraseKey,
      fullPhraseNoteCount:
        storedEditedEvents?.length ?? originalEvents.length,
      origin,
    };
    phraseEditor.open({
      editedEvents: materialized.events,
      originalEvents,
      performer: loaded.solo.performer,
      phrase: loaded.phrase[2],
      title: loaded.solo.title,
    });
  } catch (error) {
    const message = localizeError(
      error instanceof Error ? error.message : t("phrase.unavailable"),
    );
    if (origin === "workshop") {
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      elements.recordingWorkshopMessage.textContent = message;
    } else {
      elements.feedback.className = "feedback error";
      elements.feedback.textContent = message;
      restoreExerciseInput();
    }
  } finally {
    openButton.disabled = false;
    if (origin === "exercise") renderPhraseControls();
  }
}

async function openCurrentPhraseEditor() {
  const source = exercise?.source;
  if (!source?.phraseKey || source.kind !== "transcription") return;
  await openPhraseEditorForPhrase(source.phraseKey);
}

function savePhraseSettingsForKey(
  phraseKey,
  nextSettings,
  {
    editedEvents = phraseSettings[phraseKey]?.editedEvents,
    fullPhraseNoteCount,
    reloadCurrent = false,
  } = {},
) {
  if (
    !developerMode ||
    !phraseKey ||
    !Number.isFinite(fullPhraseNoteCount) ||
    (reloadCurrent && phraseSettingsLocked())
  ) {
    return false;
  }
  const normalized = resolvePhraseSettings(
    nextSettings,
    fullPhraseNoteCount,
  );
  const normalizedEditedEvents = normalizeEditedPhraseEvents(editedEvents);
  localPhraseSettings[phraseKey] = {
    notesMax: normalized.notesMax,
    ignoredShortestNotes: normalized.ignoredShortestNotes,
    ...(normalizedEditedEvents
      ? { editedEvents: normalizedEditedEvents }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  refreshPhraseSettingsFromLocal();
  writeJson(PHRASE_SETTINGS_KEY, localPhraseSettings);
  if (reloadCurrent && exercise?.source?.phraseKey === phraseKey) {
    renderPhraseControls();
    schedulePhraseSettingsReload();
  }
  return true;
}

function saveCurrentPhraseSettings(
  nextSettings,
  {
    editedEvents = phraseSettings[exercise?.source?.phraseKey]?.editedEvents,
    fullPhraseNoteCount = exercise?.source?.fullPhraseNoteCount,
  } = {},
) {
  const source = exercise?.source;
  if (
    !developerMode ||
    !source?.phraseKey ||
    !Number.isFinite(fullPhraseNoteCount) ||
    phraseSettingsLocked()
  ) {
    return false;
  }
  return savePhraseSettingsForKey(source.phraseKey, nextSettings, {
    editedEvents,
    fullPhraseNoteCount,
    reloadCurrent: true,
  });
}

function saveCurrentPhraseEvents(editedEvents, originalEvents) {
  const normalizedOriginal = normalizeEditedPhraseEvents(originalEvents);
  const normalizedEdited = normalizeEditedPhraseEvents(editedEvents);
  const target = phraseEditorTarget ?? {
    phraseKey: exercise?.source?.phraseKey,
    fullPhraseNoteCount: exercise?.source?.fullPhraseNoteCount,
    origin: "exercise",
  };
  const current = resolvePhraseSettings(
    phraseSettings[target.phraseKey],
    target.fullPhraseNoteCount,
  );
  if (!normalizedOriginal || !target.phraseKey) return false;
  const fullPhraseNoteCount =
    normalizedEdited?.length ?? normalizedOriginal.length;
  const wasUsingFullPhrase =
    current.notesMax >= current.fullPhraseNoteCount;
  const notesMax = wasUsingFullPhrase
    ? fullPhraseNoteCount
    : Math.min(
        current.notesMax - current.ignoredShortestNotes,
        fullPhraseNoteCount,
      );
  const saved = savePhraseSettingsForKey(
    target.phraseKey,
    {
      notesMax,
      ignoredShortestNotes: 0,
    },
    {
      editedEvents: normalizedEdited,
      fullPhraseNoteCount,
      reloadCurrent: target.origin === "exercise",
    },
  );
  phraseEditorTarget = null;
  return saved;
}

function adjustCurrentPhraseSettings(field, delta) {
  const current = currentResolvedPhraseSettings();
  if (!current) return;
  const next = {
    notesMax: current.notesMax,
    ignoredShortestNotes: current.ignoredShortestNotes,
  };
  next[field] += Number(delta);
  saveCurrentPhraseSettings(next);
}

function schedulePhraseSettingsReload() {
  if (!exercise?.source?.phraseKey) return;
  stopAllTones();
  if (currentMode === "rating") setQuickRatingEnabled(false);
  acceptingInput = false;
  elements.setPhraseEnd.disabled = true;
  elements.feedback.className = "feedback";
  elements.feedback.textContent =
    currentMode === "rating"
      ? t("rating.adjustedPreview")
      : t("game.getReady");
  if (phraseAdjustmentTimer !== null) {
    window.clearTimeout(phraseAdjustmentTimer);
  }
  phraseAdjustmentTimer = window.setTimeout(async () => {
    phraseAdjustmentTimer = null;
    await reloadCurrentPhraseWithSettings();
  }, PHRASE_ADJUSTMENT_RELOAD_DELAY_MS);
}

async function reloadCurrentPhraseWithSettings() {
  const phraseKey = exercise?.source?.phraseKey;
  if (!phraseKey) return;
  const catalogPhrase = catalogMap().get(phraseKey);
  const transpositionRange =
    catalogPhrase?.transpositionRange ??
    exercise.source.transpositionRange;
  let transposition = jazzTranspositionInRange(
    exercise?.transposition ?? 0,
    transpositionRange,
  );
  let transpositionState = exercise?.transpositionState ?? null;

  if (currentMode === "challenge" && challengeSession) {
    const phraseState = challengeSession.phrases.find(
      (phrase) => phrase.phraseKey === phraseKey,
    );
    if (phraseState) {
      retargetTranspositionState(phraseState, transpositionRange);
      phraseState.noteCount =
        Number(catalogPhrase?.noteCount) || phraseState.noteCount;
      transposition = jazzTranspositionInRange(
        challengeSession.currentTransposition,
        transpositionRange,
      );
      challengeSession.currentTransposition = transposition;
      persistChallengeSession();
    }
  } else if (currentMode === "free" && freeToneState) {
    retargetTranspositionState(freeToneState, transpositionRange);
    transposition = jazzTranspositionInRange(
      exercise.transposition,
      transpositionRange,
    );
  } else if (transpositionState) {
    retargetTranspositionState(
      transpositionState,
      transpositionRange,
    );
    transposition = jazzTranspositionInRange(
      exercise.transposition,
      transpositionRange,
    );
  }

  if (currentMode === "challenge" || currentMode === "free") {
    await loadPublicPhrase({ phraseKey, transposition });
    return;
  }
  await startExercise({
    targetPhraseKeyOverride: phraseKey,
    transpositionOverride: transposition,
    transpositionStateOverride: transpositionState,
    quickRatingFullPreview: false,
  });
}

function setQuickRatingPhraseEnd() {
  if (
    currentMode !== "rating" ||
    !exercise?.quickRatingFullPreview ||
    !isPlaying ||
    !Array.isArray(exercise.timings) ||
    !Number.isFinite(exercise.playbackStartedAt)
  ) {
    return;
  }
  const timeScale = 100 / exercise.speedPercent;
  const phraseSeconds =
    (performance.now() - exercise.playbackStartedAt) / 1000 / timeScale;
  const startedNotes = exercise.timings.filter(
    ({ offset }) => offset <= phraseSeconds + Number.EPSILON,
  ).length;
  const notesMax = clamp(
    startedNotes || 1,
    1,
    exercise.source.fullPhraseNoteCount,
  );
  const current = currentResolvedPhraseSettings();
  saveCurrentPhraseSettings({
    notesMax,
    ignoredShortestNotes: current?.ignoredShortestNotes ?? 0,
  });
}

function setQuickRatingEnabled(enabled) {
  for (const button of elements.quickRatingButtons) {
    button.disabled = !enabled;
  }
}

function renderRatingSession() {
  const {
    count,
    distribution,
    newScopes,
    protocol,
  } = ratingWorkflow.sessionSummary();
  appRenderer.renderRatingSession({
    count,
    distribution,
    newScopeCount: newScopes.length,
    protocol,
  });
}

function currentPhraseRating() {
  const phraseKey = exercise?.source?.phraseKey;
  if (!phraseKey) return 0;
  const sourceRating = Number(exercise.source.rating);
  return ratingWorkflow.ratingFor(
    phraseKey,
    Number.isFinite(sourceRating) ? sourceRating : 0,
  );
}

function renderStarRating(element, rating) {
  const isRealPhrase = Boolean(exercise?.source?.phraseKey);
  appRenderer.renderStarRating(element, {
    rating,
    visible:
      developerMode &&
      currentMode !== "rating" &&
      isRealPhrase,
  });
}

function renderRatingControls() {
  const rating = currentPhraseRating();
  renderStarRating(elements.exerciseRating, rating);
}

function setPhraseRating(
  rating,
  { origin = "manual", session = false } = {},
) {
  if (!developerMode) return false;
  const source = exercise?.source;
  if (!source?.phraseKey) return false;
  const safeRating = clamp(Math.round(Number(rating) || 0), 1, 3);
  const storedRating = session
    ? ratingWorkflow.rateForSession(source, safeRating)
    : ratingWorkflow.rate(source, safeRating, { origin });
  if (!storedRating) return false;
  exercise.source = {
    ...source,
    rating: safeRating,
    ratingScope: "phrase",
  };
  writeJson(RATINGS_KEY, ratingWorkflow.localRatings());
  renderRatingControls();
  renderRatingSession();
  return true;
}

async function setRatingFromButton(event) {
  const rating = Number(event.currentTarget.dataset.rating);
  const changed = setPhraseRating(rating);
  if (changed && currentMode === "review" && rating !== 3) {
    await refreshReviewAfterRating();
  }
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
  stopAllTones();
  if (!setPhraseRating(rating, { session: true })) return;
  const sessionCount = ratingWorkflow.sessionSummary().count;
  setQuickRatingEnabled(false);
  renderRatingSession();
  elements.feedback.className = "feedback success";
  elements.feedback.textContent =
    sessionCount % RATING_REPORT_INTERVAL === 0
      ? t("rating.checkpointEntered", {
          count: sessionCount,
        })
      : t("rating.recorded", { rating });
  quickRatingAdvanceTimer = window.setTimeout(() => {
    quickRatingAdvanceTimer = null;
    startExercise();
  }, QUICK_RATING_ADVANCE_DELAY_MS);
}

function undoLastRating() {
  const last = ratingWorkflow.undoLastSessionRating();
  if (!last) return;
  stopAllTones();
  writeJson(RATINGS_KEY, ratingWorkflow.localRatings());
  renderRatingSession();
  elements.feedback.className = "feedback";
  elements.feedback.textContent = t("rating.undone");
  setQuickRatingEnabled(true);
}

function cancelPhraseAdjustmentReload() {
  if (phraseAdjustmentTimer !== null) {
    window.clearTimeout(phraseAdjustmentTimer);
    phraseAdjustmentTimer = null;
  }
}

async function preloadExerciseAssets(generated) {
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
}

function loadRecordingWorkshopPhrase(phraseKey) {
  return loadSequence({
    maxNotes: REAL_MAX_NOTES,
    selectedPerformers: ALL_PERFORMER_NAMES,
    phraseRatings: effectivePhraseRatings(),
    phraseSettings,
    minimumRating: 3,
    targetPhraseKey: phraseKey,
    transpositionOverride: 0,
  });
}

async function playRecordingWorkshopPhrase(generated) {
  const playbackVersion = exerciseLaunchVersion;
  getAudioContext();
  await preloadExerciseAssets(generated);
  if (
    playbackVersion !== exerciseLaunchVersion ||
    elements.recordingWorkshopPanel.hidden
  ) {
    return false;
  }
  scheduleSequenceAudio(generated, 100);
  return true;
}

function scheduleInitialExercisePlayback(enteringGameMode) {
  elements.replay.disabled = enteringGameMode;
  if (enteringGameMode) {
    acceptingInput = false;
    elements.feedback.className = "feedback";
    elements.feedback.textContent = t("game.getReady");
    gameModeStartTimer = window.setTimeout(() => {
      gameModeStartTimer = null;
      playSequence();
    }, GAME_MODE_START_DELAY_MS);
    return;
  }
  playSequence();
}

function rememberCatalogOverride(generated) {
  const source = generated?.meta?.source;
  if (
    !source?.phraseKey ||
    !Array.isArray(source.transpositionRange) ||
    !Number.isFinite(source.noteCount)
  ) {
    return;
  }
  catalogOverrides[source.phraseKey] = {
    noteCount: source.noteCount,
    transpositionRange: [...source.transpositionRange],
  };
}

function synchronizePublicPhraseState(generated) {
  const source = generated?.meta?.source;
  if (!source?.phraseKey || !Array.isArray(source.transpositionRange)) {
    return;
  }
  rememberCatalogOverride(generated);
  if (currentMode === "challenge" && challengeSession) {
    const phraseState = challengeSession.phrases.find(
      ({ phraseKey }) => phraseKey === source.phraseKey,
    );
    if (phraseState) {
      retargetTranspositionState(
        phraseState,
        source.transpositionRange,
      );
      phraseState.noteCount = source.noteCount;
      challengeSession.currentTransposition = source.transposition;
      persistChallengeSession();
    }
  } else if (currentMode === "free" && freeToneState) {
    retargetTranspositionState(
      freeToneState,
      source.transpositionRange,
    );
  }
}

async function prepareAndLaunchExercise({
  configureMode,
  createState,
  generate,
  onError,
  render,
  resolvePlan,
}) {
  cancelPhraseAdjustmentReload();
  stopAllTones();
  const launchVersion = exerciseLaunchVersion;
  getAudioContext();
  const plan = resolvePlan();
  if (!plan) return false;
  configureMode(plan);
  const enteringGameMode =
    !document.body.classList.contains("game-mode");

  let generated;
  try {
    generated = await generate(plan);
  } catch (error) {
    if (launchVersion !== exerciseLaunchVersion) return false;
    const message = localizeError(
      error instanceof Error ? error.message : t("phrase.noneAvailable"),
    );
    onError(message, plan);
    return false;
  }

  if (launchVersion !== exerciseLaunchVersion) return false;
  if (enteringGameMode) {
    await enterGameMode();
    if (launchVersion !== exerciseLaunchVersion) return false;
  }
  await preloadExerciseAssets(generated);
  if (launchVersion !== exerciseLaunchVersion) return false;
  exercise = createState(generated, plan);
  render(generated, plan);
  scheduleInitialExercisePlayback(enteringGameMode);
  return true;
}

async function loadPublicPhrase({ phraseKey, transposition }) {
  const isChallenge = currentMode === "challenge";
  const isFree = currentMode === "free";
  return prepareAndLaunchExercise({
    resolvePlan: () => ({
      isChallenge,
      isFree,
      phraseKey,
      transposition,
    }),
    configureMode() {
      elements.suddenDeathModal.hidden = true;
      renderSpeedSetting();
      document.body.classList.toggle("challenge-mode", isChallenge);
      document.body.classList.toggle("free-mode", isFree);
      document.body.classList.remove(
        "lick-exercise-mode",
        "rating-mode",
        "review-mode",
      );
      document.body.classList.toggle(
        "sudden-death-mode",
        isChallenge && challengeSession?.phase === "sudden-death",
      );
    },
    generate() {
      return loadSequence({
        maxNotes: REAL_MAX_NOTES,
        selectedPerformers: ALL_PERFORMER_NAMES,
        phraseRatings: effectivePhraseRatings(),
        phraseSettings,
        minimumRating: isChallenge ? 3 : 0,
        targetPhraseKey: phraseKey,
        transpositionOverride: transposition,
      });
    },
    createState(generated) {
      synchronizePublicPhraseState(generated);
      return createExerciseState(generated, {
        speedPercent: realSpeedPercent,
      });
    },
    render(generated) {
      elements.kicker.textContent =
        isFree
          ? t("mode.free")
          : challengeSession?.phase === "sudden-death"
            ? t("mode.suddenDeath")
            : t("mode.challenge");
      elements.exerciseTitle.textContent =
        isFree
          ? t("game.explorePhrase")
          : challengeSession?.phase === "sudden-death"
            ? t("game.firstTry")
            : t("game.listenFind");
      renderSource(generated.meta.source);
      elements.nextExercise.hidden = true;
      elements.nextExercise.disabled = true;
      elements.ratingWorkspace.hidden = true;
      elements.freeTranspose.hidden = !isFree;
      if (isFree) renderFreeProgress();
      else renderChallengeProgress();
      renderFavoriteButton();
      renderRatingControls();
      renderPhraseControls();
      appRenderer.buildPiano(
        generated.keyboard,
        handlePianoInput,
      );
      markReferenceKey();
    },
    onError(message) {
      elements.sessionStatus.textContent = message;
      elements.feedback.className = "feedback error";
      elements.feedback.textContent = message;
    },
  });
}

async function loadCurrentLickExercise() {
  const lick = currentLickExercise();
  if (!lick || currentMode !== "lick-exercise") return false;
  const tools = await ensureLickExerciseTools();
  if (lick !== currentLickExercise() || currentMode !== "lick-exercise") {
    return false;
  }
  if (!lickExerciseToneState) {
    lickExerciseToneState = createTranspositionState(
      jazzTranspositionRangeForNotes(lick.notes),
    );
  }
  const transposition = drawNextTransposition(lickExerciseToneState);
  const number = lickExerciseNumber;

  return prepareAndLaunchExercise({
    resolvePlan: () =>
      currentMode === "lick-exercise" &&
      currentLickExercise() === lick
        ? { lick, number, transposition }
        : null,
    configureMode() {
      elements.suddenDeathModal.hidden = true;
      renderSpeedSetting();
      document.body.classList.remove(
        "challenge-mode",
        "free-mode",
        "rating-mode",
        "review-mode",
        "sudden-death-mode",
      );
      document.body.classList.add("lick-exercise-mode");
    },
    generate(plan) {
      return tools.createLickExerciseSequence(
        plan.lick,
        plan.transposition,
      );
    },
    createState(generated) {
      return createExerciseState(generated, {
        speedPercent: realSpeedPercent,
        transpositionState: lickExerciseToneState,
      });
    },
    render(generated, plan) {
      const source = generated.meta.source;
      elements.kicker.textContent = t("mode.lickExercise");
      elements.exerciseTitle.textContent = t("lickExercise.find");
      renderSource(source);
      elements.nextExercise.hidden = true;
      elements.nextExercise.disabled = true;
      elements.ratingWorkspace.hidden = true;
      elements.freeTranspose.hidden = true;
      appRenderer.renderLickExerciseProgress({
        current: plan.number,
        patternId: source.patternId,
      });
      renderFavoriteButton();
      renderRatingControls();
      renderPhraseControls();
      appRenderer.buildPiano(generated.keyboard, handlePianoInput);
      markReferenceKey();
    },
    onError(message) {
      elements.feedback.className = "feedback error";
      elements.feedback.textContent = message;
    },
  });
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

async function startExercise({
  targetPhraseKeyOverride = null,
  transpositionOverride = null,
  transpositionStateOverride = null,
  quickRatingFullPreview = null,
} = {}) {
  const isRatingMode = currentMode === "rating";
  const isReviewMode = currentMode === "review";
  if (!isRatingMode && !isReviewMode) return;
  return prepareAndLaunchExercise({
    resolvePlan() {
      const protocol = currentRatingProtocol();
      const targetPhraseKey =
        targetPhraseKeyOverride ??
        (isRatingMode
          ? pickRatingPhrase({
              phraseRatings: ratingWorkflow.phraseRatings(),
              fixedScopes: ratingWorkflow.fixedScopes(),
              selectedPerformers: ALL_PERFORMER_NAMES,
              sessionHistory: ratingWorkflow.sessionHistory(),
            })
          : ratingWorkflow.reviewState().currentKey);
      if (isRatingMode && !targetPhraseKey) {
        elements.feedback.className = "feedback success";
        elements.feedback.textContent = t("rating.allCovered");
        renderRatingSession();
        return null;
      }
      if (isReviewMode && !targetPhraseKey) {
        elements.feedback.className = "feedback success";
        elements.feedback.textContent = t("review.empty");
        renderReviewProgress();
        return null;
      }
      return {
        protocol,
        targetPhraseKey,
        useFullQuickRatingPreview:
          isRatingMode &&
          (quickRatingFullPreview ?? targetPhraseKeyOverride === null),
      };
    },
    configureMode() {
      document.body.classList.remove("lick-exercise-mode");
      document.body.classList.toggle("rating-mode", isRatingMode);
      document.body.classList.toggle("review-mode", isReviewMode);
      saveSettings();
    },
    generate(plan) {
      return loadSequence({
        maxNotes: REAL_MAX_NOTES,
        selectedPerformers: ALL_PERFORMER_NAMES,
        phraseRatings: plan.protocol.effectiveRatings,
        phraseSettings,
        minimumRating: isRatingMode ? 0 : 3,
        targetPhraseKey: plan.targetPhraseKey,
        fullPhrase: plan.useFullQuickRatingPreview,
        transpositionOverride: transpositionOverride ?? 0,
      });
    },
    createState(generated, plan) {
      if (!plan.useFullQuickRatingPreview) {
        rememberCatalogOverride(generated);
      }
      const generatedTransposition =
        generated.meta.source.transposition ?? 0;
      const originalNotes = originalExerciseNotes({
        notes: generated.notes,
        transposition: generatedTransposition,
      });
      const transpositionRange =
        generated.meta.source.transpositionRange ??
        jazzTranspositionRangeForNotes(originalNotes);
      const transpositionState = transpositionStateOverride
        ? retargetTranspositionState(
            transpositionStateOverride,
            transpositionRange,
          )
        : createTranspositionState(transpositionRange, {
            initialTransposition: generatedTransposition,
          });
      return createExerciseState(generated, {
        quickRatingFullPreview: plan.useFullQuickRatingPreview,
        speedPercent: realSpeedPercent,
        transpositionState,
      });
    },
    render(generated) {
      elements.kicker.textContent =
        isRatingMode
          ? t("developer.quickRating")
          : t("mode.review");
      elements.exerciseTitle.textContent =
        isRatingMode
          ? t("rating.listenRate")
          : t("review.listenAdjust");
      renderSource(generated.meta.source);
      elements.nextExercise.hidden = isReviewMode;
      elements.nextExercise.disabled = false;
      elements.nextExercise.textContent = t(
        isRatingMode ? "common.skip" : "common.next",
      );
      elements.ratingWorkspace.hidden = !isRatingMode;
      elements.setPhraseEnd.disabled = true;
      setQuickRatingEnabled(false);
      if (isReviewMode) renderReviewProgress();
      else elements.challengeProgress.hidden = true;
      renderRatingControls();
      renderPhraseControls();
      appRenderer.buildPiano(
        generated.keyboard,
        handlePianoInput,
      );
      markReferenceKey();
      if (isRatingMode) renderRatingSession();
    },
    onError(message) {
      elements.feedback.className = "feedback error";
      elements.feedback.textContent = message;
    },
  });
}

function renderSource(source) {
  window.clearTimeout(phraseIdCopyTimer);
  phraseIdCopyTimer = null;
  appRenderer.renderSource(source, {
    developerMode,
    mode: currentMode,
    sourceLabel: sourceLabel(source),
  });
  originalPlayer.renderSource(source);
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
  elements.copyPhraseId.textContent = t(
    copied ? "source.copied" : "source.copyFailed",
  );
  window.clearTimeout(phraseIdCopyTimer);
  phraseIdCopyTimer = window.setTimeout(() => {
    phraseIdCopyTimer = null;
    elements.copyPhraseId.textContent = t("source.copy");
  }, 1_500);
}

function togglePlayback() {
  if (!exercise) return;
  if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death" &&
    exercise.executionStarted
  ) {
    elements.feedback.className = "feedback";
    elements.feedback.textContent = t("playback.suddenLocked");
    return;
  }
  if (isPlaying) {
    stopAllTones();
    resetExerciseProgress();
    restoreExerciseInput(t("playback.stopped"));
    return;
  }
  resetExerciseProgress();
  playSequence();
}

function resetExerciseProgress() {
  if (!resetExerciseState(exercise)) return;
  acceptingInput = false;
  elements.replay.disabled = false;
  renderPhraseControls();
}

function restartAfterMistake() {
  resetExerciseProgress();
  elements.feedback.className = "feedback error";
  elements.feedback.textContent = t("playback.mistake");
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    playSequence({ guardInputBurst: true });
  }, WRONG_NOTE_REPLAY_DELAY_MS);
}

function failSuddenDeath() {
  acceptingInput = false;
  elements.replay.disabled = true;
  elements.feedback.className = "feedback error";
  elements.feedback.textContent = t("playback.suddenFailed");
  resolveSuddenDeath(challengeSession, false);
  persistChallengeSession();
  scheduleRoundTransition(async () => {
    await loadChallengeRound();
  });
}

function handlePianoInput(midi, key) {
  const inputAt = performance.now();
  const quietBeforeInput = inputAt - lastPianoInputAt;
  lastPianoInputAt = inputAt;
  if (guardPlaybackFromInputBurst) {
    if (quietBeforeInput < INPUT_BURST_QUIET_MS) return;
    guardPlaybackFromInputBurst = false;
  }
  if (isPlaying || originalPlayer.isPlaying()) {
    stopAllTones();
    restoreExerciseInput(t("playback.interrupted"));
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
    renderPhraseControls();
    elements.feedback.className = "feedback";
    elements.feedback.textContent = t("playback.attemptStarted");
  }

  const input = enterExerciseMidi(exercise, midi);
  if (!input.correct) {
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

  key.classList.add("correct-key");
  window.setTimeout(() => key.classList.remove("correct-key"), 280);
  if (input.complete) {
    finishExercise();
    return;
  }

  elements.feedback.className = "feedback success";
  elements.feedback.textContent =
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
      ? t("playback.progress", {
          current: exercise.currentIndex,
          total: exercise.notes.length,
        })
      : t("playback.correct", {
          current: exercise.currentIndex + 1,
          total: exercise.notes.length,
        });
}

function renderCompletedChallenge(phrases) {
  appRenderer.renderCompletedChallenge(phrases, {
    isFavorite,
    onToggleFavorite: toggleFavoritePhrase,
  });
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
  removeStoredValue(CHALLENGE_SESSION_KEY);
  renderCompletedChallenge(lastCompletedChallengePhrases);
  scheduleRoundTransition(() => {
    elements.challengeCompleteModal.hidden = false;
    window.requestAnimationFrame(() => elements.finishNewChallenge.focus());
  });
}

function finishExercise() {
  acceptingInput = false;
  elements.feedback.className = "feedback success";
  if (currentMode === "challenge" && challengeSession?.phase === "training") {
    elements.feedback.textContent = t("finish.toneValidated");
    advanceTraining(challengeSession);
    persistChallengeSession();
    scheduleRoundTransition(async () => {
      if (challengeSession.phase === "transition") {
        showSuddenDeathTransition();
      } else {
        await loadChallengeRound();
      }
    });
    return;
  }
  if (
    currentMode === "challenge" &&
    challengeSession?.phase === "sudden-death"
  ) {
    elements.feedback.textContent = t("finish.suddenValidated");
    resolveSuddenDeath(challengeSession, true);
    if (challengeSession.phase === "complete") {
      completeChallenge();
      return;
    }
    persistChallengeSession();
    scheduleRoundTransition(async () => {
      await loadChallengeRound();
    });
    return;
  }
  if (currentMode === "free") {
    elements.feedback.textContent = t("finish.free");
    elements.replay.disabled = false;
    return;
  }
  if (currentMode === "lick-exercise") {
    elements.feedback.textContent = t("finish.lickExercise");
    elements.replay.disabled = true;
    scheduleRoundTransition(async () => {
      await moveToNextLickExercise();
    });
    return;
  }
}

function goToNextExercise() {
  if (currentMode === "lick-exercise") return;
  void startExercise();
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

function exportData() {
  download(
    `dictee-musicale-donnees-${new Date().toISOString().slice(0, 10)}.csv`,
    createDataExportCsv({
      phraseRatings: ratingWorkflow.phraseRatings(),
      phraseSettings,
      phrasesByKey: catalogMap(),
      protocol: currentRatingProtocol(),
      protocolVersion: RATING_PROTOCOL_VERSION,
      recordingValidations,
      solosById: new Map(
        WJAZZD_SOLO_INDEX.map((solo) => [solo.id, solo]),
      ),
    }),
    "text/csv;charset=utf-8",
  );
}

async function enterGameMode() {
  await appShell.enterGameMode({
    lockOrientation: currentMode !== "rating",
  });
}

async function leaveGameMode(
  destination = currentMode === "free" ? "favorites" : "home",
) {
  const leavingLickExercise = currentMode === "lick-exercise";
  phraseEditor.close({ restoreFocus: false });
  cancelPhraseAdjustmentReload();
  stopAllTones();
  elements.suddenDeathModal.hidden = true;
  elements.challengeCompleteModal.hidden = true;
  acceptingInput = false;
  await appShell.leaveGameMode();
  exercise = null;
  if (leavingLickExercise) resetLickExerciseSession();
  if (destination === "favorites") showFavorites();
  else showHome();
}

function toggleGameMode() {
  if (appShell.isGameModeActive()) {
    leaveGameMode();
  } else {
    enterGameMode();
  }
}

bindAppEvents(
  elements,
  {
    adjustCurrentPhraseSettings,
    adjustRecordingOffset,
    closePhraseEditor: () => phraseEditor.close(),
    closeRecordingWorkshop,
    closeRecordingPlayer: originalPlayer.close,
    copyCurrentPhraseId,
    editSelectedRecordingWorkshopPhrase,
    exportData,
    goToNextExercise,
    isRatingModeActive: () => currentMode === "rating",
    launchSuddenDeath,
    leaveGameMode,
    markRecordingUnavailable,
    moveFreePhrase,
    moveReviewPhrase,
    openCurrentPhraseEditor,
    openLickExplorer,
    openRecordingWorkshop,
    playSelectedRecordingWorkshopPhrase,
    previewRecordingWorkshop,
    rejectRecordingWorkshop,
    resumeChallenge,
    selectRecordingWorkshopCandidate,
    selectRecordingWorkshopSolo,
    setDeveloperMode,
    setQuickRating,
    setQuickRatingPhraseEnd,
    setRatingFromButton,
    showFavorites,
    showHome,
    startLickExercise,
    startMode,
    startNewChallenge,
    syncGameSpeed,
    toggleCurrentFavorite,
    toggleGameMode,
    toggleOriginalPlayback: originalPlayer.toggle,
    togglePlayback,
    transposeFreePhrase,
    undoLastRating,
    useManualRecordingCandidate,
    verifyRecordingWorkshop,
  },
  document,
);

function initializeApp() {
  loadSettings();
  showHome();
  appShell.setUp();
}

initializeApp();

if (
  globalThis.__DICTEE_MUSICALE_TEST__ &&
  typeof globalThis.__DICTEE_MUSICALE_TEST__ === "object"
) {
  globalThis.__DICTEE_MUSICALE_TEST__.snapshot = () => ({
    acceptingInput,
    challengeSession: challengeSession
      ? structuredClone(challengeSession)
      : null,
    currentMode,
    developerMode,
    exercise: exercise
      ? {
          ...exercise,
          notes: [...exercise.notes],
          timings: exercise.timings?.map((timing) => ({ ...timing })),
          source: { ...exercise.source },
        }
      : null,
    freePhraseKey,
    freeBrowsePhraseKeys: [...freeBrowsePhraseKeys],
    freeToneState: freeToneState
      ? structuredClone(freeToneState)
      : null,
    isOriginalPlaying: originalPlayer.isPlaying(),
    isPlaying,
    lickExercise: lickExerciseDeck.length
      ? {
          currentId: currentLickExercise()?.id ?? null,
          deckIds: lickExerciseDeck.map(({ id }) => id),
          index: lickExerciseIndex,
          number: lickExerciseNumber,
          toneState: lickExerciseToneState
            ? structuredClone(lickExerciseToneState)
            : null,
          total: lickExerciseDeck.length,
        }
      : null,
    lickExplorer: lickExplorer?.snapshot() ?? null,
    phraseEditorOpen: phraseEditor.isOpen,
  });
}
