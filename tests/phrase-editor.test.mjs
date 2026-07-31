import test from "node:test";
import assert from "node:assert/strict";

import {
  PHRASE_EDITOR_TIME_STEP,
  createPhraseEditorModel,
} from "../src/phrase-editor.js";

const ORIGINAL_EVENTS = [
  [60, 1, 0.2, 1],
  [62, 1.3, 0.15, 1],
  [64, 1.55, 0.25, 1],
];

test("l’éditeur modifie hauteur, début et durée avec annulation", () => {
  const model = createPhraseEditorModel({
    events: ORIGINAL_EVENTS,
    originalEvents: ORIGINAL_EVENTS,
  });

  assert.equal(model.isOriginal, true);
  model.changePitch(1);
  model.shiftOnset(PHRASE_EDITOR_TIME_STEP);
  model.changeDuration(PHRASE_EDITOR_TIME_STEP);
  assert.deepEqual(model.selectedEvent, [61, 1.025, 0.225, 1]);
  assert.equal(model.isOriginal, false);
  assert.equal(model.canUndo, true);

  model.undo();
  assert.equal(model.selectedEvent[2], 0.2);
  model.redo();
  assert.equal(model.selectedEvent[2], 0.225);
  model.restoreOriginal();
  assert.deepEqual(model.events, ORIGINAL_EVENTS);
  assert.equal(model.isOriginal, true);
});

test("ajout, duplication et suppression restent monodiques et jouables", () => {
  const model = createPhraseEditorModel({
    events: ORIGINAL_EVENTS,
    originalEvents: ORIGINAL_EVENTS,
  });

  model.select(1);
  model.addAfter();
  assert.equal(model.events.length, 4);
  assert.ok(model.events[1][1] < model.events[2][1]);
  assert.ok(model.events[2][1] < model.events[3][1]);

  const nextOnset = model.events[3][1];
  model.duplicateSelected();
  assert.equal(model.events.length, 5);
  assert.ok(model.events[4][1] > nextOnset);

  while (model.events.length > 1) model.deleteSelected();
  assert.equal(model.events.length, 1);
  assert.equal(model.deleteSelected(), false);
});
