export function createExerciseState(
  generated,
  {
    quickRatingFullPreview = false,
    speedPercent = 100,
    transpositionState = null,
  } = {},
) {
  const transposition = generated.meta.source.transposition ?? 0;
  return {
    source: generated.meta.source,
    speedPercent,
    notes: generated.notes,
    transposition,
    ...(transpositionState ? { transpositionState } : {}),
    timings: generated.timings,
    chicks: generated.chicks ?? null,
    bassHits: generated.bassHits ?? null,
    currentIndex: 0,
    executionStarted: false,
    quickRatingFullPreview,
    playbackStartedAt: null,
  };
}

export function resetExerciseProgress(exercise) {
  if (!exercise) return false;
  exercise.currentIndex = 0;
  exercise.executionStarted = false;
  return true;
}

export function enterExerciseMidi(exercise, midi) {
  if (!exercise || exercise.currentIndex >= exercise.notes.length) {
    return { accepted: false, complete: false, correct: false };
  }
  const correct = exercise.notes[exercise.currentIndex] === midi;
  if (!correct) {
    return { accepted: true, complete: false, correct: false };
  }
  exercise.currentIndex += 1;
  return {
    accepted: true,
    complete: exercise.currentIndex >= exercise.notes.length,
    correct: true,
  };
}

export function exercisePlaybackDurationMs(exercise) {
  const playbackEnds = [
    ...(exercise?.timings ?? []).map(
      ({ offset, duration }) => offset + duration,
    ),
    ...(exercise?.bassHits ?? []).map(
      ({ offset, duration }) => offset + duration,
    ),
    ...(exercise?.chicks ?? []).map(({ offset }) => offset + 0.06),
  ].filter(Number.isFinite);
  if (!playbackEnds.length) return 0;
  const timeScale = 100 / exercise.speedPercent;
  return Math.max(...playbackEnds) * timeScale * 1000;
}

export function originalExerciseNotes(exercise) {
  const transposition = exercise?.transposition ?? 0;
  return (exercise?.notes ?? []).map(
    (midi) => midi - transposition,
  );
}
