const DEVELOPER_MODE_OWNERSHIP_KEY =
  "jazz-solo-training:lick-trainer-developer-mode";
const LICK_TRAINER_CLASS = "lick-trainer-mode";

export function lickPatternId(detail) {
  const [patternId = ""] = String(detail ?? "").split("·");
  return patternId.trim() || null;
}

export function isLickCompletionMessage(message) {
  const text = String(message ?? "").trim();
  return text.startsWith("Lick complete.") ||
    text.startsWith("Lick retrouvé.");
}

function hasRenderedDeckProgress(value) {
  return /\b(?:of|sur)\s+\d+$/.test(String(value ?? "").trim());
}

function safeStorage(windowObject) {
  try {
    return windowObject.localStorage;
  } catch {
    return null;
  }
}

export function installLickTrainerIntegration({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
} = {}) {
  if (!documentObject || !windowObject) return () => {};

  const button = documentObject.querySelector("#start-lick-exercise");
  const developerMode = documentObject.querySelector("#developer-mode");
  const openFavorites = documentObject.querySelector("#open-favorites");
  const nextExercise = documentObject.querySelector("#next-exercise");
  const freeTranspose = documentObject.querySelector("#free-transpose");
  const feedback = documentObject.querySelector("#feedback");
  const kicker = documentObject.querySelector("#exercise-kicker");
  const progressTitle = documentObject.querySelector("#progress-title");
  const progressDetail = documentObject.querySelector("#progress-detail");
  if (
    !button ||
    !developerMode ||
    !openFavorites ||
    !nextExercise ||
    !freeTranspose ||
    !feedback ||
    !kicker ||
    !progressTitle ||
    !progressDetail
  ) {
    return () => {};
  }

  button.className = "free-mode-button lick-trainer-button";
  button.replaceChildren(documentObject.createTextNode("Lick trainer"));
  openFavorites.after(button);

  const storage = safeStorage(windowObject);
  let active = false;
  let advanceLocked = false;
  let advanceTimer = null;
  let completedCount = 0;
  let internalRestart = false;
  let lastPatternId = null;
  let managedStartPending = false;
  let ownsDeveloperMode = false;

  function applyPresentation() {
    if (!active) return;
    documentObject.body.classList.add(LICK_TRAINER_CLASS);
    if (!nextExercise.hidden) nextExercise.hidden = true;
    if (!freeTranspose.hidden) freeTranspose.hidden = true;
    if (!progressDetail.hidden) progressDetail.hidden = true;
    if (kicker.textContent !== "Lick trainer") {
      kicker.textContent = "Lick trainer";
    }
    const title = `Lick ${completedCount + 1}`;
    if (progressTitle.textContent !== title) {
      progressTitle.textContent = title;
    }
  }

  function releaseOwnedDeveloperMode() {
    if (!ownsDeveloperMode) return;
    ownsDeveloperMode = false;
    storage?.removeItem(DEVELOPER_MODE_OWNERSHIP_KEY);
    if (!developerMode.checked) return;
    developerMode.checked = false;
    developerMode.dispatchEvent(
      new windowObject.Event("change", { bubbles: true }),
    );
  }

  function stopManagedSession() {
    active = false;
    advanceLocked = false;
    internalRestart = false;
    lastPatternId = null;
    managedStartPending = false;
    completedCount = 0;
    if (advanceTimer !== null) {
      windowObject.clearTimeout(advanceTimer);
      advanceTimer = null;
    }
    documentObject.body.classList.remove(LICK_TRAINER_CLASS);
    progressDetail.hidden = false;
    releaseOwnedDeveloperMode();
  }

  function loadManagedTrainer({ restart = false } = {}) {
    managedStartPending = true;
    internalRestart = restart;
    button.click();
  }

  function advanceAfterSuccess() {
    if (advanceLocked || !active) return;
    advanceLocked = true;
    lastPatternId = lickPatternId(progressDetail.textContent);
    completedCount += 1;
    advanceTimer = windowObject.setTimeout(() => {
      advanceTimer = null;
      if (!active) return;
      if (nextExercise.disabled) {
        loadManagedTrainer({ restart: true });
      } else {
        nextExercise.click();
      }
    }, 0);
  }

  function activateRenderedTrainer() {
    const currentPatternId = lickPatternId(progressDetail.textContent);
    managedStartPending = false;
    active = true;
    applyPresentation();
    if (
      internalRestart &&
      currentPatternId &&
      currentPatternId === lastPatternId &&
      !nextExercise.disabled
    ) {
      internalRestart = false;
      windowObject.setTimeout(() => nextExercise.click(), 0);
      return;
    }
    internalRestart = false;
  }

  function reconcile() {
    const inGame = documentObject.body.classList.contains("game-mode");
    if (active && !inGame) {
      stopManagedSession();
      return;
    }
    if (
      managedStartPending &&
      inGame &&
      hasRenderedDeckProgress(progressTitle.textContent)
    ) {
      activateRenderedTrainer();
    }
    if (!active) return;

    applyPresentation();
    const completed = isLickCompletionMessage(feedback.textContent);
    if (advanceLocked && !completed) advanceLocked = false;
    if (!advanceLocked && completed) advanceAfterSuccess();
  }

  function startFromPublicButton() {
    const restarting = internalRestart && managedStartPending;
    if (!restarting) {
      managedStartPending = true;
      internalRestart = false;
      completedCount = 0;
      lastPatternId = null;
    }
    if (developerMode.checked) return;
    ownsDeveloperMode = true;
    storage?.setItem(DEVELOPER_MODE_OWNERSHIP_KEY, "1");
    developerMode.checked = true;
    developerMode.dispatchEvent(
      new windowObject.Event("change", { bubbles: true }),
    );
  }

  button.addEventListener("click", startFromPublicButton, true);
  const observer = new windowObject.MutationObserver(reconcile);
  observer.observe(documentObject.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  if (storage?.getItem(DEVELOPER_MODE_OWNERSHIP_KEY) === "1") {
    windowObject.setTimeout(() => {
      storage.removeItem(DEVELOPER_MODE_OWNERSHIP_KEY);
      if (!active && developerMode.checked) {
        developerMode.checked = false;
        developerMode.dispatchEvent(
          new windowObject.Event("change", { bubbles: true }),
        );
      }
    }, 0);
  }

  return () => {
    observer.disconnect();
    button.removeEventListener("click", startFromPublicButton, true);
    stopManagedSession();
  };
}

if (
  globalThis.document &&
  globalThis.window &&
  !globalThis.__DICTEE_MUSICALE_TEST__
) {
  installLickTrainerIntegration();
}
