import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeRecordingValidations,
  normalizeRecordingValidation,
  recordingValidationsModule,
  recordingsAtPhrase,
  youtubeIdFromValue,
} from "../src/recording.js";
import { DEFAULT_PHRASE_RATINGS } from "../data/default-ratings.js";
import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";
import { WJAZZD_SOLO_INDEX } from "../data/wjazzd-index.js";
import {
  YOUTUBE_SEARCH_RECORDINGS,
} from "../data/youtube-search-recordings.js";

test("les sources directes et décisions intégrées non validées restent invisibles", () => {
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
  const distribution = Object.values(RECORDING_VALIDATIONS).reduce(
    (counts, { status }) => ({
      ...counts,
      [status]: (counts[status] ?? 0) + 1,
    }),
    {},
  );
  assert.deepEqual(distribution, {
    "wrong-version": 20,
    verified: 28,
    unavailable: 2,
  });
  assert.deepEqual(
    recordingsAtPhrase({
      soloId: "wjazzd-v2.1-101",
      onsetStart: 0,
      onsetEnd: 1,
    }),
    [],
  );
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

test("la base YouTube couvre exactement les solos avec phrases 3 étoiles", () => {
  const threeStarPhraseKeys = new Set(
    Object.entries(DEFAULT_PHRASE_RATINGS)
      .filter(([, value]) => Number(value?.rating ?? value) === 3)
      .map(([phraseKey]) => phraseKey),
  );
  const reviewedSoloIds = new Set(
    WJAZZD_SOLO_INDEX
      .filter((solo) =>
        solo.phrases.some((phrase) =>
          threeStarPhraseKeys.has(`${solo.id}:${phrase[0]}`)
        )
      )
      .map(({ id }) => id),
  );
  const entries = Object.entries(YOUTUBE_SEARCH_RECORDINGS);
  assert.equal(entries.length, 112);
  assert.deepEqual(
    new Set(entries.map(([soloId]) => soloId)),
    reviewedSoloIds,
  );
  for (const [soloId, videos] of entries) {
    assert.equal(videos.length, 1, soloId);
    for (const [youtubeId, offset] of videos) {
      assert.match(youtubeId, /^[A-Za-z0-9_-]{11}$/);
      assert.ok(Number.isFinite(offset), `${soloId}:${youtubeId}`);
    }
  }
});
