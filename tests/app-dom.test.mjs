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
  assert.equal(elements.recordingModal.id, "recording-modal");
  assert.equal(
    elements.playRecordingWorkshopPhrase.id,
    "play-recording-workshop-phrase",
  );
  assert.equal(elements.developerOnly.length, 1);
  assert.equal(elements.quickRatingButtons.length, 3);

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
    isRatingModeActive() {
      return true;
    },
    playSelectedRecordingWorkshopPhrase() {
      calls.push(["playSelectedRecordingWorkshopPhrase"]);
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
  elements.startRating.click();
  elements.playRecordingWorkshopPhrase.click();
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

  elements.recordingModal.hidden = false;
  const escape = new dom.window.KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
  });
  document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);

  assert.deepEqual(calls, [
    ["syncGameSpeed", "75"],
    ["startMode", "rating"],
    ["playSelectedRecordingWorkshopPhrase"],
    ["setDeveloperMode", true],
    ["setQuickRating", 2],
    ["togglePlayback"],
    ["closeRecordingPlayer"],
  ]);

  unbind();
  unbind();
  elements.startRating.click();
  elements.gameSpeed.dispatchEvent(new dom.window.Event("input"));
  assert.equal(calls.length, 7);

  dom.window.close();
});
