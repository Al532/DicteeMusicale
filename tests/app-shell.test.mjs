import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createAppShell } from "../src/app-shell.js";

function createFixture({ ios = false } = {}) {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body class="home-view">
        <button id="install" hidden>Installer</button>
        <div id="ios" hidden><button id="close-ios">Fermer</button></div>
        <button id="fullscreen"></button>
        <section id="rating"></section>
      </body>
    </html>`, {
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const { document, Event } = dom.window;
  const mediaQueries = new Map();
  dom.window.matchMedia = (query) => {
    if (!mediaQueries.has(query)) {
      mediaQueries.set(query, {
        matches: false,
        addEventListener() {},
      });
    }
    return mediaQueries.get(query);
  };

  const serviceWorkerCalls = [];
  const navigatorObject = {
    maxTouchPoints: 0,
    platform: "",
    serviceWorker: {
      async register(...args) {
        serviceWorkerCalls.push(args);
      },
    },
    userAgent: ios ? "iPhone" : "Desktop",
  };
  const orientationCalls = [];
  const screenObject = {
    orientation: {
      async lock(value) {
        orientationCalls.push(["lock", value]);
      },
      unlock() {
        orientationCalls.push(["unlock"]);
      },
    },
  };
  let fullscreenElement = null;
  let exitFullscreenCalls = 0;
  let requestFullscreenOptions = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  document.documentElement.requestFullscreen = async (options) => {
    requestFullscreenOptions = options;
    fullscreenElement = document.documentElement;
  };
  document.exitFullscreen = async () => {
    exitFullscreenCalls += 1;
    fullscreenElement = null;
  };

  const closeOriginalCalls = [];
  let fullscreenExitCalls = 0;
  const elements = {
    closeIosInstall: document.querySelector("#close-ios"),
    fullscreenButton: document.querySelector("#fullscreen"),
    installButton: document.querySelector("#install"),
    iosInstallModal: document.querySelector("#ios"),
    ratingWorkspace: document.querySelector("#rating"),
  };
  const shell = createAppShell({
    closeOriginalPlayer: (options) => closeOriginalCalls.push(options),
    documentObject: document,
    elements,
    navigatorObject,
    onFullscreenExit: () => {
      fullscreenExitCalls += 1;
    },
    screenObject,
    translate: (key) => key,
    windowObject: dom.window,
  });

  return {
    closeOriginalCalls,
    document,
    dom,
    elements,
    Event,
    get exitFullscreenCalls() {
      return exitFullscreenCalls;
    },
    get fullscreenElement() {
      return fullscreenElement;
    },
    set fullscreenElement(value) {
      fullscreenElement = value;
    },
    get fullscreenExitCalls() {
      return fullscreenExitCalls;
    },
    get requestFullscreenOptions() {
      return requestFullscreenOptions;
    },
    orientationCalls,
    serviceWorkerCalls,
    shell,
    window: dom.window,
  };
}

test("le shell enregistre le service worker et pilote l’installation", async () => {
  const fixture = createFixture();
  fixture.shell.setUp();

  assert.deepEqual(fixture.serviceWorkerCalls, [
    ["./sw.js", { updateViaCache: "none" }],
  ]);
  assert.equal(fixture.elements.installButton.hidden, true);

  let promptCalls = 0;
  const installEvent = new fixture.Event("beforeinstallprompt", {
    cancelable: true,
  });
  Object.defineProperties(installEvent, {
    prompt: {
      value: () => {
        promptCalls += 1;
      },
    },
    userChoice: {
      value: Promise.resolve({ outcome: "dismissed" }),
    },
  });
  fixture.window.dispatchEvent(installEvent);
  assert.equal(installEvent.defaultPrevented, true);
  assert.equal(fixture.elements.installButton.hidden, false);

  fixture.elements.installButton.click();
  await installEvent.userChoice;
  await Promise.resolve();
  assert.equal(promptCalls, 1);
  assert.equal(fixture.elements.installButton.hidden, true);
  fixture.dom.window.close();
});

test("le shell conserve les instructions iOS accessibles", () => {
  const fixture = createFixture({ ios: true });
  fixture.shell.setUp();

  assert.equal(fixture.elements.installButton.hidden, false);
  fixture.elements.installButton.focus();
  fixture.elements.installButton.click();
  assert.equal(fixture.elements.iosInstallModal.hidden, false);
  assert.equal(fixture.document.activeElement, fixture.elements.closeIosInstall);

  fixture.document.dispatchEvent(
    new fixture.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(fixture.elements.iosInstallModal.hidden, true);
  assert.equal(fixture.document.activeElement, fixture.elements.installButton);
  fixture.dom.window.close();
});

test("le shell active puis restaure le mode plein écran", async () => {
  const fixture = createFixture();
  fixture.shell.setUp();

  await fixture.shell.enterGameMode();
  assert.equal(fixture.shell.isGameModeActive(), true);
  assert.equal(fixture.document.body.classList.contains("home-view"), false);
  assert.deepEqual(fixture.requestFullscreenOptions, {
    navigationUI: "hide",
  });
  assert.deepEqual(fixture.orientationCalls, [["lock", "landscape"]]);
  assert.equal(
    fixture.elements.fullscreenButton.getAttribute("aria-pressed"),
    "true",
  );

  await fixture.shell.leaveGameMode();
  assert.equal(fixture.exitFullscreenCalls, 1);
  assert.equal(fixture.shell.isGameModeActive(), false);
  assert.deepEqual(fixture.closeOriginalCalls.at(-1), {
    restoreFocus: false,
    restoreInput: false,
  });
  assert.equal(
    fixture.elements.fullscreenButton.getAttribute("aria-pressed"),
    "false",
  );

  await fixture.shell.enterGameMode({ lockOrientation: false });
  fixture.fullscreenElement = null;
  fixture.document.dispatchEvent(new fixture.Event("fullscreenchange"));
  assert.equal(fixture.fullscreenExitCalls, 1);
  assert.equal(fixture.shell.isGameModeActive(), false);
  fixture.dom.window.close();
});
