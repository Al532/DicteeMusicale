import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PHRASE_RATINGS } from "../data/default-ratings.js";
import { DEFAULT_RATING_SCOPES } from "../data/default-ratings.js";
import { createRatingWorkflow } from "../src/rating-workflow.js";

const SOURCE = {
  phraseKey: "wjazzd-v2.1-1:1",
  soloId: "wjazzd-v2.1-1",
  performer: "Art Pepper",
  title: "Anthropology",
  phrase: "1",
  url: "https://example.test/source",
};

test("le workflow expose le protocole complet sans données détaillées", () => {
  const workflow = createRatingWorkflow({
    embeddedRatings: DEFAULT_PHRASE_RATINGS,
    embeddedScopes: DEFAULT_RATING_SCOPES,
  });
  const summary = workflow.protocol();
  assert.equal(summary.total, 11_082);
  assert.equal(summary.explicit, 763);
  assert.equal(summary.covered, 4_185);
  assert.equal(summary.structuralExcluded, 3_416);
  assert.deepEqual(summary.distribution, {
    1: 3_755,
    2: 219,
    3: 211,
  });
});

test("une note de session est persistable puis annulable", () => {
  const workflow = createRatingWorkflow();
  workflow.beginRatingSession();
  const now = new Date("2026-07-30T12:00:00.000Z");

  assert.equal(
    workflow.rateForSession(SOURCE, 3, { now }),
    3,
  );
  assert.deepEqual(workflow.localRatings()[SOURCE.phraseKey], {
    rating: 3,
    updatedAt: now.toISOString(),
    soloId: SOURCE.soloId,
    performer: SOURCE.performer,
    title: SOURCE.title,
    phrase: SOURCE.phrase,
    sourceUrl: SOURCE.url,
    origin: "protocol",
  });
  assert.deepEqual(workflow.sessionSummary().distribution, {
    1: 0,
    2: 0,
    3: 1,
  });

  assert.equal(
    workflow.undoLastSessionRating().phraseKey,
    SOURCE.phraseKey,
  );
  assert.equal(
    workflow.localRatings()[SOURCE.phraseKey],
    undefined,
  );
  assert.equal(workflow.sessionSummary().count, 0);
});

test("la review borne la navigation et conserve l’index au rafraîchissement", () => {
  const workflow = createRatingWorkflow();
  workflow.beginReview(["a:1", "b:2", "c:3"]);
  assert.equal(workflow.reviewState().currentKey, "a:1");
  assert.equal(workflow.moveReview(-1), null);
  assert.equal(workflow.moveReview(1), "b:2");
  assert.equal(workflow.moveReview(20), "c:3");

  const refreshed = workflow.refreshReview(["a:1", "b:2"]);
  assert.equal(refreshed.index, 1);
  assert.equal(refreshed.currentKey, "b:2");
  assert.equal(refreshed.total, 2);
});
