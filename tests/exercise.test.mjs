import test from "node:test";
import assert from "node:assert/strict";
import {
  createExerciseState,
  enterExerciseMidi,
  exercisePlaybackDurationMs,
  originalExerciseNotes,
  resetExerciseProgress,
} from "../src/exercise.js";

function generated() {
  return {
    notes: [62, 64],
    timings: [
      { offset: 0.5, duration: 0.25 },
      { offset: 1, duration: 0.5 },
    ],
    chicks: [],
    bassHits: [],
    meta: {
      source: {
        phraseKey: "solo:1",
        transposition: 2,
      },
    },
  };
}

test("l’état d’exercice conserve la source et les options de lancement", () => {
  const state = createExerciseState(generated(), {
    quickRatingFullPreview: true,
    speedPercent: 75,
    transpositionState: { cycleNumber: 1 },
  });
  assert.equal(state.source.phraseKey, "solo:1");
  assert.equal(state.quickRatingFullPreview, true);
  assert.equal(state.speedPercent, 75);
  assert.deepEqual(state.transpositionState, { cycleNumber: 1 });
  assert.deepEqual(originalExerciseNotes(state), [60, 62]);
  assert.equal(exercisePlaybackDurationMs(state), 2_000);
});

test("la lecture reste active jusqu’à la fin d’une basse tenue", () => {
  const state = createExerciseState({
    ...generated(),
    bassHits: [{ midi: 36, offset: 0, duration: 2.25 }],
  }, { speedPercent: 75 });

  assert.equal(exercisePlaybackDurationMs(state), 3_000);
});

test("la saisie avance seulement sur la hauteur attendue", () => {
  const state = createExerciseState(generated());
  assert.deepEqual(enterExerciseMidi(state, 61), {
    accepted: true,
    complete: false,
    correct: false,
  });
  assert.equal(state.currentIndex, 0);
  assert.deepEqual(enterExerciseMidi(state, 62), {
    accepted: true,
    complete: false,
    correct: true,
  });
  assert.deepEqual(enterExerciseMidi(state, 64), {
    accepted: true,
    complete: true,
    correct: true,
  });
  assert.equal(resetExerciseProgress(state), true);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.executionStarted, false);
});
