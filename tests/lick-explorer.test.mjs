import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import {
  DTL_LICK_CORPUS,
  DTL_LICKS,
} from "../data/dtl-licks.js";
import {
  createLickExplorer,
  createLickSequence,
  moveLickIndex,
  randomLickTransposition,
} from "../src/lick-explorer.js";

const html = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);

test("le corpus compact importe les 653 motifs DTL", () => {
  assert.equal(DTL_LICK_CORPUS.patternCount, 653);
  assert.equal(DTL_LICK_CORPUS.occurrenceCount, 11_630);
  assert.equal(DTL_LICKS.length, 653);
  assert.equal(DTL_LICKS[0].id, "dtl-ph-0001");
  assert.equal(DTL_LICKS[0].occurrenceCount, 127);
  assert.equal(
    DTL_LICKS.reduce(
      (total, lick) => total + lick.occurrenceCount,
      0,
    ),
    11_630,
  );

  for (const lick of DTL_LICKS) {
    assert.equal(lick.notes.length, lick.intervals.length + 1);
    assert.equal(lick.timings.length, lick.notes.length);
    assert.equal(lick.timings[0][0], 0);
    assert.equal(Number.isFinite(lick.tempo), true);
    assert.equal(lick.tempo > 0, true);
    assert.equal(typeof lick.reference.soloId, "string");
    assert.equal(Number.isInteger(lick.reference.eventIndex), true);
    assert.deepEqual(
      lick.notes.slice(1).map(
        (midi, index) => midi - lick.notes[index],
      ),
      lick.intervals,
    );
  }
});

function createAudioHarness() {
  const calls = {
    contexts: 0,
    preloads: [],
    stops: 0,
    tones: [],
  };
  return {
    calls,
    runtime: {
      getAudioContext() {
        calls.contexts += 1;
        return {};
      },
      async preloadMelodySamples(notes) {
        calls.preloads.push([...notes]);
      },
      playTone(...args) {
        calls.tones.push(args);
      },
      stopActiveSources() {
        calls.stops += 1;
      },
    },
  };
}

test("le lecteur joue le premier lick avec ses timings WJD", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const audio = createAudioHarness();
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks: DTL_LICKS.slice(0, 3),
    translate: (key, values = {}) =>
      `${key}:${values.current ?? values.count ?? values.value ?? ""}`,
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(explorer.snapshot().index, 0);
    assert.equal(explorer.snapshot().id, "dtl-ph-0001");
    assert.equal(
      dom.window.document
        .querySelector("#lick-explorer-panel")
        .textContent.includes(DTL_LICKS[0].reference.soloId),
      false,
    );
    const played = await explorer.playOriginal();
    assert.equal(played, true);
    assert.equal(audio.calls.contexts, 1);
    assert.deepEqual(audio.calls.preloads[0], DTL_LICKS[0].notes);
    assert.equal(audio.calls.tones.length, DTL_LICKS[0].notes.length);
    assert.deepEqual(audio.calls.tones[0], [
      DTL_LICKS[0].notes[0],
      DTL_LICKS[0].timings[0][0],
      DTL_LICKS[0].timings[0][1],
      true,
    ]);

    const sequence = createLickSequence(DTL_LICKS[0], 0);
    assert.deepEqual(sequence.notes, DTL_LICKS[0].notes);
    assert.deepEqual(sequence.timings[0], {
      offset: DTL_LICKS[0].timings[0][0],
      duration: DTL_LICKS[0].timings[0][1],
    });
    assert.equal(sequence.meta.source.kind, "dtl-lick");
  } finally {
    explorer.destroy();
    dom.window.close();
  }
});

test("la transposition aléatoire conserve le motif et change de ton", () => {
  const lick = DTL_LICKS[0];
  const transposition = randomLickTransposition(lick, () => 0);
  const nextTransposition = randomLickTransposition(
    lick,
    () => 0,
    transposition,
  );
  assert.notEqual(transposition, 0);
  assert.notEqual(nextTransposition, 0);
  assert.notEqual(nextTransposition, transposition);

  const sequence = createLickSequence(lick, transposition);
  assert.deepEqual(
    sequence.notes,
    lick.notes.map((midi) => midi + transposition),
  );
  assert.deepEqual(
    sequence.notes.slice(1).map(
      (midi, index) => midi - sequence.notes[index],
    ),
    lick.intervals,
  );
});

test("la navigation précédent/suivant reste bornée au corpus", () => {
  assert.equal(moveLickIndex(0, -1, 653), 0);
  assert.equal(moveLickIndex(0, 1, 653), 1);
  assert.equal(moveLickIndex(1, -1, 653), 0);
  assert.equal(moveLickIndex(652, 1, 653), 652);
});
