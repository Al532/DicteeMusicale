import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createAppRenderer } from "../src/app-renderer.js";
import { noteName, translateFor } from "../src/i18n.js";

function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function createFixture() {
  const dom = new JSDOM(`
    <main id="home-panel"></main>
    <main id="favorites-panel" hidden></main>
    <button id="start-challenge"></button>
    <button id="resume-challenge"></button>
    <button id="new-challenge"></button>
    <p id="session-status"></p>
    <div id="favorites-list"></div>
    <p id="favorites-empty"></p>
    <div id="piano"></div>
    <section id="challenge-progress">
      <h2 id="progress-title"></h2>
      <p id="progress-detail"></p>
    </section>
    <div id="progress-dots"></div>
    <div id="review-navigation">
      <button id="review-previous"></button>
      <span id="review-counter"></span>
      <button id="review-next"></button>
    </div>
    <div id="free-navigation">
      <button id="free-previous"></button>
      <span id="free-counter"></span>
      <button id="free-next"></button>
    </div>
    <p id="rating-session-summary"></p>
    <p id="rating-coverage-summary"></p>
    <button id="undo-rating"></button>
    <p id="source-summary"></p>
    <section id="source-line">
      <span id="source-details"></span>
      <span id="phrase-reference">
        <code id="phrase-id"></code>
        <button id="copy-phrase-id"></button>
      </span>
      <a id="source-link"></a>
    </section>
    <div id="completed-phrases"></div>
    <button id="favorite"></button>
    <div id="rating">
      <button data-rating="1">★</button>
      <button data-rating="2">★</button>
      <button data-rating="3">★</button>
    </div>
    <div id="phrase-adjustments" hidden>
      <button id="phrase-length-decrease"></button>
      <output id="phrase-length-output"></output>
      <button id="phrase-length-increase"></button>
      <button id="open-phrase-editor"></button>
    </div>
  `);
  const { document } = dom.window;
  const elements = {
    challengeProgress: document.querySelector("#challenge-progress"),
    completedPhrases: document.querySelector("#completed-phrases"),
    copyPhraseId: document.querySelector("#copy-phrase-id"),
    favoritesEmpty: document.querySelector("#favorites-empty"),
    favoritesList: document.querySelector("#favorites-list"),
    favoritesPanel: document.querySelector("#favorites-panel"),
    freeCounter: document.querySelector("#free-counter"),
    freeNavigation: document.querySelector("#free-navigation"),
    freeNext: document.querySelector("#free-next"),
    freePrevious: document.querySelector("#free-previous"),
    homePanel: document.querySelector("#home-panel"),
    newChallenge: document.querySelector("#new-challenge"),
    piano: document.querySelector("#piano"),
    phraseId: document.querySelector("#phrase-id"),
    phraseReference: document.querySelector("#phrase-reference"),
    progressDots: document.querySelector("#progress-dots"),
    progressDetail: document.querySelector("#progress-detail"),
    progressTitle: document.querySelector("#progress-title"),
    phraseAdjustments: document.querySelector("#phrase-adjustments"),
    phraseLengthDecrease: document.querySelector(
      "#phrase-length-decrease",
    ),
    phraseLengthIncrease: document.querySelector(
      "#phrase-length-increase",
    ),
    phraseLengthOutput: document.querySelector("#phrase-length-output"),
    openPhraseEditor: document.querySelector("#open-phrase-editor"),
    ratingCoverageSummary: document.querySelector(
      "#rating-coverage-summary",
    ),
    ratingSessionSummary: document.querySelector(
      "#rating-session-summary",
    ),
    resumeChallenge: document.querySelector("#resume-challenge"),
    reviewCounter: document.querySelector("#review-counter"),
    reviewNavigation: document.querySelector("#review-navigation"),
    reviewNext: document.querySelector("#review-next"),
    reviewPrevious: document.querySelector("#review-previous"),
    sessionStatus: document.querySelector("#session-status"),
    sourceDetails: document.querySelector("#source-details"),
    sourceLine: document.querySelector("#source-line"),
    sourceLink: document.querySelector("#source-link"),
    sourceSummary: document.querySelector("#source-summary"),
    startChallenge: document.querySelector("#start-challenge"),
    undoRating: document.querySelector("#undo-rating"),
  };
  const renderer = createAppRenderer({
    elements,
    document,
    translate: (key, variables) =>
      translateFor("en", key, variables),
    noteName: (value) => noteName(value, "en"),
    pitchClass,
  });
  return { document, dom, elements, renderer };
}

test("le piano conserve ses libellés, positions et callback d’entrée", () => {
  const { document, dom, elements, renderer } = createFixture();
  const inputs = [];

  assert.equal(renderer.noteLabel(58), "B♭3");
  assert.equal(renderer.noteLabel(60), "C4");

  renderer.buildPiano(
    {
      startMidi: 60,
      endMidi: 65,
      chunkCount: 2,
    },
    (midi, key, event) => {
      inputs.push([midi, key.dataset.midi, event.type]);
    },
  );

  assert.equal(
    elements.piano.style.getPropertyValue("--white-key-count"),
    "4",
  );
  assert.equal(
    elements.piano.getAttribute("aria-label"),
    "Piano with 2 zones, from C4 to F4",
  );
  assert.deepEqual(
    [...elements.piano.querySelectorAll(".key.white")].map(
      (key) => key.dataset.midi,
    ),
    ["60", "62", "64", "65"],
  );
  assert.deepEqual(
    [...elements.piano.querySelectorAll(".key.black")].map(
      (key) => key.dataset.midi,
    ),
    ["61", "63"],
  );
  assert.deepEqual(
    [...elements.piano.querySelectorAll(".chunk-start")].map(
      (key) => key.dataset.midi,
    ),
    ["60", "65"],
  );
  assert.equal(
    document.querySelector('[data-midi="60"] span').textContent,
    "C4",
  );
  assert.equal(
    document.querySelector('[data-midi="61"] span'),
    null,
  );
  assert.equal(
    document.querySelector('[data-midi="61"]').getAttribute("aria-label"),
    "C♯4",
  );

  document
    .querySelector('[data-midi="63"]')
    .dispatchEvent(new dom.window.Event("pointerdown"));
  assert.deepEqual(inputs, [[63, "63", "pointerdown"]]);

  dom.window.close();
});

test("les points de progression sont remplacés et classés", () => {
  const { dom, elements, renderer } = createFixture();

  renderer.renderProgressDots(5, 2, 2);
  assert.deepEqual(
    [...elements.progressDots.children].map((dot) => dot.className),
    [
      "progress-dot complete",
      "progress-dot complete",
      "progress-dot current",
      "progress-dot",
      "progress-dot",
    ],
  );

  renderer.renderProgressDots(3, 3);
  assert.deepEqual(
    [...elements.progressDots.children].map((dot) => dot.className),
    [
      "progress-dot complete",
      "progress-dot complete",
      "progress-dot complete",
    ],
  );

  dom.window.close();
});

test("le contrôle favori conserve son symbole et ses attributs", () => {
  const { document, dom, renderer } = createFixture();
  const favorite = document.querySelector("#favorite");

  renderer.renderFavoriteControl(favorite, {
    favorite: false,
    subject: "Charlie Parker, Donna Lee",
  });
  assert.equal(favorite.textContent, "♡");
  assert.equal(favorite.classList.contains("active"), false);
  assert.equal(favorite.getAttribute("aria-pressed"), "false");
  assert.equal(
    favorite.getAttribute("aria-label"),
    "Add Charlie Parker, Donna Lee to favorites",
  );

  renderer.renderFavoriteControl(favorite, {
    favorite: true,
    subject: "Charlie Parker, Donna Lee",
  });
  assert.equal(favorite.textContent, "♥");
  assert.equal(favorite.classList.contains("active"), true);
  assert.equal(favorite.getAttribute("aria-pressed"), "true");
  assert.equal(
    favorite.getAttribute("aria-label"),
    "Remove Charlie Parker, Donna Lee from favorites",
  );

  dom.window.close();
});

test("la notation étoilée conserve sélection et état pressé", () => {
  const { document, dom, renderer } = createFixture();
  const rating = document.querySelector("#rating");
  const buttons = [...rating.querySelectorAll("[data-rating]")];

  renderer.renderStarRating(rating, { rating: 2, visible: true });
  assert.equal(rating.hidden, false);
  assert.equal(rating.getAttribute("aria-label"), "Current rating: 2 stars");
  assert.deepEqual(
    buttons.map((button) => button.classList.contains("selected")),
    [true, true, false],
  );
  assert.deepEqual(
    buttons.map((button) => button.getAttribute("aria-pressed")),
    ["false", "true", "false"],
  );

  renderer.renderStarRating(rating, { rating: 0, visible: false });
  assert.equal(rating.hidden, true);
  assert.equal(rating.getAttribute("aria-label"), "Unrated phrase");
  assert.deepEqual(
    buttons.map((button) => button.classList.contains("selected")),
    [false, false, false],
  );

  dom.window.close();
});

test("les réglages de phrase conservent sorties et bornes", () => {
  const { dom, elements, renderer } = createFixture();
  const settings = {
    notesMax: 12,
    fullPhraseNoteCount: 20,
    ignoredShortestNotes: 2,
  };

  renderer.renderPhraseControls({
    visible: true,
    settings,
    locked: false,
  });
  assert.equal(elements.phraseAdjustments.hidden, false);
  assert.equal(elements.phraseLengthOutput.value, "12/20");
  assert.equal(elements.phraseLengthDecrease.disabled, false);
  assert.equal(elements.phraseLengthIncrease.disabled, false);
  assert.equal(elements.openPhraseEditor.disabled, false);

  renderer.renderPhraseControls({
    visible: true,
    settings,
    locked: true,
  });
  assert.equal(elements.phraseLengthDecrease.disabled, true);
  assert.equal(elements.phraseLengthIncrease.disabled, true);
  assert.equal(elements.openPhraseEditor.disabled, true);

  renderer.renderPhraseControls({
    visible: true,
    settings: {
      notesMax: 1,
      fullPhraseNoteCount: 20,
      ignoredShortestNotes: 0,
    },
  });
  assert.equal(elements.phraseLengthDecrease.disabled, true);
  assert.equal(elements.phraseLengthIncrease.disabled, false);
  assert.equal(elements.openPhraseEditor.disabled, false);

  renderer.renderPhraseControls({ visible: false });
  assert.equal(elements.phraseAdjustments.hidden, true);

  dom.window.close();
});

test("l’accueil et les favoris délèguent leurs actions sans état caché", () => {
  const { document, dom, elements, renderer } = createFixture();
  renderer.renderHomeState(null);
  assert.equal(elements.startChallenge.hidden, false);
  assert.equal(elements.resumeChallenge.hidden, true);
  assert.equal(elements.sessionStatus.hidden, true);

  renderer.renderHomeState({
    phase: "training",
    phraseIndex: 1,
    toneIndex: 2,
  });
  assert.equal(elements.startChallenge.hidden, true);
  assert.equal(elements.resumeChallenge.hidden, false);
  assert.equal(
    elements.sessionStatus.textContent,
    "Session in progress · phrase 2 of 3, key 3 of 3.",
  );

  renderer.showHomePanel(false);
  assert.equal(document.body.classList.contains("home-view"), false);
  assert.equal(elements.homePanel.hidden, true);
  assert.equal(elements.favoritesPanel.hidden, false);

  const actions = [];
  renderer.renderFavorites(
    [
      {
        phraseKey: "solo:3",
        performer: "Charlie Parker",
        title: "Donna Lee",
      },
    ],
    {
      onOpen: (phraseKey) => actions.push(["open", phraseKey]),
    },
  );
  assert.equal(elements.favoritesEmpty.hidden, true);
  assert.equal(
    elements.favoritesList.querySelector("strong").textContent,
    "Charlie Parker",
  );
  assert.equal(
    elements.favoritesList.querySelector("span").textContent,
    "Donna Lee · phrase 3",
  );
  assert.equal(
    elements.favoritesList.querySelector(".favorite-row-remove"),
    null,
  );
  assert.equal(elements.favoritesList.querySelectorAll("button").length, 1);
  elements.favoritesList.querySelector(".favorite-row-main").click();
  assert.deepEqual(actions, [["open", "solo:3"]]);

  dom.window.close();
});

test("les vues défi, review et session de notation restent stateless", () => {
  const { document, dom, elements, renderer } = createFixture();
  renderer.renderChallengeProgress(
    {
      phase: "training",
      phraseIndex: 1,
      toneIndex: 0,
    },
    3,
  );
  assert.equal(elements.challengeProgress.hidden, false);
  assert.equal(elements.progressDots.hidden, false);
  assert.equal(elements.reviewNavigation.hidden, true);
  assert.equal(elements.freeNavigation.hidden, true);
  assert.equal(elements.progressTitle.textContent, "Phrase 2 of 3");
  assert.equal(elements.progressDetail.textContent, "Key 1 of 3");
  assert.equal(
    elements.progressDots.querySelectorAll(".complete").length,
    3,
  );

  renderer.renderChallengeProgress(
    {
      phase: "sudden-death",
      suddenQueue: ["b", "c"],
      suddenCompleted: ["a"],
    },
    0,
  );
  assert.equal(
    document.body.classList.contains("sudden-death-mode"),
    true,
  );
  assert.equal(elements.progressTitle.textContent, "Sudden death");
  assert.equal(elements.progressDetail.textContent, "2 phrases to complete");

  renderer.renderReviewProgress({ index: 1, total: 3 });
  assert.equal(elements.progressDots.hidden, true);
  assert.equal(elements.reviewNavigation.hidden, false);
  assert.equal(elements.reviewCounter.textContent, "2/3");
  assert.equal(elements.reviewPrevious.disabled, false);
  assert.equal(elements.reviewNext.disabled, false);
  assert.equal(elements.freeNavigation.hidden, true);

  renderer.renderFreeProgress({ index: 0, total: 2 });
  assert.equal(elements.reviewNavigation.hidden, true);
  assert.equal(elements.freeNavigation.hidden, false);
  assert.equal(elements.progressTitle.textContent, "Free mode");
  assert.equal(elements.progressDetail.textContent, "Phrase 1 of 2");
  assert.equal(elements.freeCounter.textContent, "1/2");
  assert.equal(elements.freePrevious.disabled, true);
  assert.equal(elements.freeNext.disabled, false);

  renderer.renderLickExerciseProgress({
    current: 5,
    patternId: "P13",
  });
  assert.equal(elements.progressDots.hidden, true);
  assert.equal(elements.reviewNavigation.hidden, true);
  assert.equal(elements.freeNavigation.hidden, true);
  assert.equal(elements.progressTitle.textContent, "Lick 5");
  assert.equal(elements.progressDetail.textContent, "P13");

  renderer.renderRatingSession({
    count: 2,
    distribution: { 1: 1, 2: 0, 3: 1 },
    newScopeCount: 1,
    protocol: {
      covered: 25,
      total: 100,
      structuralExcluded: 4,
    },
  });
  assert.match(elements.ratingSessionSummary.textContent, /^2 phrases rated/);
  assert.match(elements.ratingCoverageSummary.textContent, /25%/);
  assert.match(elements.ratingCoverageSummary.textContent, /4 structural/);
  assert.match(elements.ratingCoverageSummary.textContent, /1 new global/);
  assert.equal(elements.undoRating.disabled, false);

  dom.window.close();
});

test("la source et la fin de défi conservent contenu et favoris", () => {
  const { document, dom, elements, renderer } = createFixture();
  renderer.renderSource(
    {
      performer: "Charlie Parker",
      title: "Donna Lee",
      phrase: "3",
      phraseKey: "wjazzd-v2.1-55:3",
      transposition: 2,
      originalTempo: 188,
      url: "https://example.test/source",
      dataset: "WJazzD",
    },
    {
      developerMode: true,
      mode: "rating",
      sourceLabel: "transcription",
    },
  );
  assert.equal(
    elements.sourceSummary.textContent,
    "Charlie Parker — Donna Lee · phrase 3",
  );
  assert.equal(elements.sourceLine.hidden, false);
  assert.equal(
    elements.sourceDetails.textContent,
    "Source: transcription · transposition +2 semitones · original tempo 188 BPM.",
  );
  assert.equal(elements.phraseReference.hidden, false);
  assert.equal(elements.phraseId.textContent, "wjazzd-v2.1-55:3");
  assert.equal(elements.sourceLink.textContent, "WJazzD");

  const favorites = new Set();
  renderer.renderCompletedChallenge(
    [
      {
        phraseKey: "wjazzd-v2.1-55:3",
        performer: "Charlie Parker",
        title: "Donna Lee",
      },
    ],
    {
      isFavorite: (phraseKey) => favorites.has(phraseKey),
      onToggleFavorite: (phraseKey) => {
        if (favorites.has(phraseKey)) favorites.delete(phraseKey);
        else favorites.add(phraseKey);
      },
    },
  );
  const favorite = document.querySelector(".completed-phrase-favorite");
  assert.equal(
    document.querySelector(".completed-phrase span").textContent,
    "Donna Lee · phrase 3",
  );
  assert.equal(favorite.textContent, "♡");
  favorite.click();
  assert.equal(favorite.textContent, "♥");
  assert.equal(favorites.has("wjazzd-v2.1-55:3"), true);

  dom.window.close();
});
