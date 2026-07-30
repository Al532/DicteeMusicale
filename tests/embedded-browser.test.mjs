import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {
  activateEmbeddedBrowserGuard,
  chromeIntentUrl,
  detectEmbeddedBrowser,
} from "../src/embedded-browser.js";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test("les signatures explicites des navigateurs intégrés sont bloquées", () => {
  const cases = [
    {
      expectedApplication: "reddit",
      expectedPlatform: "android",
      userAgent: `${ANDROID_CHROME} Reddit/2026.30.0`,
    },
    {
      expectedApplication: "messenger",
      expectedPlatform: "ios",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
        "AppleWebKit/605.1.15 Mobile/15E148 [FBAN/MessengerForiOS;FBAV/520.0.0.0]",
    },
    {
      expectedApplication: "instagram",
      expectedPlatform: "ios",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
        "AppleWebKit/605.1.15 Mobile/15E148 Instagram 390.0.0",
    },
  ];

  for (const {
    expectedApplication,
    expectedPlatform,
    userAgent,
  } of cases) {
    assert.deepEqual(
      detectEmbeddedBrowser({ userAgent }),
      {
        application: expectedApplication,
        platform: expectedPlatform,
        reason: "application-signature",
      },
    );
  }
});

test("les WebView génériques clairement identifiées sont bloquées", () => {
  assert.deepEqual(
    detectEmbeddedBrowser({
      userAgent:
        "Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/ABC; wv) " +
        "AppleWebKit/537.36 Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
    }),
    {
      application: null,
      platform: "android",
      reason: "android-webview",
    },
  );
  assert.deepEqual(
    detectEmbeddedBrowser({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    }),
    {
      application: null,
      platform: "ios",
      reason: "ios-webview",
    },
  );
});

test("Safari, Chrome et les apps installées restent autorisés", () => {
  assert.equal(detectEmbeddedBrowser({ userAgent: ANDROID_CHROME }), null);
  assert.equal(detectEmbeddedBrowser({ userAgent: IOS_SAFARI }), null);
  assert.equal(
    detectEmbeddedBrowser({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
        "AppleWebKit/605.1.15 Mobile/15E148",
      standalone: true,
    }),
    null,
  );
});

test("le mode fullscreen installé ne déclenche pas le blocage", () => {
  const dom = new JSDOM(
    '<body><div id="embedded-browser-guard" hidden></div><main></main></body>',
    { url: "https://example.test/" },
  );
  dom.window.matchMedia = (query) => ({
    matches: query === "(display-mode: fullscreen)",
  });

  const detection = activateEmbeddedBrowserGuard({
    documentObject: dom.window.document,
    navigatorObject: {
      platform: "Linux armv8l",
      userAgent:
        "Mozilla/5.0 (Linux; Android 16; Pixel 9; wv) " +
        "AppleWebKit/537.36 Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
    },
    windowObject: dom.window,
  });

  assert.equal(detection, null);
  assert.equal(
    dom.window.document.querySelector("#embedded-browser-guard").hidden,
    true,
  );
  dom.window.close();
});

test("le lien Android cible Chrome et conserve l’URL comme repli", () => {
  const pageUrl = "https://example.test/play?phrase=42#note";
  const intent = chromeIntentUrl(pageUrl);

  assert.match(intent, /^intent:\/\/example\.test\/play\?phrase=42#Intent;/);
  assert.match(intent, /scheme=https;package=com\.android\.chrome;/);
  assert.match(
    intent,
    new RegExp(`S\\.browser_fallback_url=${encodeURIComponent(pageUrl)}`),
  );
});

test("l’écran bloque l’app et propose les actions adaptées à Android", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: "https://example.test/session?from=reddit",
  });
  let copiedText = null;
  const navigatorObject = {
    clipboard: {
      async writeText(value) {
        copiedText = value;
      },
    },
    maxTouchPoints: 5,
    platform: "Linux armv8l",
    userAgent: `${ANDROID_CHROME} Reddit/2026.30.0`,
  };

  const detection = activateEmbeddedBrowserGuard({
    documentObject: dom.window.document,
    navigatorObject,
    windowObject: dom.window,
    copiedMessage: "Lien copié",
    copyFailedMessage: "Échec",
  });

  const guard = dom.window.document.querySelector("#embedded-browser-guard");
  const main = dom.window.document.querySelector("main");
  const openButton = guard.querySelector("#open-in-chrome");
  const copyButton = guard.querySelector("#copy-external-link");

  assert.equal(detection.application, "reddit");
  assert.equal(guard.hidden, false);
  assert.equal(main.hasAttribute("inert"), true);
  assert.equal(main.getAttribute("aria-hidden"), "true");
  assert.equal(
    guard.querySelector("#embedded-browser-android-action").hidden,
    false,
  );
  assert.match(openButton.href, /^intent:\/\/example\.test\/session/);

  copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copiedText, "https://example.test/session?from=reddit");
  assert.equal(
    guard.querySelector("#copy-external-link-status").textContent,
    "Lien copié",
  );

  dom.window.close();
});
