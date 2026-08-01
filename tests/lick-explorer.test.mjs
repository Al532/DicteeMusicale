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
  classifiedVeryTypicalLicks,
  createLickExplorer,
  createLickExerciseSequence,
  createLickSequence,
  createSyntheticLickSequence,
  isClassifiedVeryTypicalLick,
  isTypicalLick,
  isVeryTypicalLick,
  moveLickIndex,
  randomLickTransposition,
  shuffledLickDeck,
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

test("le catalogue garde les consensus nets parmi les 58 licks très typiques", () => {
  const veryTypicalLicks = DTL_LICKS.filter(isVeryTypicalLick);
  const catalogIds = Object.keys(DTL_RHYTHM_PILOT.licks);
  const catalogLicks = catalogIds.map((lickId) =>
    DTL_LICKS.find(({ id }) => id === lickId),
  );

  assert.equal(DTL_RHYTHM_PILOT.analyzedLickCount, 58);
  assert.equal(DTL_RHYTHM_PILOT.analyzedOccurrenceCount, 1_300);
  assert.equal(DTL_RHYTHM_PILOT.lickCount, 19);
  assert.equal(DTL_RHYTHM_PILOT.occurrenceCount, 388);
  assert.equal(DTL_RHYTHM_PILOT.excludedAmbiguousCount, 39);
  assert.equal(DTL_RHYTHM_PILOT.singleHarmonyCount, 7);
  assert.equal(DTL_RHYTHM_PILOT.twoHarmonyCount, 12);
  assert.equal(DTL_RHYTHM_PILOT.eighthNoteTicks, 6);
  assert.equal(
    catalogLicks.every(isClassifiedVeryTypicalLick),
    true,
  );
  assert.equal(
    veryTypicalLicks.filter(isClassifiedVeryTypicalLick).length,
    catalogLicks.length,
  );

  const functionOrder = [
    "I",
    "Im",
    "II",
    "V",
    "II–V",
    "IIø–V",
    "V–I",
    "V–Im",
  ];
  let previousSortKey = [-1, -1];
  for (const [catalogIndex, lick] of catalogLicks.entries()) {
    const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
    assert.equal(pilot.observations, lick.occurrenceCount);
    assert.equal(pilot.patternId, `P${String(catalogIndex + 1).padStart(2, "0")}`);
    assert.ok(functionOrder.includes(pilot.harmonicFunction));
    assert.equal(typeof pilot.startDegree, "string");
    assert.ok(Number.isInteger(pilot.startDegreePitchClass));
    assert.ok(pilot.functionObservations >= 3);
    assert.ok(pilot.functionContextSupport >= 0.2);
    assert.ok(pilot.functionClassifiedSupport >= 0.55);
    assert.ok(pilot.startDegreeSupport >= 0.55);
    assert.equal(pilot.meter, 4);
    assert.equal(
      pilot.startTick % DTL_RHYTHM_PILOT.eighthNoteTicks,
      0,
    );
    assert.ok([1, 2].includes(pilot.harmonyCount));
    assert.ok(pilot.meterSupport >= 0.8);
    assert.ok(pilot.harmonySupport >= 0.5);

    const sortKey = [
      functionOrder.indexOf(pilot.harmonicFunction),
      pilot.startDegreePitchClass,
    ];
    assert.ok(
      sortKey[0] > previousSortKey[0] ||
        (sortKey[0] === previousSortKey[0] &&
          sortKey[1] >= previousSortKey[1]),
    );
    previousSortKey = sortKey;

    const targetNoteIndex =
      pilot.harmonyCount === 1
        ? lick.notes.length - 1
        : pilot.changeNoteIndex;
    const targetBeat = pilot.harmonyCount === 1 ? 1 : pilot.changeBeat;
    assert.equal(
      (pilot.startTick +
        targetNoteIndex * DTL_RHYTHM_PILOT.eighthNoteTicks) %
        (pilot.meter * DTL_RHYTHM_PILOT.ticksPerBeat),
      (targetBeat - 1) * DTL_RHYTHM_PILOT.ticksPerBeat,
    );

    if (pilot.harmonyCount === 2) {
      assert.ok(pilot.changeNoteIndex > 0);
      assert.ok(pilot.changeNoteIndex < lick.notes.length);
      assert.ok([1, 3].includes(pilot.changeBeat));
      assert.ok(Number.isInteger(pilot.rootMotion));
      assert.ok(pilot.changeBeatSupport > 0);
      assert.ok(pilot.changeNoteSupport > 0);
      assert.ok(pilot.rootMotionSupport > 0);
    }
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
  dom.window.document.querySelector("#lick-explorer-rhythm-mode").value =
    "reference";
  return dom;
}

function catalogLicks() {
  const byId = new Map(DTL_LICKS.map((lick) => [lick.id, lick]));
  return Object.keys(DTL_RHYTHM_PILOT.licks).map((lickId) => byId.get(lickId));
}

test("le lecteur joue le premier lick avec ses timings WJD", async () => {
  const dom = createReferenceDom();
  const audio = createAudioHarness();
  const licks = catalogLicks().slice(0, 3);
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks,
    translate: (key, values = {}) =>
      `${key}:${values.current ?? values.count ?? values.value ?? ""}`,
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(explorer.snapshot().index, 0);
    assert.equal(explorer.snapshot().id, licks[0].id);
    assert.equal(
      dom.window.document
        .querySelector("#lick-explorer-panel")
        .textContent.includes(licks[0].reference.soloId),
      false,
    );
    const played = await explorer.playOriginal();
    assert.equal(played, true);
    assert.equal(audio.calls.contexts, 1);
    assert.deepEqual(audio.calls.preloads[0], licks[0].notes);
    assert.equal(audio.calls.tones.length, licks[0].notes.length);
    assert.deepEqual(audio.calls.tones[0], [
      licks[0].notes[0],
      licks[0].timings[0][0],
      licks[0].timings[0][1],
      true,
    ]);

    const sequence = createLickSequence(licks[0], 0);
    assert.deepEqual(sequence.notes, licks[0].notes);
    assert.deepEqual(sequence.timings[0], {
      offset: licks[0].timings[0][0],
      duration: licks[0].timings[0][1],
    });
    assert.equal(sequence.meta.source.kind, "dtl-lick");
  } finally {
    explorer.destroy();
    dom.window.close();
  }
});

test("le pilote joue les croches swinguées avec basse rare et 2 et 4", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const audio = createAudioHarness();
  const licks = catalogLicks();
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
    assert.ok(audio.calls.bass.length >= 1);
    assert.ok(audio.calls.chicks.length >= 1);
    assert.ok(audio.calls.tones[0][1] > 0);
    assert.equal(audio.calls.bass[0][1], 0);
    assert.equal(
      audio.calls.bass.every(([, offset]) => offset >= 0) &&
        audio.calls.chicks.every(([offset]) => offset >= 0),
      true,
    );
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
  const licks = catalogLicks().slice(0, 3);
  const explorer = createLickExplorer({
    audioRuntime: audio.runtime,
    documentObject: dom.window.document,
    licks,
    windowObject: dom.window,
  });

  try {
    explorer.open();
    assert.equal(audio.calls.contexts, 0);
    assert.equal(explorer.next(), true);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    assert.equal(explorer.snapshot().id, licks[1].id);
    assert.equal(explorer.snapshot().playing, true);
    assert.equal(audio.calls.contexts, 1);
    assert.deepEqual(audio.calls.preloads[0], licks[1].notes);
    assert.equal(audio.calls.tones.length, licks[1].notes.length);
  } finally {
    explorer.destroy();
    dom.window.close();
  }
});

test("l’explorateur ne parcourt que les patterns classifiés", () => {
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
    assert.equal(explorer.snapshot().total, 19);
    assert.equal(explorer.snapshot().rhythmMode, "synthetic");
    assert.equal(explorer.snapshot().sourceTotal, 364);
    assert.equal(explorer.snapshot().patternId, "P01");
    assert.equal(explorer.snapshot().harmonicFunction, "I");
    assert.equal(explorer.snapshot().startDegree, "2");
    assert.equal(
      dom.window.document.querySelector("#lick-explorer-pattern-id")
        .textContent,
      "P01",
    );
    assert.equal(
      dom.window.document.querySelector("#lick-explorer-harmonic-function")
        .textContent,
      "I",
    );
    assert.equal(
      dom.window.document.querySelector("#lick-explorer-start-degree")
        .textContent,
      "2",
    );
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

test("la pioche d’exercice mélange les 19 licks sans remise", () => {
  const catalog = classifiedVeryTypicalLicks();
  const originalIds = catalog.map(({ id }) => id);
  const deck = shuffledLickDeck(catalog, () => 0);
  const deckIds = deck.map(({ id }) => id);

  assert.equal(deck.length, 19);
  assert.equal(new Set(deckIds).size, deck.length);
  assert.deepEqual([...deckIds].sort(), [...originalIds].sort());
  assert.notDeepEqual(deckIds, originalIds);
  assert.deepEqual(catalog.map(({ id }) => id), originalIds);
});

test("une séquence d’exercice ajoute le clavier et l’identité du pattern", () => {
  const lick = classifiedVeryTypicalLicks()[0];
  const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
  const sequence = createLickExerciseSequence(lick, 3);

  assert.equal(sequence.meta.source.kind, "dtl-lick-exercise");
  assert.equal(sequence.meta.source.patternId, pilot.patternId);
  assert.equal(
    sequence.meta.source.harmonicFunction,
    pilot.harmonicFunction,
  );
  assert.equal(sequence.meta.source.startDegree, pilot.startDegree);
  assert.deepEqual(
    sequence.notes,
    lick.notes.map((midi) => midi + 3),
  );
  assert.ok(sequence.keyboard.startMidi <= Math.min(...sequence.notes));
  assert.ok(sequence.keyboard.endMidi >= Math.max(...sequence.notes));
});

function swungBeatPosition(tick) {
  const ticksPerBeat = DTL_RHYTHM_PILOT.ticksPerBeat;
  const beat = Math.floor(tick / ticksPerBeat);
  const withinBeat = tick % ticksPerBeat;
  return withinBeat === DTL_RHYTHM_PILOT.eighthNoteTicks
    ? beat +
        DTL_RHYTHM_PILOT.swingRatio /
          (DTL_RHYTHM_PILOT.swingRatio + 1)
    : beat + withinBeat / ticksPerBeat;
}

function offsetForTick(tick, timelineStartTick) {
  const secondsPerBeat = 60 / DTL_RHYTHM_PILOT.tempo;
  return Number(
    (
      (swungBeatPosition(tick) - swungBeatPosition(timelineStartTick)) *
      secondsPerBeat
    ).toFixed(4),
  );
}

test("toutes les reconstructions utilisent des croches et leur temps cible", () => {
  const licks = catalogLicks();

  for (const lick of licks) {
    const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
    const sequence = createSyntheticLickSequence(lick);
    const firstNoteTick = pilot.startTick;
    const measureTicks =
      pilot.meter * DTL_RHYTHM_PILOT.ticksPerBeat;
    const timelineStartTick =
      Math.floor(firstNoteTick / measureTicks) * measureTicks;

    sequence.timings.forEach((timing, noteIndex) => {
      const expectedOffset = offsetForTick(
        firstNoteTick +
          noteIndex * DTL_RHYTHM_PILOT.eighthNoteTicks,
        timelineStartTick,
      );
      assert.equal(timing.offset, expectedOffset, lick.id);
      assert.ok(timing.duration > 0, lick.id);
    });
    assert.equal(sequence.meta.source.timelineStartTick, timelineStartTick);
    assert.ok(sequence.timings[0].offset >= 0, lick.id);
    assert.ok(
      sequence.timings[0].offset <
        (60 / DTL_RHYTHM_PILOT.tempo) * pilot.meter,
      lick.id,
    );

    const targetNoteIndex =
      pilot.harmonyCount === 1
        ? lick.notes.length - 1
        : pilot.changeNoteIndex;
    const targetBeat = pilot.harmonyCount === 1 ? 1 : pilot.changeBeat;
    const targetTick =
      firstNoteTick +
      targetNoteIndex * DTL_RHYTHM_PILOT.eighthNoteTicks;
    assert.equal(
      targetTick % (pilot.meter * DTL_RHYTHM_PILOT.ticksPerBeat),
      (targetBeat - 1) * DTL_RHYTHM_PILOT.ticksPerBeat,
      lick.id,
    );

    const lastReleaseTick =
      firstNoteTick + lick.notes.length * DTL_RHYTHM_PILOT.eighthNoteTicks;
    const bassTicks = new Set();
    for (
      let tick = timelineStartTick;
      tick < lastReleaseTick;
      tick += measureTicks
    ) {
      bassTicks.add(tick);
    }
    if (pilot.harmonyCount === 2) bassTicks.add(targetTick);
    assert.deepEqual(
      sequence.bassHits.map(({ offset }) => offset),
      [...bassTicks]
        .sort((left, right) => left - right)
        .map((tick) => offsetForTick(tick, timelineStartTick)),
      lick.id,
    );
    const orderedBassTicks = [...bassTicks].sort(
      (left, right) => left - right,
    );
    const finalBassEndTick =
      lastReleaseTick + DTL_RHYTHM_PILOT.ticksPerBeat;
    sequence.bassHits.forEach((hit, index) => {
      const startTick = orderedBassTicks[index];
      const endTick = orderedBassTicks[index + 1] ?? finalBassEndTick;
      assert.equal(
        hit.duration,
        Number(
          (
            offsetForTick(endTick, timelineStartTick) -
            offsetForTick(startTick, timelineStartTick)
          ).toFixed(4),
        ),
        lick.id,
      );
    });
    assert.equal(sequence.bassHits[0].offset, 0, lick.id);
    assert.ok(
      sequence.bassHits.every(({ offset }) => offset >= 0),
      lick.id,
    );
  }
});

test("une harmonie finit sur 1 et la basse ne joue que sur les 1", () => {
  const lick = DTL_LICKS.find(({ id }) => id === "dtl-ph-0057");
  const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
  const sequence = createSyntheticLickSequence(lick, 5);

  assert.equal(pilot.harmonyCount, 1);
  assert.ok(sequence.timings[0].offset > 0);
  assert.deepEqual(
    sequence.notes,
    lick.notes.map((midi) => midi + 5),
  );
  assert.ok(sequence.chicks.every(({ beat }) => beat === 2 || beat === 4));
  assert.equal(sequence.meta.source.kind, "dtl-lick-synthetic");
  const expectedBassPitchClass =
    ((lick.notes[0] + 5 - pilot.startDegreePitchClass) % 12 + 12) % 12;
  assert.ok(
    sequence.bassHits.every(
      ({ midi }) => midi % 12 === expectedBassPitchClass,
    ),
  );
  assert.equal(
    sequence.bassHits.at(-1).offset,
    sequence.timings.at(-1).offset,
  );
  assert.ok(
    sequence.bassHits.at(-1).duration >
      sequence.timings.at(-1).duration,
  );
});

test("deux harmonies placent et font entendre la bascule sur 3", () => {
  const lick = DTL_LICKS.find(({ id }) => id === "dtl-ph-0021");
  const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
  const sequence = createSyntheticLickSequence(lick, 0);
  const changeOffset = sequence.timings[pilot.changeNoteIndex].offset;
  const firstBassPitchClass =
    ((lick.notes[0] - pilot.startDegreePitchClass) % 12 + 12) % 12;
  const secondBassPitchClass =
    (firstBassPitchClass + pilot.rootMotion) % 12;

  assert.equal(pilot.harmonyCount, 2);
  assert.equal(pilot.changeBeat, 3);
  assert.equal(
    (pilot.startTick +
      pilot.changeNoteIndex * DTL_RHYTHM_PILOT.eighthNoteTicks) %
      (pilot.meter * DTL_RHYTHM_PILOT.ticksPerBeat),
    2 * DTL_RHYTHM_PILOT.ticksPerBeat,
  );
  assert.ok(
    sequence.bassHits.some(
      ({ midi, offset }) =>
        Math.abs(offset - changeOffset) < 0.001 &&
        midi % 12 === secondBassPitchClass,
    ),
  );
  assert.ok(sequence.timings[0].offset > 0);
  assert.equal(sequence.bassHits[0].offset, 0);
  assert.ok(sequence.bassHits.every(({ offset }) => offset >= 0));
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
