import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import {
  DTL_LICK_CORPUS,
  DTL_LICKS,
} from "../data/dtl-licks.js";
import { DTL_RHYTHM_PILOT } from "../data/dtl-rhythm-pilot.js";
import {
  adjustedLickSalience,
  createLickExplorer,
  createLickSequence,
  createSyntheticLickSequence,
  isTypicalLick,
  isVeryTypicalLick,
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
  assert.equal(DTL_LICK_CORPUS.licks.length, 653);
  assert.equal(
    DTL_LICK_CORPUS.licks.reduce(
      (total, lick) => total + lick.occurrenceCount,
      0,
    ),
    11_630,
  );

  for (const lick of DTL_LICK_CORPUS.licks) {
    assert.equal(lick.notes.length, lick.intervals.length + 1);
    assert.equal(lick.timings.length, lick.notes.length);
    assert.equal(lick.timings[0][0], 0);
    assert.equal(Number.isFinite(lick.tempo), true);
    assert.equal(lick.tempo > 0, true);
    assert.equal(Number.isInteger(lick.soloCount), true);
    assert.equal(Number.isInteger(lick.performerCount), true);
    assert.equal(lick.phraseContainedRatio >= 0, true);
    assert.equal(lick.phraseContainedRatio <= 1, true);
    assert.equal(Number.isFinite(lick.logExcessProb), true);
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

test("le filtre typique conserve les motifs diffusés, phrasés et saillants", () => {
  const typicalLicks = DTL_LICKS.filter(isTypicalLick);

  assert.equal(typicalLicks.length, 117);
  assert.equal(
    typicalLicks.every(
      (lick) =>
        lick.occurrenceCount >= 10 &&
        lick.soloCount >= 3 &&
        lick.performerCount >= 3 &&
        lick.phraseContainedRatio >= 0.9 &&
        adjustedLickSalience(lick) >= 1.35,
    ),
    true,
  );
  assert.equal(
    DTL_LICKS.some(
      (lick) => !isTypicalLick(lick) && lick.occurrenceCount < 10,
    ),
    true,
  );
});

test("le filtre très typique exige aussi une forte surreprésentation", () => {
  const veryTypicalLicks = DTL_LICKS.filter(isVeryTypicalLick);

  assert.equal(veryTypicalLicks.length, 58);
  assert.equal(
    veryTypicalLicks.every(
      (lick) => isTypicalLick(lick) && lick.logExcessProb >= 2,
    ),
    true,
  );
});

test("le pilote reconstruit les 58 licks depuis leurs 1 300 occurrences", () => {
  const veryTypicalLicks = DTL_LICKS.filter(isVeryTypicalLick);

  assert.equal(DTL_RHYTHM_PILOT.lickCount, 58);
  assert.equal(DTL_RHYTHM_PILOT.occurrenceCount, 1_300);
  assert.deepEqual(
    Object.keys(DTL_RHYTHM_PILOT.licks),
    veryTypicalLicks.map(({ id }) => id),
  );
  for (const lick of veryTypicalLicks) {
    const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
    assert.equal(pilot.observations, lick.occurrenceCount);
    assert.equal(pilot.meter, 4);
    assert.equal(pilot.startTick % DTL_RHYTHM_PILOT.startGridTicks, 0);
    assert.equal(pilot.intervalTicks.length, lick.intervals.length);
    assert.ok(pilot.intervalTicks.every((tick) => tick > 0));
    assert.ok(pilot.meterSupport >= 0.8);
    assert.ok(pilot.placementSupport > 0);
    assert.ok(pilot.rhythmSupport > 0);
    assert.ok(pilot.bassSupport > 0);
  }
});

test("l'explorateur écarte les motifs sans saut supérieur à deux demi-tons", () => {
  const excluded = DTL_LICK_CORPUS.licks.filter(
    (lick) => !DTL_LICKS.includes(lick),
  );

  assert.equal(DTL_LICKS.length, 364);
  assert.equal(excluded.length, 289);
  assert.equal(DTL_LICKS[0].id, "dtl-ph-0003");
  assert.equal(DTL_LICKS[0].occurrenceCount, 122);
  assert.equal(
    DTL_LICKS.reduce(
      (total, lick) => total + lick.occurrenceCount,
      0,
    ),
    4_333,
  );
  assert.equal(
    DTL_LICKS.every((lick) =>
      lick.intervals.some((interval) => Math.abs(interval) > 2),
    ),
    true,
  );
  assert.equal(
    excluded.every((lick) =>
      lick.intervals.every((interval) => Math.abs(interval) <= 2),
    ),
    true,
  );
});

function createAudioHarness() {
  const calls = {
    bass: [],
    bassPreloads: [],
    chicks: [],
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
      async preloadBassSamples(hits) {
        calls.bassPreloads.push(hits.map((hit) => ({ ...hit })));
      },
      playTone(...args) {
        calls.tones.push(args);
      },
      playChick(...args) {
        calls.chicks.push(args);
      },
      playBass(...args) {
        calls.bass.push(args);
      },
      stopActiveSources() {
        calls.stops += 1;
      },
    },
  };
}

function createReferenceDom() {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  dom.window.document.querySelector("#lick-explorer-filter").value = "all";
  dom.window.document.querySelector("#lick-explorer-rhythm-mode").value =
    "reference";
  return dom;
}

test("le lecteur joue le premier lick avec ses timings WJD", async () => {
  const dom = createReferenceDom();
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
    assert.equal(explorer.snapshot().id, "dtl-ph-0003");
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

test("le pilote joue le consensus métrique avec basse, 2 et 4 et swing léger", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const audio = createAudioHarness();
  const licks = DTL_LICKS.filter(isVeryTypicalLick);
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks,
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(explorer.snapshot().rhythmMode, "synthetic");
    assert.equal(explorer.snapshot().pilotAvailable, true);
    const played = await explorer.playOriginal();
    assert.equal(played, true);
    assert.equal(audio.calls.bassPreloads.length, 1);
    assert.ok(audio.calls.bass.length >= 8);
    assert.ok(audio.calls.chicks.length >= 4);
    assert.equal(
      dom.window.document.querySelector("#lick-explorer-placement-row")
        .hidden,
      false,
    );
  } finally {
    explorer.destroy();
    dom.window.close();
  }
});

test("la navigation joue automatiquement le nouveau lick", async () => {
  const dom = createReferenceDom();
  const audio = createAudioHarness();
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks: DTL_LICKS.slice(0, 3),
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(audio.calls.contexts, 0);
    assert.equal(explorer.next(), true);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    assert.equal(explorer.snapshot().id, DTL_LICKS[1].id);
    assert.equal(explorer.snapshot().playing, true);
    assert.equal(audio.calls.contexts, 1);
    assert.deepEqual(audio.calls.preloads[0], DTL_LICKS[1].notes);
    assert.equal(audio.calls.tones.length, DTL_LICKS[1].notes.length);
  } finally {
    explorer.destroy();
    dom.window.close();
  }
});

test("le sélecteur démarre sur le pilote puis retrouve tout le catalogue", () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const audio = createAudioHarness();
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks: DTL_LICKS,
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(explorer.snapshot().total, 58);
    assert.equal(explorer.snapshot().filter, "very-typical");
    assert.equal(explorer.snapshot().rhythmMode, "synthetic");

    assert.equal(explorer.setFilter("typical"), true);
    assert.equal(explorer.snapshot().total, 117);
    assert.equal(explorer.snapshot().sourceTotal, 364);
    assert.equal(explorer.snapshot().filter, "typical");
    assert.equal(isTypicalLick(DTL_LICKS.find(
      (lick) => lick.id === explorer.snapshot().id,
    )), true);

    assert.equal(explorer.setFilter("all"), true);
    assert.equal(explorer.snapshot().total, 364);
    assert.equal(explorer.snapshot().filter, "all");

    assert.equal(explorer.setFilter("very-typical"), true);
    assert.equal(explorer.snapshot().total, 58);
    assert.equal(explorer.snapshot().filter, "very-typical");
    assert.equal(isVeryTypicalLick(DTL_LICKS.find(
      (lick) => lick.id === explorer.snapshot().id,
    )), true);
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

test("la reconstruction synthétique conserve motif, placement et basse transposée", () => {
  const lick = DTL_LICKS.find(({ id }) => id === "dtl-ph-0057");
  const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
  const sequence = createSyntheticLickSequence(lick, 5);
  const secondsPerBeat = 60 / DTL_RHYTHM_PILOT.tempo;
  const swungOffbeat =
    DTL_RHYTHM_PILOT.swingRatio /
    (DTL_RHYTHM_PILOT.swingRatio + 1);

  assert.deepEqual(
    sequence.notes,
    lick.notes.map((midi) => midi + 5),
  );
  assert.equal(
    sequence.timings[0].offset,
    Number(((pilot.meter + swungOffbeat) * secondsPerBeat).toFixed(4)),
  );
  assert.ok(
    sequence.timings.every(
      (timing, index) =>
        timing.duration > 0 &&
        (index === 0 || timing.offset > sequence.timings[index - 1].offset),
    ),
  );
  assert.ok(sequence.chicks.every(({ beat }) => beat === 2 || beat === 4));
  assert.equal(sequence.meta.source.kind, "dtl-lick-synthetic");
  const expectedBassPitchClass =
    ((lick.notes[0] + 5 - pilot.firstNoteBassInterval) % 12 + 12) % 12;
  assert.equal(sequence.bassHits[0].midi % 12, expectedBassPitchClass);
});

test("la navigation précédent/suivant reste bornée au corpus", () => {
  assert.equal(moveLickIndex(0, -1, DTL_LICKS.length), 0);
  assert.equal(moveLickIndex(0, 1, DTL_LICKS.length), 1);
  assert.equal(moveLickIndex(1, -1, DTL_LICKS.length), 0);
  assert.equal(
    moveLickIndex(DTL_LICKS.length - 1, 1, DTL_LICKS.length),
    DTL_LICKS.length - 1,
  );
});
