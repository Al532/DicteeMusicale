/**
 * Resolve every DOM node used by the application.
 *
 * @param {Document} documentObject
 * @returns {Record<string, Element | NodeListOf<Element>>}
 */
export function queryAppElements(documentObject) {
  return {
    homePanel: documentObject.querySelector("#home-panel"),
    favoritesPanel: documentObject.querySelector("#favorites-panel"),
    startChallenge: documentObject.querySelector("#start-challenge"),
    resumeChallenge: documentObject.querySelector("#resume-challenge"),
    newChallenge: documentObject.querySelector("#new-challenge"),
    sessionStatus: documentObject.querySelector("#session-status"),
    openFavorites: documentObject.querySelector("#open-favorites"),
    closeFavorites: documentObject.querySelector("#close-favorites"),
    favoritesList: documentObject.querySelector("#favorites-list"),
    favoritesEmpty: documentObject.querySelector("#favorites-empty"),
    favoriteToggle: documentObject.querySelector("#favorite-toggle"),
    freeTranspose: documentObject.querySelector("#free-transpose"),
    challengeProgress: documentObject.querySelector("#challenge-progress"),
    progressTitle: documentObject.querySelector("#progress-title"),
    progressDetail: documentObject.querySelector("#progress-detail"),
    progressDots: documentObject.querySelector("#progress-dots"),
    sourceSummary: documentObject.querySelector("#source-summary"),
    suddenDeathModal: documentObject.querySelector("#sudden-death-modal"),
    startSuddenDeath: documentObject.querySelector("#start-sudden-death"),
    challengeCompleteModal: documentObject.querySelector(
      "#challenge-complete-modal",
    ),
    completedPhrases: documentObject.querySelector("#completed-phrases"),
    finishNewChallenge: documentObject.querySelector(
      "#finish-new-challenge",
    ),
    finishHome: documentObject.querySelector("#finish-home"),
    gameSpeed: documentObject.querySelector("#game-speed"),
    gameSpeedOutput: documentObject.querySelector("#game-speed-output"),
    gameSpeedSetting: documentObject.querySelector("#game-speed-setting"),
    startRating: documentObject.querySelector("#start-rating"),
    startReview: documentObject.querySelector("#start-review"),
    developerMode: documentObject.querySelector("#developer-mode"),
    developerOnly: documentObject.querySelectorAll("[data-developer-only]"),
    ratingWorkspace: documentObject.querySelector("#rating-workspace"),
    setPhraseEnd: documentObject.querySelector("#set-phrase-end"),
    ratingSessionSummary: documentObject.querySelector(
      "#rating-session-summary",
    ),
    ratingCoverageSummary: documentObject.querySelector(
      "#rating-coverage-summary",
    ),
    undoRating: documentObject.querySelector("#undo-rating"),
    quickRatingButtons: documentObject.querySelectorAll(
      "[data-quick-rating]",
    ),
    nextExercise: documentObject.querySelector("#next-exercise"),
    replay: documentObject.querySelector("#replay"),
    feedback: documentObject.querySelector("#feedback"),
    kicker: documentObject.querySelector("#exercise-kicker"),
    exerciseTitle: documentObject.querySelector("#exercise-title"),
    piano: documentObject.querySelector("#piano"),
    exportData: documentObject.querySelector("#export-data"),
    installButton: documentObject.querySelector("#install-button"),
    iosInstallModal: documentObject.querySelector("#ios-install-modal"),
    closeIosInstall: documentObject.querySelector("#close-ios-install"),
    fullscreenButton: documentObject.querySelector("#fullscreen-button"),
    exitPortraitMode: documentObject.querySelector("#exit-portrait-mode"),
    sourceLine: documentObject.querySelector("#source-line"),
    sourceDetails: documentObject.querySelector("#source-details"),
    phraseReference: documentObject.querySelector("#phrase-reference"),
    phraseId: documentObject.querySelector("#phrase-id"),
    copyPhraseId: documentObject.querySelector("#copy-phrase-id"),
    sourceLink: documentObject.querySelector("#source-link"),
    audioSourceLink: documentObject.querySelector("#audio-source-link"),
    originalControls: documentObject.querySelector("#original-controls"),
    playOriginal: documentObject.querySelector("#play-original"),
    transposeOriginalControl: documentObject.querySelector(
      "#transpose-original-control",
    ),
    transposeOriginal: documentObject.querySelector("#transpose-original"),
    recordingModal: documentObject.querySelector("#recording-modal"),
    recordingTitle: documentObject.querySelector("#recording-title"),
    recordingPlayer: documentObject.querySelector("#recording-player"),
    closeRecording: documentObject.querySelector("#close-recording"),
    recordingVersionControl: documentObject.querySelector(
      "#recording-version-control",
    ),
    recordingVersion: documentObject.querySelector("#recording-version"),
    recordingExternalLink: documentObject.querySelector(
      "#recording-external-link",
    ),
    exerciseRating: documentObject.querySelector("#exercise-rating"),
    phraseAdjustments: documentObject.querySelector("#phrase-adjustments"),
    phraseLengthDecrease: documentObject.querySelector(
      "#phrase-length-decrease",
    ),
    phraseLengthIncrease: documentObject.querySelector(
      "#phrase-length-increase",
    ),
    phraseLengthOutput: documentObject.querySelector("#phrase-length-output"),
    shortNotesDecrease: documentObject.querySelector(
      "#short-notes-decrease",
    ),
    shortNotesIncrease: documentObject.querySelector(
      "#short-notes-increase",
    ),
    shortNotesOutput: documentObject.querySelector("#short-notes-output"),
    reviewNavigation: documentObject.querySelector("#review-navigation"),
    reviewPrevious: documentObject.querySelector("#review-previous"),
    reviewNext: documentObject.querySelector("#review-next"),
    reviewCounter: documentObject.querySelector("#review-counter"),
  };
}

/**
 * Bind the application's DOM contract to caller-provided actions.
 *
 * The action object deliberately contains no application implementation. Its
 * methods are invoked with the same values or events as the former inline
 * listeners in app.js.
 *
 * @param {ReturnType<typeof queryAppElements>} elements
 * @param {object} actions
 * @param {Document} documentObject
 * @returns {() => void} An idempotent listener cleanup function.
 */
export function bindAppEvents(elements, actions, documentObject) {
  const removers = [];

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }

  listen(elements.gameSpeed, "input", () =>
    actions.syncGameSpeed(elements.gameSpeed.value),
  );
  listen(elements.startRating, "click", () => actions.startMode("rating"));
  listen(elements.startReview, "click", () => actions.startMode("review"));
  listen(elements.startChallenge, "click", () => actions.startNewChallenge());
  listen(elements.resumeChallenge, "click", () => actions.resumeChallenge());
  listen(elements.newChallenge, "click", () => actions.startNewChallenge());
  listen(elements.openFavorites, "click", () => actions.showFavorites());
  listen(elements.closeFavorites, "click", () => actions.showHome());
  listen(elements.favoriteToggle, "click", () =>
    actions.toggleCurrentFavorite(),
  );
  listen(elements.freeTranspose, "click", () =>
    actions.transposeFreePhrase(),
  );
  listen(elements.startSuddenDeath, "click", () =>
    actions.launchSuddenDeath(),
  );
  listen(elements.finishNewChallenge, "click", () =>
    actions.startNewChallenge(),
  );
  listen(elements.finishHome, "click", () => actions.leaveGameMode("home"));
  listen(elements.developerMode, "change", () =>
    actions.setDeveloperMode(elements.developerMode.checked),
  );
  listen(elements.nextExercise, "click", () => actions.goToNextExercise());
  listen(elements.replay, "click", () => actions.togglePlayback());
  listen(elements.setPhraseEnd, "click", () =>
    actions.setQuickRatingPhraseEnd(),
  );
  listen(elements.phraseLengthDecrease, "click", () =>
    actions.adjustCurrentPhraseSettings("notesMax", -1),
  );
  listen(elements.phraseLengthIncrease, "click", () =>
    actions.adjustCurrentPhraseSettings("notesMax", 1),
  );
  listen(elements.shortNotesDecrease, "click", () =>
    actions.adjustCurrentPhraseSettings("ignoredShortestNotes", -1),
  );
  listen(elements.shortNotesIncrease, "click", () =>
    actions.adjustCurrentPhraseSettings("ignoredShortestNotes", 1),
  );
  listen(elements.reviewPrevious, "click", () => actions.moveReviewPhrase(-1));
  listen(elements.reviewNext, "click", () => actions.moveReviewPhrase(1));
  listen(elements.playOriginal, "click", () =>
    actions.toggleOriginalPlayback(),
  );
  listen(elements.closeRecording, "click", () =>
    actions.closeRecordingPlayer(),
  );
  listen(elements.recordingVersion, "change", () =>
    actions.showRecordingChoice(Number(elements.recordingVersion.value)),
  );
  listen(elements.recordingModal, "click", (event) => {
    if (event.target === elements.recordingModal) {
      actions.closeRecordingPlayer();
    }
  });
  listen(elements.copyPhraseId, "click", () =>
    actions.copyCurrentPhraseId(),
  );
  listen(elements.transposeOriginal, "change", () => actions.saveSettings());
  listen(elements.exportData, "click", () => actions.exportData());
  listen(elements.undoRating, "click", () => actions.undoLastRating());
  listen(elements.fullscreenButton, "click", () => actions.toggleGameMode());
  listen(elements.exitPortraitMode, "click", () => actions.leaveGameMode());

  for (const button of documentObject.querySelectorAll(
    ".star-rating [data-rating]",
  )) {
    listen(button, "click", (event) => actions.setRatingFromButton(event));
  }
  for (const button of elements.quickRatingButtons) {
    listen(button, "click", (event) => actions.setQuickRating(event));
  }

  listen(documentObject, "keydown", (event) => {
    if (event.key === "Escape" && !elements.recordingModal.hidden) {
      event.preventDefault();
      actions.closeRecordingPlayer();
      return;
    }
    if (
      !actions.isRatingModeActive() ||
      !documentObject.body.classList.contains("game-mode")
    ) {
      return;
    }
    if (["1", "2", "3"].includes(event.key)) {
      event.preventDefault();
      actions.setQuickRating(Number(event.key));
    } else if (event.code === "Space") {
      event.preventDefault();
      actions.togglePlayback();
    }
  });

  let active = true;
  return function unbindAppEvents() {
    if (!active) return;
    active = false;
    for (const remove of removers.splice(0).reverse()) remove();
  };
}
