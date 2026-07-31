import {
  pitchShiftAudioBuffer,
  sliceAudioBuffer,
} from "./audio.js";
import {
  recordingsAtPhrase,
} from "./recording.js";

export const ORIGINAL_TAIL_SECONDS = 0.25;

export function createOriginalPlayer({
  audioRuntime,
  baseUrl = globalThis.document?.baseURI,
  documentObject = globalThis.document,
  elements,
  fetchImpl = (...args) => globalThis.fetch(...args),
  getRecordingValidations = () => undefined,
  onBeforePlay = () => {},
  onDisableInput = () => {},
  onRestoreInput = () => {},
  translate = (key) => key,
  windowObject = globalThis.window,
} = {}) {
  const decodedAudioBuffers = new Map();
  let currentSource = null;
  let isPlaying = false;
  let playbackTimer = null;
  let playbackToken = 0;
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

  function feedback(message, className = "feedback") {
    elements.feedback.className = className;
    elements.feedback.textContent = message;
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
    playbackToken += 1;
    if (playbackTimer !== null) {
      windowObject.clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    if (closeModal) {
      close({ restoreFocus, restoreInput });
    }
    setPlaying(false);
  }

  function loadLocalAudio(path) {
    if (!decodedAudioBuffers.has(path)) {
      const loading = fetchImpl(new URL(path, baseUrl))
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              translate("error.recordingUnavailable", {
                status: response.status,
              }),
            );
          }
          return response.arrayBuffer();
        })
        .then((bytes) =>
          audioRuntime.getAudioContext().decodeAudioData(bytes)
        )
        .catch((error) => {
          decodedAudioBuffers.delete(path);
          throw error;
        });
      decodedAudioBuffers.set(path, loading);
    }
    return decodedAudioBuffers.get(path);
  }

  async function playLocal() {
    const source = currentSource;
    if (!source?.audioFile) return;

    onBeforePlay();
    const token = playbackToken;
    setPlaying(true);
    onDisableInput();
    feedback(translate("audio.loadingRecording"));

    try {
      const context = audioRuntime.getAudioContext();
      const recording = await loadLocalAudio(source.audioFile);
      if (token !== playbackToken) return;

      const phraseStart = source.audioOffset + source.onsetStart;
      const phraseEnd = source.audioOffset + source.onsetEnd;
      const clipStart = Math.max(0, phraseStart);
      const clipEnd = Math.min(
        recording.duration,
        phraseEnd + ORIGINAL_TAIL_SECONDS,
      );
      let clip = sliceAudioBuffer(
        context,
        recording,
        clipStart,
        clipEnd,
      );
      const semitones = elements.transposeOriginal.checked
        ? source.transposition
        : 0;

      if (semitones) {
        feedback(translate("audio.transposingRecording"));
        await new Promise((resolve) =>
          windowObject.requestAnimationFrame(resolve)
        );
        if (token !== playbackToken) return;
        clip = pitchShiftAudioBuffer(context, clip, semitones);
      }
      if (token !== playbackToken) return;

      const recordingSource = context.createBufferSource();
      const gain = context.createGain();
      recordingSource.buffer = clip;
      gain.gain.value = 0.82;
      recordingSource
        .connect(gain)
        .connect(context.destination);
      audioRuntime.trackSource(recordingSource);
      recordingSource.addEventListener("ended", () => {
        if (token !== playbackToken || !isPlaying) return;
        if (playbackTimer !== null) {
          windowObject.clearTimeout(playbackTimer);
          playbackTimer = null;
        }
        setPlaying(false);
        onRestoreInput();
      });

      feedback(translate("audio.recording", {
        transposition: semitones,
      }));
      recordingSource.start();
      playbackTimer = windowObject.setTimeout(() => {
        playbackTimer = null;
        setPlaying(false);
        onRestoreInput();
      }, clip.duration * 1000 + 100);
    } catch {
      if (token !== playbackToken) return;
      setPlaying(false);
      onRestoreInput(translate("audio.readError"));
      elements.feedback.className = "feedback error";
    }
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
    elements.recordingTitle.textContent =
      `${currentSource.performer} — ${currentSource.title}`;
    elements.recordingModal.hidden = false;
    elements.recordingPlayer.src = choice.embedUrl;
    seekToExactStart(choice);
    elements.closeRecording.focus();
  }

  function toggle() {
    if (!currentSource) return;
    if (isPlaying) {
      if (!elements.recordingModal.hidden) {
        close();
      } else {
        onBeforePlay();
        onRestoreInput(translate("audio.originalStopped"));
      }
      return;
    }
    if (currentSource.audioFile) {
      void playLocal();
    } else {
      openRecording();
    }
  }

  function renderSource(source) {
    currentSource = source ?? null;
    const hasLocalAudio = Boolean(source?.audioFile);
    const choices = recordingsAtPhrase(
      source,
      getRecordingValidations(),
    );
    const canPlay = hasLocalAudio || choices.length > 0;

    elements.playOriginal.hidden = !canPlay;
    elements.playOriginal.disabled = !canPlay;
    elements.transposeOriginalControl.hidden = !hasLocalAudio;
    elements.transposeOriginal.disabled = !hasLocalAudio;
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
