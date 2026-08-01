import {
  recordingsAtPhrase,
} from "./recording.js";
import { createYouTubeExactPlayer } from "./youtube-player.js";

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
  const youtubePlayer = createYouTubeExactPlayer({
    documentObject,
    iframeElement: elements.recordingPlayer,
    windowObject,
  });

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

  function close({
    restoreFocus = true,
    restoreInput = true,
  } = {}) {
    if (elements.recordingModal.hidden) return;
    youtubePlayer.stop();
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
    void youtubePlayer.load(choice).catch(() => {
      if (!elements.recordingModal.hidden) close();
    });
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
    if (canPlay) void youtubePlayer.prepare().catch(() => {});
  }

  return Object.freeze({
    close,
    isPlaying: () => isPlaying,
    renderSource,
    stop,
    toggle,
  });
}
