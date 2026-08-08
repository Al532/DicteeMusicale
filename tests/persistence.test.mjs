import test from "node:test";
import assert from "node:assert/strict";

import {
  CHALLENGE_SESSION_KEY,
  COMPLETED_PHRASES_KEY,
  DEFAULT_MELODY_SOUND,
  FAVORITES_KEY,
  PHRASE_SETTINGS_KEY,
  RECORDING_VALIDATIONS_KEY,
  REAL_SPEED_DEFAULT_REVISION,
  RATINGS_KEY,
  RATING_SCOPES_KEY,
  SETTINGS_KEY,
  STORAGE_KEYS,
  loadAndMigrateGlobalSettings,
  loadGlobalSettings,
  loadStoredArray,
  loadStoredObject,
  normalizeGlobalSettings,
  readJson,
  removeStoredValue,
  saveGlobalSettings,
  serializedGlobalSettings,
  writeJson,
} from "../src/persistence.js";

function memoryStorage(initial = {}) {
  const values = new Map(
    Object.entries(initial).map(([key, value]) => [key, String(value)]),
  );
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("les clés de stockage conservent leurs identifiants historiques", () => {
  assert.deepEqual(STORAGE_KEYS, {
    settings: SETTINGS_KEY,
    ratings: RATINGS_KEY,
    ratingScopes: RATING_SCOPES_KEY,
    phraseSettings: PHRASE_SETTINGS_KEY,
    recordingValidations: RECORDING_VALIDATIONS_KEY,
    challengeSession: CHALLENGE_SESSION_KEY,
    completedPhrases: COMPLETED_PHRASES_KEY,
    favorites: FAVORITES_KEY,
  });
  assert.equal(SETTINGS_KEY, "dictee-musicale.settings.v1");
  assert.equal(RATINGS_KEY, "dictee-musicale.ratings.v1");
  assert.equal(
    RATING_SCOPES_KEY,
    "dictee-musicale.rating-scopes.v1",
  );
  assert.equal(
    PHRASE_SETTINGS_KEY,
    "dictee-musicale.phrase-settings.v1",
  );
  assert.equal(
    RECORDING_VALIDATIONS_KEY,
    "dictee-musicale.recording-validations.v1",
  );
  assert.equal(
    CHALLENGE_SESSION_KEY,
    "dictee-musicale.challenge-session.v1",
  );
  assert.equal(
    COMPLETED_PHRASES_KEY,
    "dictee-musicale.completed-phrases.v1",
  );
  assert.equal(FAVORITES_KEY, "dictee-musicale.favorites.v1");
});

test("readJson et writeJson gardent les erreurs de stockage silencieuses", () => {
  const storage = memoryStorage();
  assert.equal(readJson("missing", "fallback", storage), "fallback");
  assert.equal(writeJson("value", { ok: true }, storage), true);
  assert.deepEqual(readJson("value", null, storage), { ok: true });

  storage.setItem("invalid", "{");
  assert.deepEqual(readJson("invalid", { safe: true }, storage), {
    safe: true,
  });
  storage.setItem("null", "null");
  assert.equal(readJson("null", "fallback", storage), "fallback");

  const unavailable = {
    getItem() {
      throw new Error("unavailable");
    },
    setItem() {
      throw new Error("full");
    },
    removeItem() {
      throw new Error("unavailable");
    },
  };
  assert.equal(readJson("value", 42, unavailable), 42);
  assert.equal(writeJson("value", true, unavailable), false);
  assert.doesNotThrow(() => removeStoredValue("value", unavailable));

  const circular = {};
  circular.self = circular;
  assert.equal(writeJson("circular", circular, storage), false);
});

test("removeStoredValue supprime une valeur existante", () => {
  const storage = memoryStorage({ removable: JSON.stringify(true) });
  removeStoredValue("removable", storage);
  assert.equal(readJson("removable", false, storage), false);
});

test("les réglages globaux migrent parkerSpeed et imposent le son synthétique", () => {
  assert.deepEqual(
    normalizeGlobalSettings({
      parkerSpeed: 75,
      developerMode: 1,
      transposeOriginal: "yes",
      melodySound: "piano",
      randomLength: 12,
    }),
    {
      realSpeed: 75,
      developerMode: true,
      melodySound: DEFAULT_MELODY_SOUND,
    },
  );

  assert.equal(
    normalizeGlobalSettings({ realSpeed: 55, parkerSpeed: 75 })
      .realSpeed,
    55,
  );
  assert.equal(normalizeGlobalSettings({ realSpeed: 5 }).realSpeed, 25);
  assert.equal(normalizeGlobalSettings({ realSpeed: 150 }).realSpeed, 100);
  assert.equal(normalizeGlobalSettings().realSpeed, 100);
});

test("la sérialisation omet les anciens réglages et le son implicite", () => {
  assert.deepEqual(
    serializedGlobalSettings({
      parkerSpeed: 80,
      developerMode: true,
      transposeOriginal: false,
      melodySound: "clarinet",
      selectedPerformers: ["Charlie Parker"],
    }),
    {
      realSpeed: 80,
      realSpeedDefaultRevision: REAL_SPEED_DEFAULT_REVISION,
      developerMode: true,
    },
  );
});

test("le chargement migratoire applique une fois la vitesse par défaut", () => {
  const storage = memoryStorage({
    [SETTINGS_KEY]: JSON.stringify({
      parkerSpeed: 70,
      randomLength: 16,
      melodySound: "piano",
    }),
  });

  assert.deepEqual(loadAndMigrateGlobalSettings(storage), {
    realSpeed: 100,
    developerMode: false,
    melodySound: DEFAULT_MELODY_SOUND,
  });
  assert.deepEqual(readJson(SETTINGS_KEY, null, storage), {
    realSpeed: 100,
    realSpeedDefaultRevision: REAL_SPEED_DEFAULT_REVISION,
    developerMode: false,
  });

  assert.equal(
    saveGlobalSettings(
      {
        realSpeed: 30,
        developerMode: true,
      },
      storage,
    ),
    true,
  );
  assert.deepEqual(loadGlobalSettings(storage), {
    realSpeed: 30,
    developerMode: true,
    melodySound: DEFAULT_MELODY_SOUND,
  });
  assert.deepEqual(loadAndMigrateGlobalSettings(storage), {
    realSpeed: 30,
    developerMode: true,
    melodySound: DEFAULT_MELODY_SOUND,
  });
});

test("les helpers de collections rejettent les formes inattendues", () => {
  const storage = memoryStorage({
    object: JSON.stringify({ phrase: 3 }),
    array: JSON.stringify(["a", "b"]),
    wrongObject: JSON.stringify([]),
    wrongArray: JSON.stringify({}),
    nullValue: "null",
  });

  assert.deepEqual(loadStoredObject("object", {}, storage), { phrase: 3 });
  assert.deepEqual(loadStoredArray("array", [], storage), ["a", "b"]);
  assert.deepEqual(loadStoredObject("wrongObject", {}, storage), {});
  assert.deepEqual(loadStoredArray("wrongArray", [], storage), []);
  assert.deepEqual(loadStoredObject("nullValue", {}, storage), {});
  assert.deepEqual(loadStoredArray("missing", [], storage), []);
});
