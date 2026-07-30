import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { DEFAULT_PHRASE_SETTINGS } from "../data/default-phrase-settings.js";
import { WJAZZD_CHORDS } from "../data/wjazzd-chords.js";
import {
  WJAZZD_BLOCKS,
  WJAZZD_CORPUS_FINGERPRINTS,
  WJAZZD_CORPUS_STATS,
} from "../data/wjazzd-index.js";
import {
  DEFAULT_PERFORMERS as MONOLITH_DEFAULT_PERFORMERS,
  WJAZZD_PERFORMERS as MONOLITH_PERFORMERS,
  WJAZZD_SOLOS,
} from "../data/wjazzd-solos.js";
import {
  applyPhraseSettingsToEvents,
  jazzTranspositionRangeForNotes,
  loadPhraseCatalogEntry,
  loadSequence,
  makeSequence,
} from "../src/engine.js";
import {
  clearCorpusBlockCache,
  DEFAULT_PERFORMERS,
  getPhraseIndex,
  loadAllCorpus,
  loadPhraseCorpus,
  phraseIndexEntries,
  WJAZZD_PERFORMERS,
  WJAZZD_SOLO_INDEX,
} from "../src/corpus-loader.js";
import { structuralPhraseExclusion } from "../src/ratings.js";

function sha256Lines(values) {
  return createHash("sha256")
    .update(values.join("\n"))
    .digest("hex");
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

async function collectStaticModuleGraph(url, collected = new Set()) {
  const key = url.href;
  if (collected.has(key)) return collected;
  collected.add(key);
  const source = await readFile(url, "utf8");
  const imports =
    /\b(?:import|export)\s+(?!\()(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(imports)) {
    if (!match[1].startsWith(".")) continue;
    await collectStaticModuleGraph(new URL(match[1], url), collected);
  }
  return collected;
}

async function localFetch(url) {
  try {
    const source = await readFile(url, "utf8");
    return {
      ok: true,
      status: 200,
      async json() {
        return JSON.parse(source);
      },
    };
  } catch {
    return {
      ok: false,
      status: 404,
      async json() {
        throw new Error("Not found");
      },
    };
  }
}

test("l’index conserve l’ordre, les identifiants et les compteurs du monolithe", () => {
  const soloIds = WJAZZD_SOLOS.map(({ id }) => id);
  const phraseKeys = WJAZZD_SOLOS.flatMap((solo) =>
    solo.phrases.map((phrase) => `${solo.id}:${phrase[2]}`),
  );
  assert.deepEqual(
    WJAZZD_SOLO_INDEX.map(({ id }) => id),
    soloIds,
  );
  assert.deepEqual(WJAZZD_PERFORMERS, MONOLITH_PERFORMERS);
  assert.deepEqual(DEFAULT_PERFORMERS, MONOLITH_DEFAULT_PERFORMERS);
  assert.equal(new Set(soloIds).size, soloIds.length);
  assert.equal(new Set(phraseKeys).size, phraseKeys.length);
  assert.deepEqual(WJAZZD_CORPUS_STATS, {
    soloCount: 456,
    performerCount: 78,
    phraseCount: 11_082,
    eventCount: 200_809,
    beatCount: 132_329,
    chordCount: 30_548,
  });
  assert.deepEqual(WJAZZD_CORPUS_FINGERPRINTS, {
    soloIdsSha256: sha256Lines(soloIds),
    phraseKeysSha256: sha256Lines(phraseKeys),
  });
  assert.equal(WJAZZD_BLOCKS.length, Math.ceil(456 / 8));
});

test("les résumés de phrase reproduisent réglages, ambitus et exclusions", () => {
  const indexedEntries = [...phraseIndexEntries()];
  const expectedEntries = WJAZZD_SOLOS.flatMap((solo) =>
    solo.phrases.map((phrase) => ({ solo, phrase })),
  );
  assert.equal(indexedEntries.length, expectedEntries.length);

  for (const [position, { solo, phrase }] of expectedEntries.entries()) {
    const indexed = indexedEntries[position];
    const phraseKey = `${solo.id}:${phrase[2]}`;
    const events = solo.events.slice(phrase[0], phrase[1] + 1);
    const adjusted = applyPhraseSettingsToEvents(
      events,
      DEFAULT_PHRASE_SETTINGS[phraseKey],
    );
    const exclusion = structuralPhraseExclusion(solo, phrase);

    assert.equal(indexed.phraseKey, phraseKey);
    assert.equal(indexed.soloId, solo.id);
    assert.equal(indexed.performer, solo.performer);
    assert.equal(indexed.title, solo.title);
    assert.equal(indexed.sourceUrl, solo.sourceUrl);
    assert.equal(indexed.fullPhraseNoteCount, events.length);
    assert.equal(indexed.noteCount, adjusted.events.length);
    assert.deepEqual(
      indexed.transpositionRange,
      jazzTranspositionRangeForNotes(
        adjusted.events.map(([midi]) => midi),
      ),
    );
    assert.deepEqual(
      indexed.structuralExclusion,
      exclusion
        ? {
            id: exclusion.id,
            noteCount: exclusion.noteCount,
            rapidRunNotes: exclusion.rapidRunNotes ?? null,
            rapidWindowNotes: exclusion.rapidWindowNotes ?? null,
          }
        : null,
    );
    assert.deepEqual(getPhraseIndex(phraseKey), indexed);
  }
});

test("les 57 blocs reconstruisent exactement solos et accords", async () => {
  clearCorpusBlockCache();
  const corpus = await loadAllCorpus({
    fetch: localFetch,
    concurrency: 6,
  });
  assert.deepEqual(corpus.solos, WJAZZD_SOLOS);
  assert.deepEqual(corpus.chords, WJAZZD_CHORDS);
  assert.deepEqual(corpus.performers, MONOLITH_PERFORMERS);
  assert.deepEqual(
    corpus.defaultPerformers,
    MONOLITH_DEFAULT_PERFORMERS,
  );
});

test("le chargeur retrouve une phrase et mutualise son bloc", async () => {
  clearCorpusBlockCache();
  let fetchCount = 0;
  const countingFetch = async (url) => {
    fetchCount += 1;
    return localFetch(url);
  };
  const solo = WJAZZD_SOLOS[0];
  const firstKey = `${solo.id}:${solo.phrases[0][2]}`;
  const secondKey = `${solo.id}:${solo.phrases[1][2]}`;
  const first = await loadPhraseCorpus(firstKey, {
    fetch: countingFetch,
  });
  const second = await loadPhraseCorpus(secondKey, {
    fetch: countingFetch,
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(first.solo, solo);
  assert.deepEqual(first.phrase, solo.phrases[0]);
  assert.deepEqual(first.chords, WJAZZD_CHORDS[solo.id]);
  assert.deepEqual(second.phrase, solo.phrases[1]);
});

test("l’ambitus indexé est précisé à la demande pour un réglage local", async () => {
  const phraseKey = "wjazzd-v2.1-1:1";
  const indexed = getPhraseIndex(phraseKey);
  const detailed = await loadPhraseCatalogEntry(phraseKey, {
    fetch: localFetch,
    phraseSettings: {
      [phraseKey]: {
        notesMax: 1,
        ignoredShortestNotes: 0,
      },
    },
  });

  assert.deepEqual(indexed.transpositionRange, [-1, 10]);
  assert.deepEqual(detailed.transpositionRange, [-4, 7]);
  assert.equal(detailed.noteCount, 1);
  assert.equal(detailed.fullPhraseNoteCount, 7);
});

test("le chargeur refuse les phrases absentes", async () => {
  await assert.rejects(
    loadPhraseCorpus("wjazzd-v2.1-999999:1", {
      fetch: localFetch,
    }),
    /Phrase de corpus inconnue/,
  );
});

test("le tirage différé conserve ordre, hasard et résultat du monolithe", async () => {
  const indexed = [...phraseIndexEntries(DEFAULT_PERFORMERS)];
  const localRatings = Object.fromEntries(
    indexed.slice(0, 180).map(({ phraseKey }, index) => [
      phraseKey,
      { rating: (index % 3) + 1, origin: "local-test" },
    ]),
  );
  const scenarios = [
    {
      name: "défaut",
      options: { selectedPerformers: DEFAULT_PERFORMERS },
    },
    {
      name: "notes 3 étoiles",
      options: {
        minimumRating: 3,
        phraseRatings: localRatings,
        selectedPerformers: DEFAULT_PERFORMERS,
      },
    },
    {
      name: "phrases non notées",
      options: {
        minimumRating: "unrated",
        phraseRatings: localRatings,
        selectedPerformers: DEFAULT_PERFORMERS,
      },
    },
    {
      name: "sous-ensemble de musiciens",
      options: {
        selectedPerformers: ["Charlie Parker", "Miles Davis"],
      },
    },
    {
      name: "réglage local et phrase imposée",
      options: {
        phraseSettings: {
          "wjazzd-v2.1-55:3": {
            notesMax: 7,
            ignoredShortestNotes: 1,
          },
        },
        selectedPerformers: ["Charlie Parker"],
        targetPhraseKey: "wjazzd-v2.1-55:3",
      },
    },
  ];

  for (const { name, options } of scenarios) {
    for (let seed = 1; seed <= 16; seed += 1) {
      const expected = makeSequence({
        ...options,
        random: seededRandom(seed),
        corpus: {
          solos: WJAZZD_SOLOS,
          chords: WJAZZD_CHORDS,
        },
      });
      const actual = await loadSequence({
        ...options,
        random: seededRandom(seed),
        fetch: localFetch,
      });
      assert.deepEqual(actual, expected, `${name}, graine ${seed}`);
    }
  }
});

test("le graphe initial contient l’index mais aucun détail du corpus", async () => {
  const graph = await collectStaticModuleGraph(
    new URL("../src/app.js", import.meta.url),
  );
  const paths = [...graph];
  assert.ok(paths.some((path) => path.endsWith("/data/wjazzd-index.js")));
  assert.equal(
    paths.some((path) =>
      /\/data\/wjazzd-(?:solos|chords)\.js$/.test(path)
    ),
    false,
  );
  assert.equal(
    paths.some((path) => path.includes("/data/wjazzd-blocks/")),
    false,
  );
});
