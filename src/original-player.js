import {
  recordingsAtPhrase,
} from "./recording.js";

export function createOriginalPlayer({
  documentObject = globalThis.document,
  elements,
  getRecordingValidations = () => undefined,
  onBeforePlay = () => {},
  onDisableInput = () => {},
  onRestoreInput = () => {},
  translate = (key) => key,
  windowObject = globalThis.window,
} = {}) {
  let currentSource = null;
  let isPlaying = false;
  let returnFocus = null;

  function setPlaying(playing) {
    isPlaying = playing;
    elements.playOriginal.textContent = translate(
      playing ? "audio.stop" : "audio.listenOriginal",
    );
    elements.playOriginal.setAttribute(
      "aria-pressed",
      String(playing),
    );
  }

  function seekToExactStart(choice) {
    if (!Number.isFinite(choice?.exactStart)) return;
    windowObject.setTimeout(() => {
      elements.recordingPlayer.contentWindow?.postMessage?.(
        JSON.stringify({
          event: "command",
          func: "seekTo",
          args: [choice.exactStart, true],
        }),
        "https://www.youtube-nocookie.com",
      );
    }, 100);
  }

  function close({
    restoreFocus = true,
    restoreInput = true,
  } = {}) {
    if (elements.recordingModal.hidden) return;
    elements.recordingPlayer.removeAttribute("src");
    elements.recordingModal.hidden = true;
    setPlaying(false);
    if (restoreInput) onRestoreInput();
    if (restoreFocus) returnFocus?.focus?.();
    returnFocus = null;
  }

  function stop({
    closeModal = true,
    restoreFocus = false,
    restoreInput = false,
  } = {}) {
    if (closeModal) {
      close({ restoreFocus, restoreInput });
    }
    setPlaying(false);
  }

  function openRecording() {
    const choices = recordingsAtPhrase(
      currentSource,
      getRecordingValidations(),
    );
    if (!choices.length) return;
    const [choice] = choices;

    onBeforePlay();
    onDisableInput();
    setPlaying(true);
    returnFocus = documentObject.activeElement;
    const phraseReference = currentSource.phrase
      ? ` · ${translate("phrase.number", {
          phrase: currentSource.phrase,
        })}`
      : "";
    elements.recordingTitle.textContent =
      `${currentSource.performer} — ${currentSource.title}${phraseReference}`;
    elements.recordingModal.hidden = false;
    elements.recordingPlayer.src = choice.embedUrl;
    seekToExactStart(choice);
    elements.closeRecording.focus();
  }

  function toggle() {
    if (!currentSource) return;
    if (isPlaying) {
      close();
      return;
    }
    openRecording();
  }

  function renderSource(source) {
    currentSource = source ?? null;
    const canPlay = recordingsAtPhrase(
      source,
      getRecordingValidations(),
    ).length > 0;

    elements.playOriginal.hidden = !canPlay;
    elements.playOriginal.disabled = !canPlay;
    elements.originalControls.hidden = !canPlay;
  }

  return Object.freeze({
    close,
    isPlaying: () => isPlaying,
    renderSource,
    stop,
    toggle,
  });
}
