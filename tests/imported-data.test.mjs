import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PHRASE_RATINGS } from "../data/default-ratings.js";
import { DEFAULT_PHRASE_SETTINGS } from "../data/default-phrase-settings.js";
import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";

test("l’export du 1er août est intégré aux données embarquées", () => {
  assert.equal(Object.keys(DEFAULT_PHRASE_RATINGS).length, 763);
  assert.equal(Object.keys(DEFAULT_PHRASE_SETTINGS).length, 57);
  assert.equal(Object.keys(RECORDING_VALIDATIONS).length, 94);

  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-135:4"].rating, 2);
  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-16:2"].rating, 2);
  assert.equal(DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-16:2"].notesMax, 23);
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-241:7"].editedEvents.length,
    17,
  );
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-278:4"].editedEvents.length,
    26,
  );
});
