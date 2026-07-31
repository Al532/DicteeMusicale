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
    freeNavigation: documentObject.querySelector("#free-navigation"),
    freePrevious: documentObject.querySelector("#free-previous"),
    freeNext: documentObject.querySelector("#free-next"),
    freeCounter: documentObject.querySelector("#free-counter"),
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
    openRecordingWorkshop: documentObject.querySelector(
      "#open-recording-workshop",
    ),
    openLickExplorer: documentObject.querySelector("#open-lick-explorer"),
    lickExplorerPanel: documentObject.querySelector("#lick-explorer-panel"),
    recordingWorkshopPanel: documentObject.querySelector(
      "#recording-workshop-panel",
    ),
    closeRecordingWorkshop: documentObject.querySelector(
      "#close-recording-workshop",
    ),
    recordingWorkshopProgress: documentObject.querySelector(
      "#recording-workshop-progress",
    ),
    recordingWorkshopSolo: documentObject.querySelector(
      "#recording-workshop-solo",
    ),
    recordingWorkshopStatus: documentObject.querySelector(
      "#recording-workshop-status",
    ),
    recordingWorkshopCandidate: documentObject.querySelector(
      "#recording-workshop-candidate",
    ),
    recordingWorkshopYoutube: documentObject.querySelector(
      "#recording-workshop-youtube",
    ),
    recordingWorkshopOffset: documentObject.querySelector(
      "#recording-workshop-offset",
    ),
    recordingOffsetButtons: documentObject.querySelectorAll(
      "[data-recording-offset]",
    ),
    recordingWorkshopPhrase: documentObject.querySelector(
      "#recording-workshop-phrase",
    ),
    previewRecordingWorkshop: documentObject.querySelector(
      "#preview-recording-workshop",
    ),
    playRecordingWorkshopPhrase: documentObject.querySelector(
      "#play-recording-workshop-phrase",
    ),
    editRecordingWorkshopPhrase: documentObject.querySelector(
      "#edit-recording-workshop-phrase",
    ),
    recordingWorkshopPreview: documentObject.querySelector(
      "#recording-workshop-preview",
    ),
    recordingWorkshopPlayer: documentObject.querySelector(
      "#recording-workshop-player",
    ),
    recordingWorkshopMessage: documentObject.querySelector(
      "#recording-workshop-message",
    ),
    verifyRecordingWorkshop: documentObject.querySelector(
      "#verify-recording-workshop",
    ),
    rejectRecordingWorkshop: documentObject.querySelector(
      "#reject-recording-workshop",
    ),
    unavailableRecordingWorkshop: documentObject.querySelector(
      "#unavailable-recording-workshop",
    ),
    exportRecordingValidations: documentObject.querySelector(
      "#export-recording-validations",
    ),
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
    originalControls: documentObject.querySelector("#original-controls"),
    playOriginal: documentObject.querySelector("#play-original"),
    recordingModal: documentObject.querySelector("#recording-modal"),
    recordingTitle: documentObject.querySelector("#recording-title"),
    recordingPlayer: documentObject.querySelector("#recording-player"),
    closeRecording: documentObject.querySelector("#close-recording"),
    exerciseRating: documentObject.querySelector("#exercise-rating"),
    phraseAdjustments: documentObject.querySelector("#phrase-adjustments"),
    openPhraseEditor: documentObject.querySelector("#open-phrase-editor"),
    phraseEditorModal: documentObject.querySelector("#phrase-editor-modal"),
    phraseLengthDecrease: documentObject.querySelector(
      "#phrase-length-decrease",
    ),
    phraseLengthIncrease: documentObject.querySelector(
      "#phrase-length-increase",
    ),
    phraseLengthOutput: documentObject.querySelector("#phrase-length-output"),
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
  listen(elements.openRecordingWorkshop, "click", () =>
    actions.openRecordingWorkshop(),
  );
  listen(elements.openLickExplorer, "click", () =>
    actions.openLickExplorer(),
  );
  listen(elements.closeRecordingWorkshop, "click", () =>
    actions.closeRecordingWorkshop(),
  );
  listen(elements.recordingWorkshopSolo, "change", () =>
    actions.selectRecordingWorkshopSolo(),
  );
  listen(elements.recordingWorkshopCandidate, "change", () =>
    actions.selectRecordingWorkshopCandidate(),
  );
  listen(elements.recordingWorkshopYoutube, "input", () =>
    actions.useManualRecordingCandidate(),
  );
  listen(elements.recordingWorkshopOffset, "change", () =>
    actions.useManualRecordingCandidate(),
  );
  for (const button of elements.recordingOffsetButtons) {
    listen(button, "click", () =>
      actions.adjustRecordingOffset(Number(button.dataset.recordingOffset)),
    );
  }
  listen(elements.previewRecordingWorkshop, "click", () =>
    actions.previewRecordingWorkshop(),
  );
  listen(elements.playRecordingWorkshopPhrase, "click", () =>
    actions.playSelectedRecordingWorkshopPhrase(),
  );
  listen(elements.editRecordingWorkshopPhrase, "click", () =>
    actions.editSelectedRecordingWorkshopPhrase(),
  );
  listen(elements.verifyRecordingWorkshop, "click", () =>
    actions.verifyRecordingWorkshop(),
  );
  listen(elements.rejectRecordingWorkshop, "click", () =>
    actions.rejectRecordingWorkshop(),
  );
  listen(elements.unavailableRecordingWorkshop, "click", () =>
    actions.markRecordingUnavailable(),
  );
  listen(elements.exportRecordingValidations, "click", () =>
    actions.exportRecordingValidations(),
  );
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
  listen(elements.freePrevious, "click", () => actions.moveFreePhrase(-1));
  listen(elements.freeNext, "click", () => actions.moveFreePhrase(1));
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
  listen(elements.openPhraseEditor, "click", () =>
    actions.openCurrentPhraseEditor(),
  );
  listen(elements.reviewPrevious, "click", () => actions.moveReviewPhrase(-1));
  listen(elements.reviewNext, "click", () => actions.moveReviewPhrase(1));
  listen(elements.playOriginal, "click", () =>
    actions.toggleOriginalPlayback(),
  );
  listen(elements.closeRecording, "click", () =>
    actions.closeRecordingPlayer(),
  );
  listen(elements.recordingModal, "click", (event) => {
    if (event.target === elements.recordingModal) {
      actions.closeRecordingPlayer();
    }
  });
  listen(elements.copyPhraseId, "click", () =>
    actions.copyCurrentPhraseId(),
  );
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
    if (!elements.phraseEditorModal.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        actions.closePhraseEditor();
      }
      return;
    }
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
