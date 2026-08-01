import { DTL_LICKS } from "../data/dtl-licks.js";
import { DTL_RHYTHM_PILOT } from "../data/dtl-rhythm-pilot.js";
import {
  jazzTranspositionRangeForNotes,
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

export const LICK_FILTER = Object.freeze({
  all: "all",
  typical: "typical",
  veryTypical: "very-typical",
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

function normalizeLickFilter(value) {
  return Object.values(LICK_FILTER).includes(value)
    ? value
    : LICK_FILTER.all;
}

function filterLicks(licks, filter) {
  if (filter === LICK_FILTER.veryTypical) {
    return licks.filter(isVeryTypicalLick);
  }
  if (filter === LICK_FILTER.typical) {
    return licks.filter(isTypicalLick);
  }
  return licks;
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

  const semitones = normalizedTransposition(transposition);
  const ticksPerBeat = DTL_RHYTHM_PILOT.ticksPerBeat;
  const eighthNoteTicks = DTL_RHYTHM_PILOT.eighthNoteTicks;
  const secondsPerBeat = 60 / DTL_RHYTHM_PILOT.tempo;
  const leadInTicks = pilot.meter * ticksPerBeat;
  const firstNoteTick = leadInTicks + pilot.startTick;
  const noteTicks = lick.notes.map(
    (_, noteIndex) => firstNoteTick + noteIndex * eighthNoteTicks,
  );
  const beatPositions = noteTicks.map((tick) =>
    swungBeatPosition(
      tick,
      ticksPerBeat,
      DTL_RHYTHM_PILOT.swingRatio,
    ),
  );
  const lastReleaseTick = noteTicks.at(-1) + eighthNoteTicks;
  const lastReleaseBeat = swungBeatPosition(
    lastReleaseTick,
    ticksPerBeat,
    DTL_RHYTHM_PILOT.swingRatio,
  );
  const timings = beatPositions.map((beatPosition, index) => {
    const nextBeatPosition = beatPositions[index + 1] ?? lastReleaseBeat;
    return {
      offset: Number((beatPosition * secondsPerBeat).toFixed(4)),
      duration: Number(
        (Math.max(0.12, nextBeatPosition - beatPosition) *
          secondsPerBeat *
          0.88).toFixed(4),
      ),
    };
  });

  const playbackEndTick = Math.max(
    pilot.meter * 2 * ticksPerBeat,
    lastReleaseTick,
  );
  const firstBassRootPitchClass = pitchClass(
    lick.notes[0] - pilot.firstNoteBassInterval,
  );
  const changeTick =
    pilot.harmonyCount === 2
      ? firstNoteTick + pilot.changeNoteIndex * eighthNoteTicks
      : null;
  const bassTicks = new Set();
  for (
    let tick = 0;
    tick < playbackEndTick;
    tick += pilot.meter * ticksPerBeat
  ) {
    bassTicks.add(tick);
  }
  if (changeTick !== null) bassTicks.add(changeTick);
  const bassTemplates = [...bassTicks]
    .sort((left, right) => left - right)
    .map((tick) => {
      const harmony = changeTick !== null && tick >= changeTick ? 2 : 1;
      const rootPitchClass =
        harmony === 2
          ? pitchClass(firstBassRootPitchClass + pilot.rootMotion)
          : firstBassRootPitchClass;
      return {
        offset: Number(
          (
            swungBeatPosition(
              tick,
              ticksPerBeat,
              DTL_RHYTHM_PILOT.swingRatio,
            ) * secondsPerBeat
          ).toFixed(4),
        ),
        duration: Number((secondsPerBeat * 0.82).toFixed(4)),
        rootPitchClass,
        chord: `pilot-harmony-${harmony}`,
      };
    });
  const beatCount = Math.ceil(playbackEndTick / ticksPerBeat);
  const chicks = Array.from({ length: beatCount }, (_, beatIndex) => ({
    beat: (beatIndex % pilot.meter) + 1,
    offset: Number((beatIndex * secondsPerBeat).toFixed(4)),
  })).filter(({ beat }) => beat === 2 || beat === 4);

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
    filter: documentObject.querySelector("#lick-explorer-filter"),
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
  const sourceIndex = new Map(
    allLicks.map((lick, lickIndex) => [lick, lickIndex]),
  );
  let filter = normalizeLickFilter(elements.filter.value);
  let visibleLicks = filterLicks(allLicks, filter);
  if (!visibleLicks.length) {
    throw new TypeError("The DTL lick selection is empty.");
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

  function setFilter(value) {
    const nextFilter = normalizeLickFilter(value);
    elements.filter.value = nextFilter;
    if (nextFilter === filter) return false;

    const previousLick = currentLick();
    const previousSourceIndex = sourceIndex.get(previousLick) ?? 0;
    const nextLicks = filterLicks(allLicks, nextFilter);
    if (!nextLicks.length) {
      elements.filter.value = filter;
      return false;
    }

    stop();
    filter = nextFilter;
    visibleLicks = nextLicks;
    const preservedIndex = visibleLicks.indexOf(previousLick);
    const followingIndex = visibleLicks.findIndex(
      (lick) => (sourceIndex.get(lick) ?? 0) >= previousSourceIndex,
    );
    index =
      preservedIndex >= 0
        ? preservedIndex
        : followingIndex >= 0
          ? followingIndex
          : visibleLicks.length - 1;
    transposition = 0;
    render();
    return true;
  }

  function setTypicalOnly(enabled) {
    return setFilter(enabled ? LICK_FILTER.typical : LICK_FILTER.all);
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
  listen(elements.filter, "change", () => {
    setFilter(elements.filter.value);
  });
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
    setFilter,
    setRhythmMode,
    setTypicalOnly,
    snapshot: () => ({
      autoRandom: elements.autoRandom.checked,
      filter,
      id: currentLick().id,
      index,
      playing,
      pilotAvailable: Boolean(DTL_RHYTHM_PILOT.licks[currentLick().id]),
      rhythmMode,
      sourceTotal: allLicks.length,
      total: visibleLicks.length,
      transposition,
      typicalOnly: filter !== LICK_FILTER.all,
    }),
    stop,
  });
}
