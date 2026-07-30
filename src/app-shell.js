const VIEWPORT_SYNC_DELAYS_MS = [80, 240, 600];

/**
 * Manage application-shell concerns that do not belong to an exercise:
 * installation UI, service-worker registration and the fullscreen game layout.
 *
 * @param {object} options
 */
export function createAppShell({
  closeOriginalPlayer,
  documentObject,
  elements,
  navigatorObject,
  onFullscreenExit,
  screenObject,
  translate,
  windowObject,
}) {
  const fullscreenDisplayMode = windowObject.matchMedia(
    "(display-mode: fullscreen)",
  );
  const standaloneDisplayMode = windowObject.matchMedia(
    "(display-mode: standalone)",
  );
  let deferredInstallPrompt = null;
  let installInstructionsReturnFocus = null;
  let viewportSyncTimers = [];

  function registerOfflineSupport() {
    if ("serviceWorker" in navigatorObject) {
      navigatorObject.serviceWorker
        .register("./sw.js", { updateViaCache: "none" })
        .catch(() => {
          // L’application reste utilisable en ligne si l’enregistrement échoue.
        });
    }
  }

  function isIosDevice() {
    return (
      /iPad|iPhone|iPod/.test(navigatorObject.userAgent) ||
      (navigatorObject.platform === "MacIntel" &&
        navigatorObject.maxTouchPoints > 1)
    );
  }

  function isInstalledApp() {
    return (
      fullscreenDisplayMode.matches ||
      standaloneDisplayMode.matches ||
      navigatorObject.standalone === true
    );
  }

  function updateInstallButton() {
    elements.installButton.hidden =
      isInstalledApp() || (!deferredInstallPrompt && !isIosDevice());
  }

  function openIosInstallInstructions() {
    installInstructionsReturnFocus = documentObject.activeElement;
    elements.iosInstallModal.hidden = false;
    elements.closeIosInstall.focus();
  }

  function closeIosInstallInstructions() {
    if (elements.iosInstallModal.hidden) return;
    elements.iosInstallModal.hidden = true;
    installInstructionsReturnFocus?.focus?.();
    installInstructionsReturnFocus = null;
  }

  function setUpInstallPrompt() {
    updateInstallButton();

    windowObject.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButton();
    });

    windowObject.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      closeIosInstallInstructions();
      updateInstallButton();
    });

    fullscreenDisplayMode.addEventListener?.("change", updateInstallButton);
    standaloneDisplayMode.addEventListener?.("change", updateInstallButton);

    elements.installButton.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        updateInstallButton();
        return;
      }
      if (isIosDevice()) openIosInstallInstructions();
    });

    elements.closeIosInstall.addEventListener(
      "click",
      closeIosInstallInstructions,
    );
    elements.iosInstallModal.addEventListener("click", (event) => {
      if (event.target === elements.iosInstallModal) {
        closeIosInstallInstructions();
      }
    });
    documentObject.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeIosInstallInstructions();
    });
  }

  function isGameModeActive() {
    return documentObject.body.classList.contains("game-mode");
  }

  function updateGameModeButton() {
    const active = isGameModeActive();
    elements.fullscreenButton.textContent = active
      ? "×"
      : translate("fullscreen.enter");
    elements.fullscreenButton.setAttribute(
      "aria-label",
      translate(active ? "fullscreen.exit" : "fullscreen.enterAria"),
    );
    elements.fullscreenButton.setAttribute("aria-pressed", String(active));
  }

  function clearViewportSyncTimers() {
    for (const timer of viewportSyncTimers) {
      windowObject.clearTimeout(timer);
    }
    viewportSyncTimers = [];
  }

  function syncGameViewportHeight() {
    if (!isGameModeActive()) return;
    const viewportHeight =
      windowObject.visualViewport?.height ?? windowObject.innerHeight;
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
    documentObject.documentElement.style.setProperty(
      "--game-viewport-height",
      `${Math.floor(viewportHeight)}px`,
    );
  }

  function scheduleGameViewportSync() {
    clearViewportSyncTimers();
    syncGameViewportHeight();
    viewportSyncTimers = VIEWPORT_SYNC_DELAYS_MS.map((delay) =>
      windowObject.setTimeout(syncGameViewportHeight, delay),
    );
  }

  function activateGameLayout() {
    documentObject.body.classList.remove("home-view");
    documentObject.body.classList.add("game-mode");
    scheduleGameViewportSync();
    updateGameModeButton();
  }

  function deactivateGameLayout() {
    closeOriginalPlayer({
      restoreFocus: false,
      restoreInput: false,
    });
    clearViewportSyncTimers();
    documentObject.documentElement.style.removeProperty(
      "--game-viewport-height",
    );
    documentObject.body.classList.remove(
      "game-mode",
      "rating-mode",
      "challenge-mode",
      "free-mode",
      "sudden-death-mode",
      "review-mode",
    );
    elements.ratingWorkspace.hidden = true;
    updateGameModeButton();
  }

  async function enterGameMode({ lockOrientation = true } = {}) {
    activateGameLayout();

    try {
      if (
        !fullscreenDisplayMode.matches &&
        !documentObject.fullscreenElement &&
        documentObject.documentElement.requestFullscreen
      ) {
        await documentObject.documentElement.requestFullscreen({
          navigationUI: "hide",
        });
      }
    } catch {
      // Le mode de jeu CSS reste utilisable si le navigateur refuse le plein écran natif.
    }

    if (lockOrientation) {
      try {
        await screenObject.orientation?.lock?.("landscape");
      } catch {
        // iOS et certains navigateurs imposent une rotation manuelle.
      }
    }
    scheduleGameViewportSync();
  }

  async function leaveGameMode() {
    try {
      screenObject.orientation?.unlock?.();
    } catch {
      // Le déverrouillage n’est pas exposé partout.
    }

    try {
      if (
        documentObject.fullscreenElement &&
        documentObject.exitFullscreen
      ) {
        await documentObject.exitFullscreen();
      }
    } catch {
      // La mise en page normale est restaurée même si la sortie native échoue.
    }

    deactivateGameLayout();
  }

  function setUpGameMode() {
    updateGameModeButton();

    windowObject.addEventListener("resize", scheduleGameViewportSync);
    windowObject.addEventListener(
      "orientationchange",
      scheduleGameViewportSync,
    );
    windowObject.visualViewport?.addEventListener(
      "resize",
      scheduleGameViewportSync,
    );

    documentObject.addEventListener("fullscreenchange", () => {
      if (documentObject.fullscreenElement) {
        activateGameLayout();
        return;
      }

      try {
        screenObject.orientation?.unlock?.();
      } catch {
        // Certains navigateurs déverrouillent déjà l’orientation à la sortie.
      }
      deactivateGameLayout();
      onFullscreenExit();
    });
  }

  function setUp() {
    registerOfflineSupport();
    setUpInstallPrompt();
    setUpGameMode();
  }

  return {
    enterGameMode,
    isGameModeActive,
    leaveGameMode,
    setUp,
  };
}
