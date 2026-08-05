import { DTL_LICKS } from "../data/dtl-licks.js";
import { DTL_RHYTHM_PILOT } from "../data/dtl-rhythm-pilot.js";
import {
  jazzTranspositionRangeForNotes,
  keyboardLayoutForNotes,
  pitchClass,
  voiceBassHits,
} from "./engine.js";

export const TYPICAL_LICK_FILTER = Object.freeze({
  minOccurrences: 10,
  minPerformers: 3,
  minSolos: 3,
  minPhraseContainedRatio: 0.9,
  minAdjustedLogExcessProb: 1.35,
  extraIntervalPenalty: 0.5,
});

export const VERY_TYPICAL_LICK_FILTER = Object.freeze({
  minLogExcessProb: 2,
});

export const LICK_RHYTHM_MODE = Object.freeze({
  synthetic: "synthetic",
  reference: "reference",
});

export function adjustedLickSalience(lick) {
  const extraIntervals = Math.max(0, lick.intervals.length - 6);
  return (
    Number(lick.logExcessProb) -
    extraIntervals * TYPICAL_LICK_FILTER.extraIntervalPenalty
  );
}

export function isTypicalLick(lick) {
  return Boolean(
    lick &&
      Number(lick.occurrenceCount) >=
        TYPICAL_LICK_FILTER.minOccurrences &&
      Number(lick.performerCount) >= TYPICAL_LICK_FILTER.minPerformers &&
      Number(lick.soloCount) >= TYPICAL_LICK_FILTER.minSolos &&
      Number(lick.phraseContainedRatio) >=
        TYPICAL_LICK_FILTER.minPhraseContainedRatio &&
      adjustedLickSalience(lick) >=
        TYPICAL_LICK_FILTER.minAdjustedLogExcessProb,
  );
}

export function isVeryTypicalLick(lick) {
  return Boolean(
    isTypicalLick(lick) &&
      Number(lick.logExcessProb) >=
        VERY_TYPICAL_LICK_FILTER.minLogExcessProb,
  );
}

export function isPlayableVeryTypicalLick(lick) {
  return Boolean(
    isVeryTypicalLick(lick) &&
      Object.hasOwn(DTL_RHYTHM_PILOT.licks, lick.id),
  );
}

export function playableVeryTypicalLicks(licks = DTL_LICKS) {
  const byId = new Map(licks.map((lick) => [lick.id, lick]));
  return Object.keys(DTL_RHYTHM_PILOT.licks)
    .map((lickId) => byId.get(lickId))
    .filter(isPlayableVeryTypicalLick);
}

export function shuffledLickDeck(
  licks = playableVeryTypicalLicks(),
  random = Math.random,
  avoidFirstId = null,
) {
  const deck = [...licks];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const randomValue = Number(random());
    const swapIndex = Math.max(
      0,
      Math.min(
        index,
        Math.floor((Number.isFinite(randomValue) ? randomValue : 0) *
          (index + 1)),
      ),
    );
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  if (deck.length > 1 && deck[0]?.id === avoidFirstId) {
    const swapIndex = deck.findIndex(
      (lick, index) => index > 0 && lick?.id !== avoidFirstId,
    );
    if (swapIndex > 0) {
      [deck[0], deck[swapIndex]] = [deck[swapIndex], deck[0]];
    }
  }
  return deck;
}

function normalizeTiming(timing) {
  if (Array.isArray(timing)) {
    return {
      offset: Number(timing[0]),
      duration: Number(timing[1]),
    };
  }
  return {
    offset: Number(timing?.offset),
    duration: Number(timing?.duration),
  };
}

function normalizedTransposition(transposition) {
  return Number.isFinite(Number(transposition))
    ? Math.round(Number(transposition))
    : 0;
}

export function createLickSequence(lick, transposition = 0) {
  if (!lick || !Array.isArray(lick.notes) || !Array.isArray(lick.timings)) {
    throw new TypeError("A DTL lick with notes and timings is required.");
  }
  const semitones = normalizedTransposition(transposition);
  return {
    notes: lick.notes.map((midi) => Number(midi) + semitones),
    timings: lick.timings.map(normalizeTiming),
    meta: {
      source: {
        kind: "dtl-lick",
        id: lick.id,
        originalTempo: lick.tempo,
        transposition: semitones,
      },
    },
  };
}

function swungBeatPosition(tick, ticksPerBeat, swingRatio) {
  const beat = Math.floor(tick / ticksPerBeat);
  const tickWithinBeat =
    ((tick % ticksPerBeat) + ticksPerBeat) % ticksPerBeat;
  if (tickWithinBeat === ticksPerBeat / 2) {
    return beat + swingRatio / (swingRatio + 1);
  }
  return beat + tickWithinBeat / ticksPerBeat;
}

export function createSyntheticLickSequence(
  lick,
  transposition = 0,
  pilot = DTL_RHYTHM_PILOT.licks[lick?.id],
) {
  if (!lick || !Array.isArray(lick.notes) || !pilot) {
    throw new TypeError("A DTL lick with pilot rhythm data is required.");
  }
  if (![1, 2].includes(pilot.harmonyCount)) {
    throw new RangeError("The DTL pilot harmony count is inconsistent.");
  }
  if (
    pilot.harmonyCount === 2 &&
    (!Number.isInteger(pilot.changeNoteIndex) ||
      pilot.changeNoteIndex <= 0 ||
      pilot.changeNoteIndex >= lick.notes.length ||
      ![1, 3].includes(pilot.changeBeat))
  ) {
    throw new RangeError("The DTL pilot harmony change is inconsistent.");
  }
  const bassInterval = Number(pilot.bassInterval);
  const hasBass = Number.isInteger(bassInterval);
  if (
    hasBass &&
    pilot.harmonyCount === 2 &&
    !Number.isInteger(pilot.rootMotion)
  ) {
    throw new RangeError("The DTL pilot bass motion is inconsistent.");
  }

  const semitones = normalizedTransposition(transposition);
  const ticksPerBeat = DTL_RHYTHM_PILOT.ticksPerBeat;
  const eighthNoteTicks = DTL_RHYTHM_PILOT.eighthNoteTicks;
  const secondsPerBeat = 60 / DTL_RHYTHM_PILOT.tempo;
  const firstNoteTick = pilot.startTick;
  const measureTicks = pilot.meter * ticksPerBeat;
  const timelineStartTick =
    Math.floor(firstNoteTick / measureTicks) * measureTicks;
  const timelineStartBeat = swungBeatPosition(
    timelineStartTick,
    ticksPerBeat,
    DTL_RHYTHM_PILOT.swingRatio,
  );
  const offsetForTick = (tick) =>
    Number(
      (
        (swungBeatPosition(
          tick,
          ticksPerBeat,
          DTL_RHYTHM_PILOT.swingRatio,
        ) -
          timelineStartBeat) *
        secondsPerBeat
      ).toFixed(4),
    );
  const noteTicks = lick.notes.map(
    (_, noteIndex) => firstNoteTick + noteIndex * eighthNoteTicks,
  );
  const lastReleaseTick = noteTicks.at(-1) + eighthNoteTicks;
  const noteOffsets = noteTicks.map(offsetForTick);
  const lastReleaseOffset = offsetForTick(lastReleaseTick);
  const timings = noteOffsets.map((offset, index) => {
    const nextOffset = noteOffsets[index + 1] ?? lastReleaseOffset;
    return {
      offset,
      duration: Number(
        (Math.max(0.12, nextOffset - offset) * 0.88).toFixed(4),
      ),
    };
  });

  const playbackEndTick = lastReleaseTick;
  const firstBassRootPitchClass = hasBass
    ? pitchClass(lick.notes[0] - bassInterval)
    : null;
  const changeTick =
    pilot.harmonyCount === 2
      ? firstNoteTick + pilot.changeNoteIndex * eighthNoteTicks
      : null;
  const bassTicks = new Set();
  if (hasBass) {
    for (
      let tick = timelineStartTick;
      tick < playbackEndTick;
      tick += measureTicks
    ) {
      bassTicks.add(tick);
    }
    if (changeTick !== null) bassTicks.add(changeTick);
  }
  const orderedBassTicks = [...bassTicks].sort(
    (left, right) => left - right,
  );
  const finalBassEndTick = playbackEndTick + ticksPerBeat;
  const bassTemplates = orderedBassTicks.map((tick, index) => {
    const nextTick = orderedBassTicks[index + 1] ?? finalBassEndTick;
    const harmony = changeTick !== null && tick >= changeTick ? 2 : 1;
    const rootPitchClass =
      harmony === 2
        ? pitchClass(firstBassRootPitchClass + pilot.rootMotion)
        : firstBassRootPitchClass;
    return {
      offset: offsetForTick(tick),
      duration: Number(
        (offsetForTick(nextTick) - offsetForTick(tick)).toFixed(4),
      ),
      rootPitchClass,
      chord: `pilot-harmony-${harmony}`,
    };
  });
  const chicks = [];
  for (
    let tick = timelineStartTick;
    tick < playbackEndTick;
    tick += ticksPerBeat
  ) {
    const beat = (Math.floor(tick / ticksPerBeat) % pilot.meter) + 1;
    if (beat === 2 || beat === 4) {
      chicks.push({ beat, offset: offsetForTick(tick) });
    }
  }

  return {
    notes: lick.notes.map((midi) => Number(midi) + semitones),
    timings,
    chicks,
    bassHits: voiceBassHits(bassTemplates, semitones),
    meta: {
      source: {
        kind: "dtl-lick-synthetic",
        id: lick.id,
        originalTempo: DTL_RHYTHM_PILOT.tempo,
        transposition: semitones,
        meter: pilot.meter,
        startTick: pilot.startTick,
        swingRatio: DTL_RHYTHM_PILOT.swingRatio,
        harmonyCount: pilot.harmonyCount,
        changeNoteIndex: pilot.changeNoteIndex ?? null,
        changeBeat: pilot.changeBeat ?? null,
        hasBass,
        timelineStartTick,
      },
    },
  };
}

export function createLickExerciseSequence(lick, transposition = 0) {
  const sequence = createSyntheticLickSequence(lick, transposition);
  const pilot = DTL_RHYTHM_PILOT.licks[lick.id];
  return {
    ...sequence,
    keyboard: keyboardLayoutForNotes(sequence.notes),
    meta: {
      source: {
        ...sequence.meta.source,
        kind: "dtl-lick-exercise",
        patternId: pilot.patternId,
        harmonicFunction: pilot.harmonicFunction,
        startDegree: pilot.startDegree,
        noteCount: lick.notes.length,
        transpositionRange: jazzTranspositionRangeForNotes(lick.notes),
      },
    },
  };
}

export function moveLickIndex(index, delta, total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  if (!count) return 0;
  const current = Math.max(
    0,
    Math.min(count - 1, Math.floor(Number(index) || 0)),
  );
  return Math.max(
    0,
    Math.min(count - 1, current + Math.trunc(Number(delta) || 0)),
  );
}

function transpositionChoices(lick) {
  const [minimum, maximum] = jazzTranspositionRangeForNotes(lick.notes);
  return Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index,
  ).filter((transposition) => transposition !== 0);
}

export function randomLickTransposition(
  lick,
  random = Math.random,
  previous = null,
) {
  const allChoices = transpositionChoices(lick);
  const choices = allChoices.filter(
    (transposition) => transposition !== previous,
  );
  const available = choices.length ? choices : allChoices;
  if (!available.length) return 0;
  const randomIndex = Math.max(
    0,
    Math.min(
      available.length - 1,
      Math.floor(Number(random()) * available.length),
    ),
  );
  return available[randomIndex];
}

function queryLickExplorerElements(documentObject) {
  return {
    panel: documentObject.querySelector("#lick-explorer-panel"),
    close: documentObject.querySelector("#close-lick-explorer"),
    previous: documentObject.querySelector("#lick-explorer-previous"),
    next: documentObject.querySelector("#lick-explorer-next"),
    progress: documentObject.querySelector("#lick-explorer-progress"),
    patternId: documentObject.querySelector("#lick-explorer-pattern-id"),
    harmonicFunction: documentObject.querySelector(
      "#lick-explorer-harmonic-function",
    ),
    startDegree: documentObject.querySelector(
      "#lick-explorer-start-degree",
    ),
    occurrences: documentObject.querySelector("#lick-explorer-occurrences"),
    length: documentObject.querySelector("#lick-explorer-length"),
    intervals: documentObject.querySelector("#lick-explorer-intervals"),
    rhythmRow: documentObject.querySelector("#lick-explorer-rhythm-row"),
    rhythmClass: documentObject.querySelector("#lick-explorer-rhythm-class"),
    placementRow: documentObject.querySelector(
      "#lick-explorer-placement-row",
    ),
    placement: documentObject.querySelector("#lick-explorer-placement"),
    play: documentObject.querySelector("#lick-explorer-play"),
    playOriginal: documentObject.querySelector(
      "#lick-explorer-play-original",
    ),
    playRandom: documentObject.querySelector("#lick-explorer-play-random"),
    stop: documentObject.querySelector("#lick-explorer-stop"),
    autoRandom: documentObject.querySelector("#lick-explorer-auto-random"),
    rhythmMode: documentObject.querySelector("#lick-explorer-rhythm-mode"),
    status: documentObject.querySelector("#lick-explorer-status"),
  };
}

function normalizeRhythmMode(value) {
  return Object.values(LICK_RHYTHM_MODE).includes(value)
    ? value
    : LICK_RHYTHM_MODE.reference;
}

export function createLickExplorer({
  audioRuntime,
  documentObject = globalThis.document,
  licks = DTL_LICKS,
  onClose = () => {},
  random = Math.random,
  translate = (key) => key,
  windowObject = globalThis.window,
} = {}) {
  if (!audioRuntime) throw new TypeError("An audio runtime is required.");
  if (!Array.isArray(licks) || !licks.length) {
    throw new TypeError("The DTL lick corpus is empty.");
  }
  const elements = queryLickExplorerElements(documentObject);
  if (Object.values(elements).some((element) => !element)) {
    throw new Error("The Lick Explorer DOM is incomplete.");
  }

  const allLicks = licks;
  const visibleLicks = playableVeryTypicalLicks(allLicks);
  if (!visibleLicks.length) {
    throw new TypeError("The playable DTL lick selection is empty.");
  }
  let index = 0;
  let transposition = 0;
  let rhythmMode = normalizeRhythmMode(elements.rhythmMode.value);
  let playbackTimer = null;
  let playbackVersion = 0;
  let playing = false;
  const removers = [];

  function currentLick() {
    return visibleLicks[index];
  }

  function setPlaying(nextPlaying) {
    playing = Boolean(nextPlaying);
    elements.play.setAttribute("aria-pressed", String(playing));
    elements.stop.disabled = !playing;
  }

  function renderStatus(key = null) {
    if (!key) {
      elements.status.textContent = translate(
        transposition === 0
          ? "lickExplorer.status.original"
          : "lickExplorer.status.transposed",
        { value: transposition },
      );
      return;
    }
    elements.status.textContent = translate(key, {
      value: transposition,
    });
  }

  function render() {
    const lick = currentLick();
    const pilot = DTL_RHYTHM_PILOT.licks[lick.id] ?? null;
    const syntheticOption = elements.rhythmMode.querySelector(
      `[value="${LICK_RHYTHM_MODE.synthetic}"]`,
    );
    syntheticOption.disabled = !pilot;
    if (!pilot && rhythmMode === LICK_RHYTHM_MODE.synthetic) {
      rhythmMode = LICK_RHYTHM_MODE.reference;
      elements.rhythmMode.value = rhythmMode;
    }
    elements.progress.textContent = translate("lickExplorer.progress", {
      current: index + 1,
      total: visibleLicks.length,
    });
    elements.patternId.textContent = pilot?.patternId ?? "";
    elements.harmonicFunction.textContent =
      pilot?.harmonicFunction ?? "";
    elements.startDegree.textContent = pilot?.startDegree ?? "";
    elements.harmonicFunction.parentElement.hidden =
      !pilot?.harmonicFunction;
    elements.startDegree.parentElement.hidden = !pilot?.startDegree;
    elements.occurrences.textContent = translate(
      "lickExplorer.occurrenceCount",
      { count: lick.occurrenceCount },
    );
    elements.length.textContent = translate("lickExplorer.noteCount", {
      count: lick.notes.length,
    });
    elements.intervals.textContent = `[${lick.intervals.join(", ")}]`;
    elements.rhythmRow.hidden = !lick.rhythmClass;
    elements.rhythmClass.textContent = lick.rhythmClass ?? "";
    elements.placementRow.hidden =
      !pilot || rhythmMode !== LICK_RHYTHM_MODE.synthetic;
    if (pilot) {
      elements.placement.textContent = translate(
        pilot.harmonyCount === 1
          ? "lickExplorer.placement.single"
          : "lickExplorer.placement.double",
        pilot.harmonyCount === 1
          ? {}
          : {
              beat: pilot.changeBeat,
              note: pilot.changeNoteIndex + 1,
            },
      );
    } else {
      elements.placement.textContent = "";
    }
    elements.previous.disabled = index === 0;
    elements.next.disabled = index === visibleLicks.length - 1;
    renderStatus();
  }

  function stop({ announce = false } = {}) {
    playbackVersion += 1;
    if (playbackTimer !== null) {
      windowObject.clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    audioRuntime.stopActiveSources();
    setPlaying(false);
    if (announce) renderStatus("lickExplorer.status.stopped");
  }

  function schedule(sequence, version) {
    if (version !== playbackVersion) return false;
    sequence.notes.forEach((midi, noteIndex) => {
      const timing = sequence.timings[noteIndex];
      audioRuntime.playTone(
        midi,
        timing.offset,
        timing.duration,
        noteIndex === 0,
      );
    });
    for (const chick of sequence.chicks ?? []) {
      audioRuntime.playChick?.(chick.offset);
    }
    for (const bassHit of sequence.bassHits ?? []) {
      audioRuntime.playBass?.(
        bassHit.midi,
        bassHit.offset,
        bassHit.duration,
      );
    }
    const playbackEnds = [
      ...sequence.timings.map(
        ({ offset, duration }) => offset + duration,
      ),
      ...(sequence.bassHits ?? []).map(
        ({ offset, duration }) => offset + duration,
      ),
      ...(sequence.chicks ?? []).map(({ offset }) => offset + 0.06),
    ];
    const durationMs = Math.ceil(
      Math.max(...playbackEnds) * 1000 + 60,
    );
    setPlaying(true);
    renderStatus("lickExplorer.status.playing");
    playbackTimer = windowObject.setTimeout(() => {
      playbackTimer = null;
      setPlaying(false);
      renderStatus();
    }, durationMs);
    return true;
  }

  async function playAt(nextTransposition) {
    stop();
    transposition = nextTransposition;
    const version = playbackVersion;
    const lick = currentLick();
    const pilot = DTL_RHYTHM_PILOT.licks[lick.id] ?? null;
    const sequence =
      rhythmMode === LICK_RHYTHM_MODE.synthetic && pilot
        ? createSyntheticLickSequence(lick, transposition, pilot)
        : createLickSequence(lick, transposition);
    audioRuntime.getAudioContext();
    await audioRuntime.preloadMelodySamples(sequence.notes);
    if (sequence.bassHits?.length && audioRuntime.preloadBassSamples) {
      try {
        await audioRuntime.preloadBassSamples(sequence.bassHits);
      } catch {
        // The pilot remains usable without its optional bass samples.
      }
    }
    return schedule(sequence, version);
  }

  async function play() {
    if (elements.autoRandom.checked) {
      transposition = randomLickTransposition(
        currentLick(),
        random,
        transposition,
      );
    }
    return playAt(transposition);
  }

  function playOriginal() {
    return playAt(0);
  }

  function playRandom() {
    return playAt(
      randomLickTransposition(currentLick(), random, transposition),
    );
  }

  function move(delta) {
    const nextIndex = moveLickIndex(index, delta, visibleLicks.length);
    if (nextIndex === index) return false;
    stop();
    index = nextIndex;
    transposition = 0;
    render();
    void play();
    return true;
  }

  function previous() {
    return move(-1);
  }

  function next() {
    return move(1);
  }

  function setRhythmMode(value) {
    const nextMode = normalizeRhythmMode(value);
    const hasPilot = Boolean(DTL_RHYTHM_PILOT.licks[currentLick().id]);
    if (nextMode === LICK_RHYTHM_MODE.synthetic && !hasPilot) {
      elements.rhythmMode.value = rhythmMode;
      return false;
    }
    elements.rhythmMode.value = nextMode;
    if (nextMode === rhythmMode) return false;
    stop();
    rhythmMode = nextMode;
    render();
    void playAt(transposition);
    return true;
  }

  function open() {
    elements.panel.hidden = false;
    render();
    elements.play.focus();
  }

  function close() {
    stop();
    elements.panel.hidden = true;
    onClose();
  }

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }

  listen(elements.close, "click", close);
  listen(elements.previous, "click", previous);
  listen(elements.next, "click", next);
  listen(elements.play, "click", () => void play());
  listen(elements.playOriginal, "click", () => void playOriginal());
  listen(elements.playRandom, "click", () => void playRandom());
  listen(elements.stop, "click", () => stop({ announce: true }));
  listen(elements.rhythmMode, "change", () => {
    setRhythmMode(elements.rhythmMode.value);
  });
  listen(documentObject, "keydown", (event) => {
    if (event.key === "Escape" && !elements.panel.hidden) {
      event.preventDefault();
      close();
    }
  });

  setPlaying(false);
  render();

  return Object.freeze({
    close,
    destroy() {
      stop();
      for (const remove of removers.splice(0).reverse()) remove();
    },
    next,
    open,
    play,
    playOriginal,
    playRandom,
    previous,
    setRhythmMode,
    snapshot: () => ({
      autoRandom: elements.autoRandom.checked,
      harmonicFunction:
        DTL_RHYTHM_PILOT.licks[currentLick().id].harmonicFunction,
      id: currentLick().id,
      index,
      patternId: DTL_RHYTHM_PILOT.licks[currentLick().id].patternId,
      playing,
      pilotAvailable: Boolean(DTL_RHYTHM_PILOT.licks[currentLick().id]),
      rhythmMode,
      sourceTotal: allLicks.length,
      startDegree: DTL_RHYTHM_PILOT.licks[currentLick().id].startDegree,
      total: visibleLicks.length,
      transposition,
    }),
    stop,
  });
}
