import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { queryAppElements } from "../src/app-dom.js";
import { DEFAULT_MELODY_SOUND } from "../src/persistence.js";
import {
  CHALLENGE_PHRASE_COUNT,
  CHALLENGE_SCHEMA_VERSION,
  TRAINING_TONES_PER_PHRASE,
} from "../src/session.js";

const index = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../styles.css", import.meta.url),
  "utf8",
);
const serviceWorker = await readFile(
  new URL("../sw.js", import.meta.url),
  "utf8",
);
const pagesWorkflow = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(
    new URL("../manifest.webmanifest", import.meta.url),
    "utf8",
  ),
);
const frenchManifest = JSON.parse(
  await readFile(
    new URL("../manifest-fr.webmanifest", import.meta.url),
    "utf8",
  ),
);
const icon = await readFile(
  new URL("../icon.svg", import.meta.url),
  "utf8",
);

const dom = new JSDOM(index);
const { document } = dom.window;
const elements = queryAppElements(document);

function textContent(selector) {
  return document.querySelector(selector)?.textContent.trim() ?? "";
}

test("l’accueil public conserve son contenu et ses actions", () => {
  assert.equal(document.title, "Jazz Solo Challenge");
  assert.equal(document.documentElement.lang, "en");
  assert.deepEqual(
    [...document.querySelectorAll("#home-title span")].map((node) =>
      node.textContent.trim()
    ),
    ["Jazz Solo", "Challenge"],
  );
  assert.equal(
    textContent(".home-intro"),
    "Play jazz solo phrases back by ear, in every key.",
  );
  assert.deepEqual(
    [...document.querySelectorAll(".challenge-rule strong")].map((node) =>
      node.textContent.trim()
    ),
    ["3", "3", "sudden death"],
  );
  assert.equal(
    elements.startChallenge.querySelector("[data-i18n]")?.dataset.i18n,
    "home.start",
  );
  assert.equal(
    elements.resumeChallenge.querySelector("[data-i18n]")?.dataset.i18n,
    "home.resume",
  );
  assert.equal(elements.resumeChallenge.hidden, true);
  assert.equal(elements.openFavorites.dataset.i18n, undefined);
  assert.equal(
    elements.openFavorites.querySelector("[data-i18n]")?.dataset.i18n,
    "home.freeMode",
  );

  const localeBootstrap = document.querySelector("head script:not([src])");
  assert.ok(localeBootstrap);
  assert.ok(localeBootstrap.textContent.includes("navigator.languages?.[0]"));
  assert.ok(localeBootstrap.textContent.includes("manifest-fr.webmanifest"));
});

test("le contrat HTML expose uniquement les outils développeur actuels", () => {
  const developerActions = document.querySelector(
    ".developer-home-actions",
  );
  assert.ok(developerActions);
  assert.equal(developerActions.hidden, true);
  assert.equal(developerActions.hasAttribute("data-developer-only"), true);
  assert.deepEqual(
    [...developerActions.querySelectorAll(":scope > button")].map(
      ({ id }) => id,
    ),
    [
      "start-rating",
      "start-review",
      "open-recording-workshop",
      "open-lick-explorer",
      "export-data",
    ],
  );
  assert.equal(elements.developerMode.type, "checkbox");

  for (const selector of [
    "#developer-lab",
    "#start-real",
    "#start-random",
    "#musician-picker",
    "#minimum-rating",
    ".settings-drawer",
  ]) {
    assert.equal(document.querySelector(selector), null, selector);
  }
});

test("les contrôles de notation, review et phrase restent dans le jeu", () => {
  assert.deepEqual(
    [...elements.phraseAdjustments.querySelectorAll("button, output")].map(
      ({ id }) => id,
    ),
    [
      "phrase-length-decrease",
      "phrase-length-output",
      "phrase-length-increase",
      "open-phrase-editor",
    ],
  );
  assert.equal(elements.phraseEditorModal.hidden, true);
  assert.equal(
    elements.openPhraseEditor.dataset.i18n,
    "phraseEditor.open",
  );
  assert.equal(document.querySelector("#phrase-editor-play").textContent.trim(), "Play phrase");
  assert.equal(
    document.querySelector("#phrase-editor-play-selected").dataset.i18n,
    "phraseEditor.playSelected",
  );
  assert.equal(document.querySelector("#phrase-editor-save").dataset.i18n, "phraseEditor.save");
  assert.deepEqual(
    [...document.querySelectorAll(".phrase-editor-note-actions button")].map(
      ({ dataset }) => dataset.phraseEditorAction,
    ),
    ["add-after", "delete"],
  );
  assert.equal(elements.exerciseRating.id, "exercise-rating");
  assert.equal(document.querySelector("#completion-rating"), null);
  assert.equal(elements.setPhraseEnd.dataset.i18nAriaLabel, "rating.setEndAria");
  assert.equal(
    elements.setPhraseEnd.querySelector("[data-i18n]")?.dataset.i18n,
    "rating.setEnd",
  );
  assert.deepEqual(
    [
      elements.reviewPrevious,
      elements.reviewCounter,
      elements.reviewNext,
    ].map(({ id }) => id),
    ["review-previous", "review-counter", "review-next"],
  );
  assert.deepEqual(
    [
      elements.freePrevious,
      elements.freeCounter,
      elements.freeNext,
    ].map(({ id }) => id),
    ["free-previous", "free-counter", "free-next"],
  );
  assert.equal(elements.exportData.dataset.i18n, undefined);
  assert.equal(
    elements.exportData.querySelector("[data-i18n]")?.dataset.i18n,
    "developer.exportData",
  );
  assert.equal(document.querySelector("#lick-explorer-filter"), null);
  assert.deepEqual(
    [
      "lick-explorer-pattern-id",
      "lick-explorer-harmonic-function",
      "lick-explorer-start-degree",
    ].map((id) => document.querySelector(`#${id}`)?.id),
    [
      "lick-explorer-pattern-id",
      "lick-explorer-harmonic-function",
      "lick-explorer-start-degree",
    ],
  );
  assert.deepEqual(
    [...document.querySelector("#lick-explorer-rhythm-mode").options].map(
      ({ value }) => value,
    ),
    ["synthetic", "reference"],
  );
  assert.equal(
    document.querySelector("#lick-explorer-rhythm-mode").value,
    "synthetic",
  );
});

test("les favoris et les originaux conservent leur structure publique", () => {
  assert.equal(elements.favoriteToggle.id, "favorite-toggle");
  assert.equal(elements.favoritesList.id, "favorites-list");
  assert.equal(elements.favoritesEmpty.id, "favorites-empty");
  assert.equal(elements.freeTranspose.hidden, true);
  assert.equal(
    elements.freeTranspose.querySelector("[data-i18n]")?.dataset.i18n,
    "free.otherKey",
  );
  assert.equal(elements.challengeCompleteModal.hidden, true);
  assert.equal(elements.completedPhrases.id, "completed-phrases");

  assert.equal(elements.sourceSummary.hidden, true);
  assert.equal(elements.originalControls.hidden, true);
  assert.equal(elements.playOriginal.id, "play-original");
  assert.equal(document.querySelector("#transpose-original"), null);
  assert.equal(document.querySelector("#audio-source-link"), null);
  assert.equal(elements.recordingModal.hidden, true);
  assert.equal(elements.recordingPlayer.tagName, "IFRAME");
  assert.equal(document.querySelector("#recording-external-link"), null);
  assert.equal(
    [...document.querySelectorAll("a")].some(({ href }) =>
      /(?:youtube\.com|youtu\.be)/i.test(href)
    ),
    false,
  );
});

test("l’atelier de validation reste réservé au mode développeur", () => {
  assert.equal(elements.recordingWorkshopPanel.hidden, true);
  assert.equal(elements.recordingWorkshopPlayer.tagName, "IFRAME");
  assert.equal(elements.recordingOffsetButtons.length, 4);
  assert.equal(
    elements.editRecordingWorkshopPhrase.dataset.i18n,
    "phraseEditor.open",
  );
  assert.deepEqual(
    [
      elements.verifyRecordingWorkshop,
      elements.rejectRecordingWorkshop,
      elements.unavailableRecordingWorkshop,
    ].map(({ id }) => id),
    [
      "verify-recording-workshop",
      "reject-recording-workshop",
      "unavailable-recording-workshop",
    ],
  );
  assert.equal(document.querySelector("#export-recording-validations"), null);
});

test("le format public reste un défi 3 × 3", () => {
  assert.equal(CHALLENGE_SCHEMA_VERSION, 2);
  assert.equal(CHALLENGE_PHRASE_COUNT, 3);
  assert.equal(TRAINING_TONES_PER_PHRASE, 3);
  assert.ok(elements.progressDots);
  assert.equal(
    textContent("#sudden-death-title"),
    "Sudden death",
  );
  assert.ok(
    textContent("#sudden-death-modal").includes(
      "Replay as often as needed",
    ),
  );
  assert.equal(document.querySelector("#completion-modal"), null);
});

test("l’ancienne télémétrie et le sélecteur de son restent absents", async () => {
  for (const selector of [
    "#stat-exercises",
    "#stat-notes",
    "#stat-accuracy",
    "#stat-response",
    "#export-csv",
    "#export-json",
    "#reset-stats",
    "#import-json",
    "#melody-sound",
  ]) {
    assert.equal(document.querySelector(selector), null, selector);
  }
  assert.doesNotMatch(document.body.textContent, /\bscore\b|\bpoints\b/i);
  assert.equal(DEFAULT_MELODY_SOUND, "synthetic");

  for (const [instrument, expectedCount] of [
    ["clarinet", 43],
    ["piano", 61],
  ]) {
    const directory = new URL(`../audio/${instrument}/`, import.meta.url);
    const samples = (await readdir(directory))
      .filter((filename) => filename.endsWith(".mp3"))
      .sort();
    assert.equal(samples.length, expectedCount, instrument);
    for (const filename of samples) {
      const file = await stat(new URL(filename, directory));
      assert.ok(file.size > 0, `${instrument}/${filename}`);
    }
  }
});

test("la mise en page réserve la rotation au jeu avec piano", () => {
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.home-panel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /\.home-panel \{[\s\S]*?grid-template-columns:[\s\S]*?min-height: 100dvh/,
  );
  assert.match(
    styles,
    /\.game-mode main \{[\s\S]*?height: var\(--game-viewport-height, 100dvh\)/,
  );
  assert.match(
    styles,
    /\.game-mode \.exercise-panel \{[\s\S]*?grid-template-rows:[\s\S]*?minmax\(110px, 1fr\)/,
  );
  assert.match(
    styles,
    /\.piano \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/,
  );
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.game-mode:not\(\.rating-mode\) \.rotate-overlay/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.home-view \.rotate-overlay/,
  );
});

test("les contrôles de jeu conservent leur grille visuelle", () => {
  const gameControls = document.querySelector(".game-controls");
  assert.ok(gameControls);
  assert.deepEqual(
    [...gameControls.children].map(({ id, className }) =>
      id || String(className)
    ),
    ["game-speed-setting", "replay", "game-context-controls"],
  );
  assert.equal(document.querySelectorAll("#game-speed").length, 1);
  assert.match(
    styles,
    /\.game-controls \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns:[\s\S]*?130px/,
  );
  assert.match(styles, /\.replay-button \{[\s\S]*?grid-column: 2/);
  assert.match(
    styles,
    /\.game-speed-control \{[\s\S]*?justify-self: start/,
  );
  assert.match(
    styles,
    /\.game-context-controls \{[\s\S]*?grid-column: 3;[\s\S]*?justify-self: end/,
  );
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.developer-mode\.rating-mode \.game-controls \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 110px[\s\S]*?\.developer-mode\.rating-mode \.game-context-controls \{[\s\S]*?grid-column: 1 \/ -1/,
  );
  assert.match(
    styles,
    /\.developer-mode\.game-mode \.developer-game-control:not\(\[hidden\]\) \{[\s\S]*?display: flex/,
  );
});

test("les modales et favoris conservent leur adaptation au paysage", () => {
  assert.match(
    styles,
    /@media \(orientation: landscape\) and \(max-height: 600px\)[\s\S]*?\.modal-layer \{[\s\S]*?safe-area-inset-right[\s\S]*?overflow-y: auto/,
  );
  assert.match(
    styles,
    /#sudden-death-modal \.sudden-death-card \{[\s\S]*?grid-template-columns:[\s\S]*?grid-template-areas:[\s\S]*?"symbol action"/,
  );
  assert.match(
    styles,
    /#challenge-complete-modal \.completion-card \{[\s\S]*?grid-template-columns:[\s\S]*?grid-template-areas:[\s\S]*?"home action"/,
  );
  assert.match(
    styles,
    /#sudden-death-modal \.modal-card,[\s\S]*?#challenge-complete-modal \.modal-card \{[\s\S]*?max-height: calc\(var\(--game-viewport-height, 100dvh\) - 20px\);[\s\S]*?overflow-y: auto/,
  );
  assert.match(
    styles,
    /\.completed-phrase \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 36px/,
  );
  assert.match(
    styles,
    /\.completed-phrase-favorite\[aria-pressed="true"\] \{[\s\S]*?color: var\(--accent\)/,
  );
  assert.match(
    styles,
    /\.recording-frame \{[\s\S]*?aspect-ratio: 16 \/ 9/,
  );
});

test("les manifestes et le shell PWA restent synchronisés", () => {
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.name, "Jazz Solo Challenge");
  assert.equal(manifest.lang, "en");
  assert.equal(manifest.id, "./");
  assert.equal(frenchManifest.lang, "fr");
  assert.equal(frenchManifest.id, manifest.id);
  assert.equal(frenchManifest.name, manifest.name);
  assert.equal(frenchManifest.orientation, "any");

  const stylesheet = document.querySelector('link[rel="stylesheet"]');
  const appScript = document.querySelector('script[type="module"][src]');
  assert.ok(stylesheet);
  assert.ok(appScript);
  const stylesheetVersion = new URL(
    stylesheet.getAttribute("href"),
    "https://example.test/",
  ).searchParams.get("v");
  const appVersion = new URL(
    appScript.getAttribute("src"),
    "https://example.test/",
  ).searchParams.get("v");
  const shellVersion = serviceWorker.match(
    /const SHELL_CACHE = `\$\{CACHE_PREFIX\}shell-v(\d+)`/,
  )?.[1];
  assert.equal(stylesheetVersion, appVersion);
  assert.equal(shellVersion, appVersion);

  const shellAssets = new Set(
    [...serviceWorker.matchAll(/^\s+"(\.\/[^"]+)",?$/gm)].map(
      (match) => match[1],
    ),
  );
  for (const asset of [
    stylesheet.getAttribute("href"),
    appScript.getAttribute("src"),
    "./src/app-dom.js",
    "./src/app-renderer.js",
    "./src/app-shell.js",
    "./src/audio-runtime.js",
    "./src/corpus-loader.js",
    "./src/data-export.js",
    "./src/embedded-browser.js",
    "./src/exercise.js",
    "./src/i18n.js",
    "./src/original-player.js",
    "./src/persistence.js",
    "./src/phrase-editor.js",
    "./src/recording.js",
    "./src/recording-workshop.js",
    "./src/engine.js",
    "./src/ratings.js",
    "./src/rating-workflow.js",
    "./src/phrase-settings.js",
    "./src/session.js",
    "./data/default-ratings.js",
    "./data/default-phrase-settings.js",
    "./data/recording-validations.js",
    "./data/wjazzd-index.js",
    "./data/wjazzd-blocks/manifest.json",
    "./data/youtube-search-recordings.js",
    "./manifest.webmanifest",
    "./manifest-fr.webmanifest",
  ]) {
    assert.equal(shellAssets.has(asset), true, asset);
  }
  assert.equal(
    [...shellAssets].some((asset) => asset.startsWith("./audio/parker/")),
    false,
  );
  assert.equal(
    [...shellAssets].some(
      (asset) =>
        asset.startsWith("./audio/clarinet/") ||
        asset.startsWith("./audio/piano/"),
    ),
    false,
  );
  assert.doesNotMatch(
    serviceWorker,
    /data\/wjazzd-(?:solos|chords)\.js/,
  );
});

test("GitHub Pages publie seulement après les contrôles automatisés", () => {
  assert.match(
    pagesWorkflow,
    /run: npm ci[\s\S]*?run: npm run check[\s\S]*?run: npm test[\s\S]*?uses: actions\/deploy-pages@v4/,
  );
  assert.match(
    pagesWorkflow,
    /mkdir _site[\s\S]*?src[\s\S]*?data[\s\S]*?audio[\s\S]*?path: _site/,
  );
  assert.doesNotMatch(pagesWorkflow, /path: \./);
});

test("les ressources d’installation conservent leur contenu et leurs dimensions", async () => {
  assert.equal(
    document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute(
      "href",
    ),
    "./icon-180.png",
  );
  assert.equal(
    elements.iosInstallModal.querySelector("[data-i18n='ios.kicker']")
      ?.textContent.trim(),
    "On iPhone and iPad",
  );
  assert.equal(
    elements.iosInstallModal.querySelector("[data-i18n='ios.share']")
      ?.textContent.trim(),
    "Share",
  );
  assert.equal(
    elements.iosInstallModal.querySelector("[data-i18n='ios.addToHome']")
      ?.textContent.trim(),
    "Add to Home Screen",
  );
  assert.deepEqual(
    manifest.icons
      .filter(({ type }) => type === "image/png")
      .map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      { src: "./icon-192.png", sizes: "192x192", purpose: "any" },
      { src: "./icon-512.png", sizes: "512x512", purpose: "any" },
    ],
  );

  for (const [filename, expectedSize] of [
    ["icon-180.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    const png = await readFile(new URL(`../${filename}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
    assert.ok(serviceWorker.includes(`"./${filename}"`));
  }
});

test("l’icône conserve la palette sans l’artefact au-dessus de la hampe", () => {
  assert.match(icon, /<rect[^>]*fill="#11130f"/);
  assert.match(icon, /<circle[^>]*fill="#d8e56d"/);
  assert.match(icon, /<path d="M194 157v190/);
  assert.doesNotMatch(icon, /M194 139/);
});
