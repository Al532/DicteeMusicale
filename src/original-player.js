import {
  pitchShiftAudioBuffer,
  sliceAudioBuffer,
} from "./audio.js";
import {
  recordingSearchUrl,
  recordingUrlAtPhrase,
  recordingsAtPhrase,
} from "./recording.js";

export const ORIGINAL_TAIL_SECONDS = 0.25;

export function createOriginalPlayer({
  audioRuntime,
  baseUrl = globalThis.document?.baseURI,
  documentObject = globalThis.document,
  elements,
  fetchImpl = (...args) => globalThis.fetch(...args),
  onBeforePlay = () => {},
  onDisableInput = () => {},
  onRestoreInput = () => {},
  translate = (key) => key,
  windowObject = globalThis.window,
} = {}) {
  const decodedAudioBuffers = new Map();
  let activeChoices = [];
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

  function showChoice(index) {
    const choice = activeChoices[index];
    if (!choice) return;
    elements.recordingVersion.value = String(index);
    elements.recordingPlayer.src = choice.embedUrl;
    elements.recordingExternalLink.href = choice.watchUrl;
  }

  function close({
    restoreFocus = true,
    restoreInput = true,
  } = {}) {
    if (elements.recordingModal.hidden) return;
    elements.recordingPlayer.removeAttribute("src");
    elements.recordingModal.hidden = true;
    activeChoices = [];
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
    const choices = recordingsAtPhrase(currentSource);
    if (!choices.length) return;

    onBeforePlay();
    onDisableInput();
    setPlaying(true);
    returnFocus = documentObject.activeElement;
    activeChoices = choices;
    elements.recordingTitle.textContent =
      `${currentSource.performer} — ${currentSource.title}`;
    elements.recordingVersion.replaceChildren(
      ...choices.map((_, index) => {
        const option = documentObject.createElement("option");
        option.value = String(index);
        option.textContent = translate("recording.versionNumber", {
          current: index + 1,
          total: choices.length,
        });
        return option;
      }),
    );
    elements.recordingVersionControl.hidden = choices.length <= 1;
    elements.recordingModal.hidden = false;
    showChoice(0);
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
    const choices = recordingsAtPhrase(source);
    const recordingUrl = recordingUrlAtPhrase(source);
    const searchUrl = recordingUrl
      ? null
      : recordingSearchUrl(source);
    const canPlay = hasLocalAudio || choices.length > 0;

    elements.playOriginal.hidden = !canPlay;
    elements.playOriginal.disabled = !canPlay;
    elements.transposeOriginalControl.hidden = !hasLocalAudio;
    elements.transposeOriginal.disabled = !hasLocalAudio;
    elements.originalControls.hidden =
      !canPlay && !recordingUrl && !searchUrl;
    if (recordingUrl) {
      elements.audioSourceLink.hidden = false;
      elements.audioSourceLink.href = recordingUrl;
      elements.audioSourceLink.textContent = translate(
        "source.youtubeRecording",
      );
    } else if (searchUrl) {
      elements.audioSourceLink.hidden = false;
      elements.audioSourceLink.href = searchUrl;
      elements.audioSourceLink.textContent = translate(
        "source.youtubeSearch",
      );
    } else {
      elements.audioSourceLink.hidden = true;
      elements.audioSourceLink.removeAttribute("href");
    }
  }

  return Object.freeze({
    close,
    isPlaying: () => isPlaying,
    renderSource,
    showChoice,
    stop,
    toggle,
  });
}
