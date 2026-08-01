import {
  DEFAULT_PHRASE_SETTINGS as BASE_PHRASE_SETTINGS,
} from "./default-phrase-settings-base.js";
import { PHRASE_SETTING_OVERRIDES } from "./imported-data-2026-08-01.js";

export const DEFAULT_PHRASE_SETTINGS = Object.freeze({
  ...BASE_PHRASE_SETTINGS,
  ...PHRASE_SETTING_OVERRIDES,
});
