import {
  DEFAULT_PHRASE_RATINGS as BASE_PHRASE_RATINGS,
  DEFAULT_RATING_SCOPES,
} from "./default-ratings-base.js";
import { PHRASE_RATING_OVERRIDES } from "./imported-data-2026-08-01.js";

export const DEFAULT_PHRASE_RATINGS = Object.freeze({
  ...BASE_PHRASE_RATINGS,
  ...PHRASE_RATING_OVERRIDES,
});

export { DEFAULT_RATING_SCOPES };
