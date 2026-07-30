import test from "node:test";
import assert from "node:assert/strict";

import { recordingUrlAtPhrase } from "../src/recording.js";

test("le lien YouTube commence au même point que l’extrait local", () => {
  assert.equal(
    recordingUrlAtPhrase({
      audioSourceUrl: "https://www.youtube.com/watch?v=89jYv-h7OJA",
      audioOffset: 39.466,
      onsetStart: 1.1813,
    }),
    "https://www.youtube.com/watch?v=89jYv-h7OJA&t=40s",
  );
});

test("le lien remplace un ancien timing et tolère les métadonnées partielles", () => {
  assert.equal(
    recordingUrlAtPhrase({
      audioSourceUrl: "https://www.youtube.com/watch?v=example&t=9s",
      audioOffset: 23.714,
      onsetStart: 5.5859,
    }),
    "https://www.youtube.com/watch?v=example&t=29s",
  );
  assert.equal(
    recordingUrlAtPhrase({
      audioSourceUrl: "https://www.youtube.com/watch?v=example",
    }),
    "https://www.youtube.com/watch?v=example",
  );
  assert.equal(recordingUrlAtPhrase({ audioSourceUrl: "not a URL" }), null);
  assert.equal(recordingUrlAtPhrase(null), null);
});
