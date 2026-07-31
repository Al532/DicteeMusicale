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

test("l’ajout remplit l’espace disponible sans décaler la suite", () => {
  const model = createPhraseEditorModel({
    events: ORIGINAL_EVENTS,
    originalEvents: ORIGINAL_EVENTS,
  });

  const followingEvents = ORIGINAL_EVENTS.slice(1);
  assert.equal(model.addAfter(), true);
  assert.deepEqual(model.events[1], [60, 1.2, 0.1, 1]);
  assert.equal(model.events[1][1] + model.events[1][2], 1.3);
  assert.deepEqual(model.events.slice(2), followingEvents);
  assert.equal(model.selectedIndex, 1);
  assert.equal(model.duplicateSelected, undefined);
});

test("l’ajout préserve les très petits espaces et refuse un chevauchement", () => {
  const shortGapEvents = [
    [60, 0, 0.0463, 1],
    [62, 0.0517, 0.05, 1],
  ];
  const model = createPhraseEditorModel({
    events: shortGapEvents,
    originalEvents: shortGapEvents,
  });

  assert.equal(model.canAddAfter, true);
  assert.equal(model.addAfter(), true);
  assert.deepEqual(model.events, [
    [60, 0, 0.0463, 1],
    [60, 0.0463, 0.0054, 1],
    [62, 0.0517, 0.05, 1],
  ]);

  const overlappingEvents = [
    [60, 0, 0.2, 1],
    [62, 0.19, 0.1, 1],
  ];
  const overlapping = createPhraseEditorModel({
    events: overlappingEvents,
    originalEvents: overlappingEvents,
  });
  assert.equal(overlapping.canAddAfter, false);
  assert.equal(overlapping.addAfter(), false);
  assert.deepEqual(overlapping.events, overlappingEvents);
});

test("l’ajout après la dernière note conserve sa durée", () => {
  const model = createPhraseEditorModel({
    events: ORIGINAL_EVENTS,
    originalEvents: ORIGINAL_EVENTS,
  });

  model.select(2);
  assert.equal(model.addAfter(), true);
  assert.deepEqual(model.events[3], [64, 1.8, 0.25, 1]);

  while (model.events.length > 1) model.deleteSelected();
  assert.equal(model.events.length, 1);
  assert.equal(model.deleteSelected(), false);
});
