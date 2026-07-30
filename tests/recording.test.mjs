import test from "node:test";
import assert from "node:assert/strict";

import {
  recordingSearchUrl,
  recordingUrlAtPhrase,
  recordingsAtPhrase,
} from "../src/recording.js";
import { WJAZZTUBE_RECORDINGS } from "../data/wjazztube-recordings.js";
import { WJAZZD_SOLOS } from "../data/wjazzd-solos.js";

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
      audioSourceUrl: "https://www.youtube.com/watch?v=abcdefghijk&t=9s",
      audioOffset: 23.714,
      onsetStart: 5.5859,
    }),
    "https://www.youtube.com/watch?v=abcdefghijk&t=29s",
  );
  assert.equal(
    recordingUrlAtPhrase({
      audioSourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    }),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(recordingUrlAtPhrase({ audioSourceUrl: "not a URL" }), null);
  assert.equal(recordingUrlAtPhrase(null), null);
});

test("JazzTube fournit le lecteur intégré et borne la phrase", () => {
  const choices = recordingsAtPhrase({
    soloId: "wjazzd-v2.1-10",
    onsetStart: 5,
    onsetEnd: 10,
  });
  assert.equal(choices.length, 1);
  assert.equal(
    choices[0].watchUrl,
    "https://www.youtube.com/watch?v=8B3W29P7lD8&t=116s",
  );
  const embedUrl = new URL(choices[0].embedUrl);
  assert.equal(embedUrl.origin, "https://www.youtube-nocookie.com");
  assert.equal(embedUrl.pathname, "/embed/8B3W29P7lD8");
  assert.equal(embedUrl.searchParams.get("start"), "116");
  assert.equal(embedUrl.searchParams.get("end"), "123");
  assert.equal(embedUrl.searchParams.get("autoplay"), "1");
  assert.equal(embedUrl.searchParams.get("playsinline"), "1");
});

test("toutes les phrases ont au moins une destination YouTube", () => {
  for (const solo of WJAZZD_SOLOS) {
    const source = {
      soloId: solo.id,
      performer: solo.performer,
      title: solo.title,
      recordingDate: solo.recordingDate,
      onsetStart: solo.events[0]?.[1],
      onsetEnd: solo.events.at(-1)?.[1],
      audioSourceUrl: solo.audioSourceUrl,
      audioOffset: solo.audioOffset,
    };
    assert.ok(
      recordingUrlAtPhrase(source) || recordingSearchUrl(source),
      solo.id,
    );
  }
});

test("la recherche de secours cible le musicien, le morceau et la date", () => {
  const url = new URL(
    recordingSearchUrl({
      performer: "Art Pepper",
      title: "Anthropology",
      recordingDate: "1979",
    }),
  );
  assert.equal(url.origin, "https://www.youtube.com");
  assert.equal(url.pathname, "/results");
  assert.equal(
    url.searchParams.get("search_query"),
    '"Art Pepper" "Anthropology" 1979',
  );
  assert.equal(recordingSearchUrl({ performer: "Art Pepper" }), null);
});

test("les correspondances JazzTube sont cohérentes et restent compactes", () => {
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
