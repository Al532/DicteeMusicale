import {
  MIN_EDITED_PHRASE_NOTES,
  normalizeEditedPhraseEvents,
} from "./phrase-settings.js";

export const PHRASE_EDITOR_TIME_STEP = 0.025;
export const PHRASE_EDITOR_MIN_DURATION = 0.01;

const PIXELS_PER_SECOND = 190;
const PITCH_ROW_HEIGHT = 34;

function rounded(value) {
  return Number(Number(value).toFixed(4));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneEvents(events) {
  return events.map((event) => [...event]);
}

export function phraseEditorEventsEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((event, index) =>
      event.every((value, field) => value === right[index]?.[field]),
    )
  );
}

function constrainedEvent(events, index, patch = {}) {
  const current = events[index];
  const previous = events[index - 1];
  const next = events[index + 1];
  const minimumOnset = previous
    ? previous[1] + 0.001
    : 0;
  const maximumOnset = next
    ? next[1] - 0.001
    : Number.POSITIVE_INFINITY;
  const requestedOnset = Number(patch.onset ?? current[1]);
  const onset = maximumOnset >= minimumOnset
    ? clamp(requestedOnset, minimumOnset, maximumOnset)
    : current[1];

  return [
    clamp(Math.round(Number(patch.midi ?? current[0])), 0, 127),
    rounded(onset),
    rounded(
      clamp(
        Number(patch.duration ?? current[2]),
        PHRASE_EDITOR_MIN_DURATION,
        16,
      ),
    ),
    current[3],
  ];
}

export function createPhraseEditorModel({
  events,
  originalEvents,
} = {}) {
  const normalizedOriginal = normalizeEditedPhraseEvents(originalEvents);
  const normalizedEvents = normalizeEditedPhraseEvents(events);
  if (!normalizedOriginal || !normalizedEvents) {
    throw new Error("La phrase MIDI est invalide.");
  }

  let selectedIndex = 0;
  let historyIndex = 0;
  let history = [cloneEvents(normalizedEvents)];

  function currentEvents() {
    return history[historyIndex];
  }

  function commit(nextEvents, nextSelectedIndex = selectedIndex) {
    const normalized = normalizeEditedPhraseEvents(nextEvents);
    if (!normalized) return false;
    history = history.slice(0, historyIndex + 1);
    history.push(cloneEvents(normalized));
    historyIndex += 1;
    selectedIndex = clamp(
      nextSelectedIndex,
      0,
      normalized.length - 1,
    );
    return true;
  }

  function updateSelected(patch) {
    const next = cloneEvents(currentEvents());
    next[selectedIndex] = constrainedEvent(next, selectedIndex, patch);
    if (phraseEditorEventsEqual(next, currentEvents())) return false;
    return commit(next);
  }

  return Object.freeze({
    addAfter() {
      const current = currentEvents()[selectedIndex];
      const nextEvent = currentEvents()[selectedIndex + 1];
      const onset = current[1] + Math.max(
        PHRASE_EDITOR_MIN_DURATION,
        current[2],
      );
      const duration = clamp(
        current[2],
        0.06,
        0.25,
      );
      const inserted = [
        current[0],
        rounded(onset),
        rounded(duration),
        current[3],
      ];
      const next = cloneEvents(currentEvents());
      const requiredShift = nextEvent
        ? Math.max(0, onset + duration + 0.001 - nextEvent[1])
        : 0;
      for (let index = selectedIndex + 1; index < next.length; index += 1) {
        next[index][1] = rounded(next[index][1] + requiredShift);
      }
      next.splice(selectedIndex + 1, 0, inserted);
      return commit(next, selectedIndex + 1);
    },
    changeDuration(delta) {
      const current = currentEvents()[selectedIndex];
      return updateSelected({ duration: current[2] + Number(delta) });
    },
    changePitch(delta) {
      const current = currentEvents()[selectedIndex];
      return updateSelected({ midi: current[0] + Number(delta) });
    },
    deleteSelected() {
      if (currentEvents().length <= MIN_EDITED_PHRASE_NOTES) return false;
      const next = cloneEvents(currentEvents());
      next.splice(selectedIndex, 1);
      return commit(next, Math.min(selectedIndex, next.length - 1));
    },
    duplicateSelected() {
      const current = currentEvents()[selectedIndex];
      const nextEvent = currentEvents()[selectedIndex + 1];
      const insertionDuration = Math.max(
        PHRASE_EDITOR_MIN_DURATION,
        current[2],
      );
      const inserted = [
        current[0],
        rounded(current[1] + insertionDuration),
        rounded(insertionDuration),
        current[3],
      ];
      const next = cloneEvents(currentEvents());
      const requiredShift = nextEvent
        ? Math.max(
            0,
            inserted[1] + insertionDuration + 0.001 - nextEvent[1],
          )
        : 0;
      for (let index = selectedIndex + 1; index < next.length; index += 1) {
        next[index][1] = rounded(next[index][1] + requiredShift);
      }
      next.splice(selectedIndex + 1, 0, inserted);
      return commit(next, selectedIndex + 1);
    },
    get events() {
      return cloneEvents(currentEvents());
    },
    get canRedo() {
      return historyIndex < history.length - 1;
    },
    get canUndo() {
      return historyIndex > 0;
    },
    get isOriginal() {
      return phraseEditorEventsEqual(
        currentEvents(),
        normalizedOriginal,
      );
    },
    previewSelected(patch) {
      return constrainedEvent(currentEvents(), selectedIndex, patch);
    },
    redo() {
      if (historyIndex >= history.length - 1) return false;
      historyIndex += 1;
      selectedIndex = Math.min(
        selectedIndex,
        currentEvents().length - 1,
      );
      return true;
    },
    restoreOriginal() {
      if (phraseEditorEventsEqual(currentEvents(), normalizedOriginal)) {
        return false;
      }
      return commit(normalizedOriginal, 0);
    },
    select(index) {
      const nextIndex = Math.round(Number(index));
      if (nextIndex < 0 || nextIndex >= currentEvents().length) return false;
      selectedIndex = nextIndex;
      return true;
    },
    get selectedEvent() {
      return [...currentEvents()[selectedIndex]];
    },
    get selectedIndex() {
      return selectedIndex;
    },
    shiftOnset(delta) {
      const current = currentEvents()[selectedIndex];
      return updateSelected({ onset: current[1] + Number(delta) });
    },
    undo() {
      if (historyIndex <= 0) return false;
      historyIndex -= 1;
      selectedIndex = Math.min(
        selectedIndex,
        currentEvents().length - 1,
      );
      return true;
    },
    updateSelected,
  });
}

export function createPhraseEditor({
  documentObject,
  noteLabel,
  onClose = () => {},
  onPreview = () => 0,
  onSave = () => {},
  onStopPreview = () => {},
  translate,
  windowObject,
}) {
  const modal = documentObject.querySelector("#phrase-editor-modal");
  const roll = documentObject.querySelector("#phrase-editor-roll");
  const scroll = documentObject.querySelector("#phrase-editor-scroll");
  const title = documentObject.querySelector("#phrase-editor-title");
  const counter = documentObject.querySelector("#phrase-editor-counter");
  const pitchOutput = documentObject.querySelector("#phrase-editor-pitch");
  const onsetOutput = documentObject.querySelector("#phrase-editor-onset");
  const durationOutput = documentObject.querySelector(
    "#phrase-editor-duration",
  );
  const play = documentObject.querySelector("#phrase-editor-play");
  const playSelected = documentObject.querySelector(
    "#phrase-editor-play-selected",
  );
  const undo = documentObject.querySelector("#phrase-editor-undo");
  const redo = documentObject.querySelector("#phrase-editor-redo");
  const restore = documentObject.querySelector("#phrase-editor-restore");
  const remove = documentObject.querySelector("#phrase-editor-delete");
  const closeButtons = documentObject.querySelectorAll(
    "#phrase-editor-close, #phrase-editor-cancel",
  );
  const save = documentObject.querySelector("#phrase-editor-save");

  let model = null;
  let sourceEvents = null;
  let originalOnset = 0;
  let opener = null;
  let previewTimer = null;
  let previewMode = null;
  let drag = null;
  let layout = null;

  function setPreviewing(mode = null) {
    previewMode = mode;
    play.textContent = translate(
      mode === "phrase" ? "audio.stop" : "phraseEditor.play",
    );
    playSelected.textContent = translate(
      mode === "selected"
        ? "audio.stop"
        : "phraseEditor.playSelected",
    );
    play.setAttribute("aria-pressed", String(mode === "phrase"));
    playSelected.setAttribute(
      "aria-pressed",
      String(mode === "selected"),
    );
    play.disabled = Boolean(mode && mode !== "phrase");
    playSelected.disabled = Boolean(mode && mode !== "selected");
  }

  function stopPreview() {
    if (previewTimer !== null) {
      windowObject.clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (previewMode) onStopPreview();
    setPreviewing();
  }

  function renderInspector(event = model?.selectedEvent) {
    if (!model || !event) return;
    counter.value = `${model.selectedIndex + 1}/${model.events.length}`;
    pitchOutput.value = noteLabel(event[0]);
    onsetOutput.value = `${(event[1] - originalOnset).toFixed(3)} s`;
    durationOutput.value = `${Math.round(event[2] * 1000)} ms`;
    undo.disabled = !model.canUndo;
    redo.disabled = !model.canRedo;
    restore.disabled = model.isOriginal;
    remove.disabled = model.events.length <= MIN_EDITED_PHRASE_NOTES;
  }

  function positionNote(element, event) {
    const left = (event[1] - layout.timeStart) * PIXELS_PER_SECOND;
    const top = (layout.maximumMidi - event[0]) * PITCH_ROW_HEIGHT + 3;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${Math.max(28, event[2] * PIXELS_PER_SECOND)}px`;
  }

  function renderSelection() {
    for (const note of roll.querySelectorAll(".phrase-editor-note")) {
      const selected = Number(note.dataset.index) === model.selectedIndex;
      note.classList.toggle("selected", selected);
      note.setAttribute("aria-pressed", String(selected));
    }
    renderInspector();
  }

  function revealSelectedNote() {
    const selected = roll.querySelector(
      `.phrase-editor-note[data-index="${model.selectedIndex}"]`,
    );
    if (!selected) return;
    scroll.scrollLeft = clamp(
      selected.offsetLeft - (scroll.clientWidth - selected.offsetWidth) / 2,
      0,
      Math.max(0, scroll.scrollWidth - scroll.clientWidth),
    );
    scroll.scrollTop = clamp(
      selected.offsetTop - (scroll.clientHeight - selected.offsetHeight) / 2,
      0,
      Math.max(0, scroll.scrollHeight - scroll.clientHeight),
    );
  }

  function render() {
    if (!model) return;
    const events = model.events;
    const pitches = events.map(([midi]) => midi);
    let minimumMidi = Math.max(0, Math.min(...pitches) - 2);
    let maximumMidi = Math.min(127, Math.max(...pitches) + 2);
    const missingRows = Math.max(0, 12 - (maximumMidi - minimumMidi + 1));
    minimumMidi = Math.max(0, minimumMidi - Math.ceil(missingRows / 2));
    maximumMidi = Math.min(127, maximumMidi + Math.floor(missingRows / 2));
    const timeStart = Math.max(0, Math.min(...events.map((event) => event[1])) - 0.2);
    const timeEnd = Math.max(
      ...events.map((event) => event[1] + event[2]),
    ) + 0.4;
    layout = { maximumMidi, minimumMidi, timeStart };
    roll.style.width = `${Math.max(720, (timeEnd - timeStart) * PIXELS_PER_SECOND)}px`;
    roll.style.height = `${(maximumMidi - minimumMidi + 1) * PITCH_ROW_HEIGHT}px`;
    roll.style.setProperty("--phrase-editor-row-height", `${PITCH_ROW_HEIGHT}px`);
    roll.style.setProperty(
      "--phrase-editor-second-width",
      `${PIXELS_PER_SECOND}px`,
    );

    const fragment = documentObject.createDocumentFragment();
    events.forEach((event, index) => {
      const note = documentObject.createElement("button");
      note.type = "button";
      note.className = "phrase-editor-note";
      note.dataset.index = String(index);
      note.dataset.midi = String(event[0]);
      note.textContent = noteLabel(event[0]);
      note.setAttribute(
        "aria-label",
        translate("phraseEditor.noteAria", {
          current: index + 1,
          note: noteLabel(event[0]),
          total: events.length,
        }),
      );
      const handle = documentObject.createElement("span");
      handle.className = "phrase-editor-resize";
      handle.dataset.resize = "true";
      handle.setAttribute("aria-hidden", "true");
      note.append(handle);
      positionNote(note, event);
      note.addEventListener("click", () => {
        model.select(index);
        renderSelection();
      });
      note.addEventListener("pointerdown", (eventObject) => {
        eventObject.preventDefault();
        model.select(index);
        renderSelection();
        drag = {
          action: eventObject.target.closest?.("[data-resize]")
            ? "resize"
            : "move",
          element: note,
          index,
          original: model.selectedEvent,
          preview: model.selectedEvent,
          startX: eventObject.clientX,
          startY: eventObject.clientY,
        };
      });
      fragment.append(note);
    });
    roll.replaceChildren(fragment);
    renderSelection();
    revealSelectedNote();
  }

  function commit(action) {
    if (!model) return;
    stopPreview();
    if (action()) render();
  }

  function close({ restoreFocus = true } = {}) {
    if (modal.hidden) return;
    stopPreview();
    drag = null;
    modal.hidden = true;
    documentObject.body.classList.remove("phrase-editor-open");
    model = null;
    sourceEvents = null;
    if (restoreFocus) opener?.focus?.();
    opener = null;
    onClose();
  }

  function togglePreview(mode) {
    if (!model) return;
    if (previewMode) {
      stopPreview();
      return;
    }
    const startIndex = mode === "selected" ? model.selectedIndex : 0;
    const duration = Math.max(
      0,
      Number(onPreview(model.events.slice(startIndex))) || 0,
    );
    setPreviewing(mode);
    previewTimer = windowObject.setTimeout(() => {
      previewTimer = null;
      setPreviewing();
    }, duration);
  }

  const actions = {
    "add-after": () => model.addAfter(),
    "duration-decrease": () =>
      model.changeDuration(-PHRASE_EDITOR_TIME_STEP),
    "duration-increase": () =>
      model.changeDuration(PHRASE_EDITOR_TIME_STEP),
    duplicate: () => model.duplicateSelected(),
    "onset-decrease": () => model.shiftOnset(-PHRASE_EDITOR_TIME_STEP),
    "onset-increase": () => model.shiftOnset(PHRASE_EDITOR_TIME_STEP),
    "pitch-decrease": () => model.changePitch(-1),
    "pitch-increase": () => model.changePitch(1),
    delete: () => model.deleteSelected(),
    redo: () => model.redo(),
    restore: () => model.restoreOriginal(),
    undo: () => model.undo(),
  };
  for (const button of modal.querySelectorAll("[data-phrase-editor-action]")) {
    button.addEventListener("click", () => {
      const action = actions[button.dataset.phraseEditorAction];
      if (action) commit(action);
    });
  }
  play.addEventListener("click", () => togglePreview("phrase"));
  playSelected.addEventListener("click", () =>
    togglePreview("selected")
  );
  for (const button of closeButtons) {
    button.addEventListener("click", () => close());
  }
  save.addEventListener("click", () => {
    if (!model) return;
    const editedEvents = model.isOriginal ? null : model.events;
    const originalEvents = cloneEvents(sourceEvents);
    close();
    onSave(editedEvents, originalEvents);
  });

  windowObject.addEventListener("pointermove", (eventObject) => {
    if (!drag || !model) return;
    eventObject.preventDefault();
    const deltaX = eventObject.clientX - drag.startX;
    const deltaY = eventObject.clientY - drag.startY;
    drag.preview = drag.action === "resize"
      ? model.previewSelected({
          duration: drag.original[2] + deltaX / PIXELS_PER_SECOND,
        })
      : model.previewSelected({
          midi: drag.original[0] - Math.round(deltaY / PITCH_ROW_HEIGHT),
          onset: drag.original[1] + deltaX / PIXELS_PER_SECOND,
        });
    positionNote(drag.element, drag.preview);
    drag.element.textContent = noteLabel(drag.preview[0]);
    const handle = documentObject.createElement("span");
    handle.className = "phrase-editor-resize";
    handle.dataset.resize = "true";
    handle.setAttribute("aria-hidden", "true");
    drag.element.append(handle);
    renderInspector(drag.preview);
  }, { passive: false });

  windowObject.addEventListener("pointerup", () => {
    if (!drag || !model) return;
    const preview = drag.preview;
    drag = null;
    commit(() => model.updateSelected({
      duration: preview[2],
      midi: preview[0],
      onset: preview[1],
    }));
  });
  windowObject.addEventListener("pointercancel", () => {
    if (!drag) return;
    drag = null;
    render();
  });

  return Object.freeze({
    close,
    get isOpen() {
      return !modal.hidden;
    },
    open({
      editedEvents,
      originalEvents,
      performer,
      phrase,
      title: tuneTitle,
    }) {
      stopPreview();
      const normalizedOriginal = normalizeEditedPhraseEvents(originalEvents);
      const normalizedEdited = normalizeEditedPhraseEvents(editedEvents);
      model = createPhraseEditorModel({
        events: normalizedEdited ?? normalizedOriginal,
        originalEvents: normalizedOriginal,
      });
      sourceEvents = cloneEvents(normalizedOriginal);
      originalOnset = normalizedOriginal[0][1];
      opener = documentObject.activeElement;
      title.textContent = `${performer} — ${tuneTitle} · ${translate(
        "phrase.number",
        { phrase },
      )}`;
      modal.hidden = false;
      documentObject.body.classList.add("phrase-editor-open");
      render();
      documentObject.querySelector("#phrase-editor-close")?.focus();
    },
  });
}
