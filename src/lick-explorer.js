import { DTL_LICKS } from "../data/dtl-licks.js";
import { jazzTranspositionRangeForNotes } from "./engine.js";

export const TYPICAL_LICK_FILTER = Object.freeze({
  minOccurrences: 10,
  minPerformers: 3,
  minSolos: 3,
  minPhraseContainedRatio: 0.9,
  minAdjustedLogExcessProb: 1.35,
  extraIntervalPenalty: 0.5,
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

export function createLickSequence(lick, transposition = 0) {
  if (!lick || !Array.isArray(lick.notes) || !Array.isArray(lick.timings)) {
    throw new TypeError("A DTL lick with notes and timings is required.");
  }
  const semitones = Number.isFinite(Number(transposition))
    ? Math.round(Number(transposition))
    : 0;
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
    play: documentObject.querySelector("#lick-explorer-play"),
    playOriginal: documentObject.querySelector(
      "#lick-explorer-play-original",
    ),
    playRandom: documentObject.querySelector("#lick-explorer-play-random"),
    stop: documentObject.querySelector("#lick-explorer-stop"),
    autoRandom: documentObject.querySelector("#lick-explorer-auto-random"),
    typicalOnly: documentObject.querySelector(
      "#lick-explorer-typical-only",
    ),
    status: documentObject.querySelector("#lick-explorer-status"),
  };
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
  let typicalOnly = elements.typicalOnly.checked;
  let visibleLicks = typicalOnly
    ? allLicks.filter(isTypicalLick)
    : allLicks;
  if (!visibleLicks.length) {
    throw new TypeError("The typical DTL lick selection is empty.");
  }
  let index = 0;
  let transposition = 0;
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
    const lastTiming = sequence.timings.at(-1);
    const durationMs = Math.ceil(
      (lastTiming.offset + lastTiming.duration) * 1000 + 60,
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
    const sequence = createLickSequence(currentLick(), transposition);
    audioRuntime.getAudioContext();
    await audioRuntime.preloadMelodySamples(sequence.notes);
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

  function setTypicalOnly(enabled) {
    const nextTypicalOnly = Boolean(enabled);
    elements.typicalOnly.checked = nextTypicalOnly;
    if (nextTypicalOnly === typicalOnly) return false;

    const previousLick = currentLick();
    const previousSourceIndex = sourceIndex.get(previousLick) ?? 0;
    const nextLicks = nextTypicalOnly
      ? allLicks.filter(isTypicalLick)
      : allLicks;
    if (!nextLicks.length) {
      elements.typicalOnly.checked = typicalOnly;
      return false;
    }

    stop();
    typicalOnly = nextTypicalOnly;
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
  listen(elements.typicalOnly, "change", () => {
    setTypicalOnly(elements.typicalOnly.checked);
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
    setTypicalOnly,
    snapshot: () => ({
      autoRandom: elements.autoRandom.checked,
      id: currentLick().id,
      index,
      playing,
      sourceTotal: allLicks.length,
      total: visibleLicks.length,
      transposition,
      typicalOnly,
    }),
    stop,
  });
}
