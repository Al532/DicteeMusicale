export const SETTINGS_KEY = "dictee-musicale.settings.v1";
export const RATINGS_KEY = "dictee-musicale.ratings.v1";
export const RATING_SCOPES_KEY = "dictee-musicale.rating-scopes.v1";
export const PHRASE_SETTINGS_KEY = "dictee-musicale.phrase-settings.v1";
export const CHALLENGE_SESSION_KEY =
  "dictee-musicale.challenge-session.v1";
export const COMPLETED_PHRASES_KEY =
  "dictee-musicale.completed-phrases.v1";
export const FAVORITES_KEY = "dictee-musicale.favorites.v1";

export const STORAGE_KEYS = Object.freeze({
  settings: SETTINGS_KEY,
  ratings: RATINGS_KEY,
  ratingScopes: RATING_SCOPES_KEY,
  phraseSettings: PHRASE_SETTINGS_KEY,
  challengeSession: CHALLENGE_SESSION_KEY,
  completedPhrases: COMPLETED_PHRASES_KEY,
  favorites: FAVORITES_KEY,
});

export const DEFAULT_REAL_SPEED_PERCENT = 100;
export const MIN_REAL_SPEED_PERCENT = 25;
export const MAX_REAL_SPEED_PERCENT = 100;
export const DEFAULT_MELODY_SOUND = "synthetic";

function storageOrDefault(storage) {
  return storage ?? globalThis.localStorage;
}

export function readJson(key, fallback, storage) {
  try {
    return JSON.parse(storageOrDefault(storage).getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value, storage) {
  try {
    storageOrDefault(storage).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(key, storage) {
  try {
    storageOrDefault(storage).removeItem(key);
  } catch {
    // Le stockage peut être indisponible en navigation privée ou saturé.
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function settingsRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function normalizeGlobalSettings(value = {}) {
  const settings = settingsRecord(value);
  return {
    realSpeed: clamp(
      Number(
        settings.realSpeed ??
          settings.parkerSpeed ??
          DEFAULT_REAL_SPEED_PERCENT,
      ),
      MIN_REAL_SPEED_PERCENT,
      MAX_REAL_SPEED_PERCENT,
    ),
    developerMode: Boolean(settings.developerMode),
    transposeOriginal: Boolean(settings.transposeOriginal),
    melodySound: DEFAULT_MELODY_SOUND,
  };
}

export function serializedGlobalSettings(value = {}) {
  const settings = normalizeGlobalSettings(value);
  return {
    realSpeed: settings.realSpeed,
    developerMode: settings.developerMode,
    transposeOriginal: settings.transposeOriginal,
  };
}

export function loadGlobalSettings(storage) {
  return normalizeGlobalSettings(readJson(SETTINGS_KEY, {}, storage));
}

export function saveGlobalSettings(value, storage) {
  return writeJson(
    SETTINGS_KEY,
    serializedGlobalSettings(value),
    storage,
  );
}

export function loadAndMigrateGlobalSettings(storage) {
  const settings = loadGlobalSettings(storage);
  saveGlobalSettings(settings, storage);
  return settings;
}

export function loadStoredObject(key, fallback = {}, storage) {
  const value = readJson(key, fallback, storage);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

export function loadStoredArray(key, fallback = [], storage) {
  const value = readJson(key, fallback, storage);
  return Array.isArray(value) ? value : fallback;
}
