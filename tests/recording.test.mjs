import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeRecordingValidations,
  normalizeRecordingValidation,
  recordingValidationsModule,
  recordingsAtPhrase,
  youtubeIdFromValue,
} from "../src/recording.js";
import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";
import { WJAZZTUBE_RECORDINGS } from "../data/wjazztube-recordings.js";
import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";

test("les anciennes sources directes et JazzTube restent invisibles", () => {
  assert.deepEqual(
    recordingsAtPhrase({
      soloId: "wjazzd-v2.1-10",
      audioSourceUrl: "https://www.youtube.com/watch?v=8B3W29P7lD8",
      audioOffset: 111.8102,
      onsetStart: 5,
      onsetEnd: 10,
    }),
    [],
  );
  assert.deepEqual(RECORDING_VALIDATIONS, {});
});

test("seule une validation explicite fournit le lecteur intégré borné", () => {
  const source = {
    soloId: "wjazzd-v2.1-10",
    onsetStart: 5,
    onsetEnd: 10,
  };
  const choices = recordingsAtPhrase(source, {
    "wjazzd-v2.1-10": {
      status: "verified",
      youtubeId: "8B3W29P7lD8",
      offset: 111.8102,
    },
  });
  assert.equal(choices.length, 1);
  assert.equal(choices[0].exactStart, 116.8102);
  assert.equal(choices[0].start, 116);
  assert.equal(choices[0].end, 123);
  const embedUrl = new URL(choices[0].embedUrl);
  assert.equal(embedUrl.origin, "https://www.youtube-nocookie.com");
  assert.equal(embedUrl.pathname, "/embed/8B3W29P7lD8");
  assert.equal(embedUrl.searchParams.get("start"), "116");
  assert.equal(embedUrl.searchParams.get("end"), "123");
  assert.equal(embedUrl.searchParams.get("autoplay"), "1");
  assert.equal(embedUrl.searchParams.get("playsinline"), "1");
  assert.equal(embedUrl.searchParams.get("enablejsapi"), "1");
});

test("les mauvaises versions, indisponibilités et données invalides ne jouent rien", () => {
  const source = {
    soloId: "solo",
    onsetStart: 1,
    onsetEnd: 2,
  };
  for (const validation of [
    {
      status: "wrong-version",
      rejectedYoutubeIds: ["abcdefghijk"],
    },
    { status: "unavailable" },
    { status: "verified", youtubeId: "invalide", offset: 1 },
    { status: "verified", youtubeId: "abcdefghijk", offset: "non" },
  ]) {
    assert.deepEqual(recordingsAtPhrase(source, { solo: validation }), []);
  }
});

test("les URL vidéo sont normalisées sans produire de lien public", () => {
  assert.equal(youtubeIdFromValue("abcdefghijk"), "abcdefghijk");
  assert.equal(
    youtubeIdFromValue("https://youtu.be/abcdefghijk?t=20"),
    "abcdefghijk",
  );
  assert.equal(
    youtubeIdFromValue(
      "https://www.youtube.com/watch?v=abcdefghijk&t=20",
    ),
    "abcdefghijk",
  );
  assert.equal(
    youtubeIdFromValue(
      "https://www.youtube.com/embed/abcdefghijk",
    ),
    "abcdefghijk",
  );
  assert.equal(
    youtubeIdFromValue(
      "https://www.youtube.com/shorts/abcdefghijk",
    ),
    "abcdefghijk",
  );
  assert.equal(
    youtubeIdFromValue(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    ),
    "abcdefghijk",
  );
  assert.equal(youtubeIdFromValue("https://example.com/abcdefghijk"), null);
});

test("les validations locales remplacent proprement les décisions intégrées", () => {
  const merged = mergeRecordingValidations(
    {
      solo: {
        status: "verified",
        youtubeId: "abcdefghijk",
        offset: 10,
      },
    },
    {
      solo: {
        status: "unavailable",
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    },
  );
  assert.deepEqual(merged.solo, {
    status: "unavailable",
    updatedAt: "2026-07-31T00:00:00.000Z",
  });
  assert.deepEqual(
    normalizeRecordingValidation({
      status: "wrong-version",
      rejectedYoutubeIds: [
        "abcdefghijk",
        "https://youtu.be/abcdefghijk",
        "bad",
      ],
    }),
    {
      status: "wrong-version",
      rejectedYoutubeIds: ["abcdefghijk"],
    },
  );
});

test("l’export produit le module canonique trié", () => {
  const content = recordingValidationsModule({
    z: { status: "unavailable" },
    a: {
      status: "verified",
      youtubeId: "abcdefghijk",
      offset: 1.2,
    },
  });
  assert.match(content, /Only entries with status "verified"/);
  assert.ok(content.indexOf('"a"') < content.indexOf('"z"'));
  assert.match(
    content,
    /export const RECORDING_VALIDATIONS = Object\.freeze\(/,
  );
});

test("les correspondances JazzTube restent un corpus de candidats compact", () => {
  const soloIds = new Set(WJAZZD_SOLOS.map(({ id }) => id));
  const entries = Object.entries(WJAZZTUBE_RECORDINGS);
  assert.equal(entries.length, 329);
  assert.equal(
    entries.reduce((total, [, videos]) => total + videos.length, 0),
    988,
  );
  for (const [soloId, videos] of entries) {
    assert.equal(soloIds.has(soloId), true, soloId);
    assert.ok(videos.length > 0, soloId);
    for (const [youtubeId, offset] of videos) {
      assert.match(youtubeId, /^[A-Za-z0-9_-]{11}$/);
      assert.ok(Number.isFinite(offset), `${soloId}:${youtubeId}`);
    }
  }
});
