import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { bindAppEvents, queryAppElements } from "../src/app-dom.js";

const html = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);

test("queryAppElements résout le contrat DOM de l’application", () => {
  const dom = new JSDOM(html);
  const elements = queryAppElements(dom.window.document);

  assert.equal(elements.homePanel.id, "home-panel");
  assert.equal(elements.gameSpeed.id, "game-speed");
  assert.equal(elements.midiConnect.id, "midi-connect");
  assert.equal(elements.recordingModal.id, "recording-modal");
  assert.equal(
    elements.playRecordingWorkshopPhrase.id,
    "play-recording-workshop-phrase",
  );
  assert.equal(
    elements.editRecordingWorkshopPhrase.id,
    "edit-recording-workshop-phrase",
  );
  assert.equal(elements.openLickExplorer.id, "open-lick-explorer");
  assert.equal(elements.startLickExercise.id, "start-lick-exercise");
  assert.equal(elements.lickExplorerPanel.id, "lick-explorer-panel");
  assert.equal(elements.developerOnly.length, 1);
  assert.equal(elements.quickRatingButtons.length, 3);
  assert.equal(elements.openPhraseEditor.id, "open-phrase-editor");
  assert.equal(elements.phraseEditorModal.id, "phrase-editor-modal");
  assert.equal(elements.freePrevious.id, "free-previous");
  assert.equal(elements.freeNext.id, "free-next");

  dom.window.close();
});

test("bindAppEvents transmet les valeurs, raccourcis et se nettoie", () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const elements = queryAppElements(document);
  const calls = [];
  const actions = {
    closeRecordingPlayer() {
      calls.push(["closeRecordingPlayer"]);
    },
    closePhraseEditor() {
      calls.push(["closePhraseEditor"]);
    },
    connectMidiInput() {
      calls.push(["connectMidiInput"]);
    },
    editSelectedRecordingWorkshopPhrase() {
      calls.push(["editSelectedRecordingWorkshopPhrase"]);
    },
    isRatingModeActive() {
      return true;
    },
    moveFreePhrase(offset) {
      calls.push(["moveFreePhrase", offset]);
    },
    playSelectedRecordingWorkshopPhrase() {
      calls.push(["playSelectedRecordingWorkshopPhrase"]);
    },
    openCurrentPhraseEditor() {
      calls.push(["openCurrentPhraseEditor"]);
    },
    openLickExplorer() {
      calls.push(["openLickExplorer"]);
    },
    setDeveloperMode(enabled) {
      calls.push(["setDeveloperMode", enabled]);
    },
    setQuickRating(value) {
      calls.push([
        "setQuickRating",
        typeof value === "number"
          ? value
          : Number(value.currentTarget.dataset.quickRating),
      ]);
    },
    startLickExercise() {
      calls.push(["startLickExercise"]);
    },
    startMode(mode) {
      calls.push(["startMode", mode]);
    },
    syncGameSpeed(value) {
      calls.push(["syncGameSpeed", value]);
    },
    togglePlayback() {
      calls.push(["togglePlayback"]);
    },
  };
  const unbind = bindAppEvents(elements, actions, document);

  elements.gameSpeed.value = "75";
  elements.gameSpeed.dispatchEvent(new dom.window.Event("input"));
  elements.midiConnect.click();
  elements.startRating.click();
  elements.startLickExercise.click();
  elements.playRecordingWorkshopPhrase.click();
  elements.editRecordingWorkshopPhrase.click();
  elements.openLickExplorer.click();
  elements.openPhraseEditor.click();
  elements.freeNext.click();
  elements.freePrevious.click();
  elements.developerMode.checked = true;
  elements.developerMode.dispatchEvent(new dom.window.Event("change"));

  document.body.classList.add("game-mode");
  const ratingShortcut = new dom.window.KeyboardEvent("keydown", {
    key: "2",
    cancelable: true,
  });
  document.dispatchEvent(ratingShortcut);
  assert.equal(ratingShortcut.defaultPrevented, true);

  const replayShortcut = new dom.window.KeyboardEvent("keydown", {
    code: "Space",
    cancelable: true,
  });
  document.dispatchEvent(replayShortcut);
  assert.equal(replayShortcut.defaultPrevented, true);

  elements.phraseEditorModal.hidden = false;
  const editorEscape = new dom.window.KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
  });
  document.dispatchEvent(editorEscape);
  assert.equal(editorEscape.defaultPrevented, true);
  elements.phraseEditorModal.hidden = true;

  elements.recordingModal.hidden = false;
  const escape = new dom.window.KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
  });
  document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);

  assert.deepEqual(calls, [
    ["syncGameSpeed", "75"],
    ["connectMidiInput"],
    ["startMode", "rating"],
    ["startLickExercise"],
    ["playSelectedRecordingWorkshopPhrase"],
    ["editSelectedRecordingWorkshopPhrase"],
    ["openLickExplorer"],
    ["openCurrentPhraseEditor"],
    ["moveFreePhrase", 1],
    ["moveFreePhrase", -1],
    ["setDeveloperMode", true],
    ["setQuickRating", 2],
    ["togglePlayback"],
    ["closePhraseEditor"],
    ["closeRecordingPlayer"],
  ]);

  unbind();
  unbind();
  elements.startRating.click();
  elements.gameSpeed.dispatchEvent(new dom.window.Event("input"));
  assert.equal(calls.length, 15);

  dom.window.close();
});
