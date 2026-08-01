import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";
import {
  RECORDING_EXACT_SEEK_REVALIDATIONS,
} from "../data/recording-revalidations.js";
import {
  YOUTUBE_SEARCH_RECORDINGS,
} from "../data/youtube-search-recordings.js";
import {
  WJAZZD_SOLO_INDEX,
} from "./corpus-loader.js";
import {
  mergeRecordingValidations,
  normalizeRecordingValidations,
  recordingChoiceAtPhrase,
  youtubeIdFromValue,
} from "./recording.js";
import { createYouTubeExactPlayer } from "./youtube-player.js";

export function exactSeekRevalidationFor(soloId, validation) {
  const queued = RECORDING_EXACT_SEEK_REVALIDATIONS[soloId];
  if (
    !queued ||
    validation?.status !== "verified" ||
    validation.youtubeId !== queued.youtubeId ||
    validation.updatedAt !== queued.validationUpdatedAt
  ) {
    return null;
  }
  return queued;
}

function compareSolos(left, right) {
  return (
    left.performer.localeCompare(right.performer) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id, undefined, { numeric: true })
  );
}

function roundedOffset(value) {
  return Math.round(Number(value) * 10_000) / 10_000;
}

export function createRecordingWorkshop({
  documentObject = globalThis.document,
  elements,
  getReviewPhraseKeys = () => [],
  initialLocalValidations = {},
  loadPhrasePreview = async () => {
    throw new Error("Phrase preview loader unavailable");
  },
  onChange = () => {},
  onPlayPhrase = async () => {},
  onStopPhrase = () => {},
  translate = (key) => key,
  windowObject = globalThis.window,
} = {}) {
  let localValidations = normalizeRecordingValidations(
    initialLocalValidations,
  );
  let previewVersion = 0;
  let previewSignature = null;
  let reviewPhraseKeySet = new Set();
  const youtubePlayer = createYouTubeExactPlayer({
    documentObject,
    iframeElement: elements.recordingWorkshopPlayer,
    windowObject,
  });

  function validations() {
    return mergeRecordingValidations(
      RECORDING_VALIDATIONS,
      localValidations,
    );
  }

  function selectedSolo() {
    return WJAZZD_SOLO_INDEX.find(
      ({ id }) => id === elements.recordingWorkshopSolo.value,
    );
  }

  function reviewPhrases(solo) {
    return (solo?.phrases ?? []).filter((tuple) =>
      reviewPhraseKeySet.has(`${solo.id}:${String(tuple[0])}`)
    );
  }

  function reviewSolos() {
    return WJAZZD_SOLO_INDEX.filter(
      (solo) => reviewPhrases(solo).length > 0,
    );
  }

  function selectedValidation() {
    return validations()[selectedSolo()?.id] ?? null;
  }

  function revalidationFor(soloId, record = validations()[soloId]) {
    return exactSeekRevalidationFor(soloId, record);
  }

  function selectedRevalidation() {
    const solo = selectedSolo();
    return solo ? revalidationFor(solo.id) : null;
  }

  function verificationSignature(youtubeId, offset, phrase) {
    return `${youtubeId}:${roundedOffset(offset)}:${phrase}`;
  }

  function requireNewPreview() {
    previewSignature = null;
    elements.verifyRecordingWorkshop.disabled = true;
  }

  function candidateEntries(soloId) {
    return (YOUTUBE_SEARCH_RECORDINGS[soloId] ?? [])
      .map(([youtubeId, offset]) => ({
        youtubeId: youtubeIdFromValue(youtubeId),
        offset: Number(offset),
      }))
      .filter(
        ({ youtubeId, offset }) =>
          youtubeId && Number.isFinite(offset),
      );
  }

  function stopPreview({ clearStatus = true } = {}) {
    previewVersion += 1;
    onStopPhrase();
    youtubePlayer.stop();
    requireNewPreview();
    elements.recordingWorkshopPreview.hidden = true;
    if (clearStatus) {
      elements.recordingWorkshopMessage.textContent = "";
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message";
    }
  }

  function pausePreview() {
    if (elements.recordingWorkshopPreview.hidden) return;
    youtubePlayer.pause();
  }

  function renderProgress() {
    const solos = reviewSolos();
    const visibleSoloIds = new Set(solos.map(({ id }) => id));
    const records = Object.entries(validations())
      .filter(([soloId]) => visibleSoloIds.has(soloId))
      .map(([soloId, record]) => ({ record, soloId }));
    const verified = records.filter(
      ({ record, soloId }) =>
        record.status === "verified" &&
        !revalidationFor(soloId, record),
    ).length;
    const unavailable = records.filter(
      ({ record }) => record.status === "unavailable",
    ).length;
    const wrong = records.filter(
      ({ record }) => record.status === "wrong-version",
    ).length;
    const revalidate = records.filter(({ record, soloId }) =>
      revalidationFor(soloId, record)
    ).length;
    elements.recordingWorkshopProgress.textContent = translate(
      "recordingWorkshop.progress",
      {
        revalidate,
        total: solos.length,
        unavailable,
        verified,
        wrong,
      },
    );
  }

  function statusText(soloId, record) {
    if (revalidationFor(soloId, record)) {
      return translate("recordingWorkshop.status.revalidate");
    }
    return translate(
      `recordingWorkshop.status.${record?.status ?? "pending"}`,
    );
  }

  function renderCurrentStatus() {
    const solo = selectedSolo();
    const record = selectedValidation();
    const revalidation = revalidationFor(solo?.id, record);
    elements.recordingWorkshopStatus.textContent = statusText(
      solo?.id,
      record,
    );
    elements.recordingWorkshopStatus.dataset.status =
      revalidation ? "revalidate" : record?.status ?? "pending";
  }

  function updateSoloOption() {
    const solo = selectedSolo();
    if (!solo) return;
    const option = [...elements.recordingWorkshopSolo.options].find(
      ({ value }) => value === solo.id,
    );
    if (!option) return;
    const record = validations()[solo.id];
    const mark =
      revalidationFor(solo.id, record)
        ? "↻"
        : record?.status === "verified"
          ? "✓"
          : record?.status === "unavailable"
            ? "—"
            : record?.status === "wrong-version"
              ? "×"
              : "·";
    option.textContent =
      `${mark} ${solo.performer} — ${solo.title} (${solo.id.split("-").at(-1)})`;
  }

  function persist(record) {
    const solo = selectedSolo();
    if (!solo) return;
    localValidations = {
      ...localValidations,
      [solo.id]: record,
    };
    localValidations = normalizeRecordingValidations(localValidations);
    onChange(structuredClone(localValidations));
    renderCurrentStatus();
    updateSoloOption();
    renderProgress();
  }

  function advanceToNextPendingSolo() {
    const soloIds = [...elements.recordingWorkshopSolo.options].map(
      ({ value }) => value,
    );
    const currentIndex = soloIds.indexOf(
      elements.recordingWorkshopSolo.value,
    );
    const merged = validations();
    for (const criterion of [
      (soloId) => Boolean(revalidationFor(soloId, merged[soloId])),
      (soloId) => !merged[soloId],
    ]) {
      for (let distance = 1; distance <= soloIds.length; distance += 1) {
        const soloId = soloIds[
          (currentIndex + distance + soloIds.length) % soloIds.length
        ];
        if (criterion(soloId)) {
          elements.recordingWorkshopSolo.value = soloId;
          selectSolo();
          return true;
        }
      }
    }
    return false;
  }

  function finishDecision() {
    if (!advanceToNextPendingSolo()) {
      stopPreview({ clearStatus: false });
    }
  }

  function renderCandidates({ preferStored = true } = {}) {
    const solo = selectedSolo();
    if (!solo) return;
    const record = selectedValidation();
    const rejected = new Set(record?.rejectedYoutubeIds ?? []);
    const candidates = candidateEntries(solo.id);
    elements.recordingWorkshopCandidate.replaceChildren(
      ...candidates.map((candidate, index) => {
        const option = documentObject.createElement("option");
        option.value = String(index);
        option.textContent = translate(
          rejected.has(candidate.youtubeId)
            ? "recordingWorkshop.candidateRejected"
            : "recordingWorkshop.candidateNumber",
          {
            current: index + 1,
            id: candidate.youtubeId,
          },
        );
        return option;
      }),
    );
    const manual = documentObject.createElement("option");
    manual.value = "manual";
    manual.textContent = translate("recordingWorkshop.manualCandidate");
    elements.recordingWorkshopCandidate.append(manual);

    let candidateIndex = -1;
    if (preferStored && record?.status === "verified") {
      candidateIndex = candidates.findIndex(
        ({ youtubeId }) => youtubeId === record.youtubeId,
      );
    }
    if (candidateIndex < 0) {
      candidateIndex = candidates.findIndex(
        ({ youtubeId }) => !rejected.has(youtubeId),
      );
    }

    const revalidation = revalidationFor(solo.id, record);
    if (revalidation) {
      candidateIndex = candidates.findIndex(
        ({ youtubeId }) => youtubeId === revalidation.youtubeId,
      );
      elements.recordingWorkshopYoutube.value = revalidation.youtubeId;
      elements.recordingWorkshopOffset.value = String(
        revalidation.referenceOffset,
      );
      elements.recordingWorkshopCandidate.value =
        candidateIndex >= 0 ? String(candidateIndex) : "manual";
      return;
    }

    if (preferStored && record?.status === "verified") {
      elements.recordingWorkshopYoutube.value = record.youtubeId;
      elements.recordingWorkshopOffset.value = String(record.offset);
      elements.recordingWorkshopCandidate.value =
        candidateIndex >= 0 &&
        candidates[candidateIndex]?.youtubeId === record.youtubeId
          ? String(candidateIndex)
          : "manual";
      return;
    }

    if (candidateIndex >= 0) {
      elements.recordingWorkshopCandidate.value = String(candidateIndex);
      elements.recordingWorkshopYoutube.value =
        candidates[candidateIndex].youtubeId;
      elements.recordingWorkshopOffset.value = String(
        candidates[candidateIndex].offset,
      );
    } else {
      elements.recordingWorkshopCandidate.value = "manual";
      elements.recordingWorkshopYoutube.value = "";
      elements.recordingWorkshopOffset.value = "0";
    }
  }

  function renderPhrases() {
    const solo = selectedSolo();
    elements.recordingWorkshopPhrase.replaceChildren(
      ...reviewPhrases(solo).map((tuple) => {
        const phrase = String(tuple[0]);
        const option = documentObject.createElement("option");
        option.value = phrase;
        option.textContent = translate("recordingWorkshop.phraseNumber", {
          phrase,
        });
        return option;
      }),
    );
  }

  function selectSolo() {
    stopPreview();
    renderCandidates();
    renderPhrases();
    renderCurrentStatus();
    const revalidation = selectedRevalidation();
    if (revalidation) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.revalidationPrompt",
        { offset: revalidation.referenceOffset },
      );
    }
  }

  function selectCandidate() {
    stopPreview();
    const solo = selectedSolo();
    const index = Number(elements.recordingWorkshopCandidate.value);
    const candidate = candidateEntries(solo?.id)[index];
    if (!candidate) return;
    elements.recordingWorkshopYoutube.value = candidate.youtubeId;
    elements.recordingWorkshopOffset.value = String(candidate.offset);
  }

  function useManualCandidate() {
    const selected = elements.recordingWorkshopCandidate.value;
    const candidate = candidateEntries(selectedSolo()?.id)[Number(selected)];
    if (
      !candidate ||
      candidate.youtubeId !==
        youtubeIdFromValue(elements.recordingWorkshopYoutube.value)
    ) {
      elements.recordingWorkshopCandidate.value = "manual";
    }
    stopPreview();
  }

  function selectedPhraseKey() {
    const solo = selectedSolo();
    const phrase = elements.recordingWorkshopPhrase.value;
    return solo && phrase ? `${solo.id}:${phrase}` : null;
  }

  async function preview() {
    const solo = selectedSolo();
    const youtubeId = youtubeIdFromValue(
      elements.recordingWorkshopYoutube.value,
    );
    const offset = Number(elements.recordingWorkshopOffset.value);
    const phrase = elements.recordingWorkshopPhrase.value;
    if (!solo || !youtubeId || !Number.isFinite(offset) || !phrase) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.invalid",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      return;
    }

    onStopPhrase();
    pausePreview();
    requireNewPreview();
    const version = ++previewVersion;
    elements.recordingWorkshopMessage.textContent = translate(
      "recordingWorkshop.loading",
    );
    elements.recordingWorkshopMessage.className =
      "recording-workshop-message";
    try {
      const generated = await loadPhrasePreview(`${solo.id}:${phrase}`);
      if (version !== previewVersion) return;
      const source = generated?.meta?.source;
      const choice = recordingChoiceAtPhrase(youtubeId, offset, source);
      if (!choice) throw new Error("Invalid recording");
      elements.recordingWorkshopPreview.hidden = false;
      const synchronization = await youtubePlayer.load(choice);
      if (version !== previewVersion || !synchronization) return;
      previewSignature = verificationSignature(
        youtubeId,
        offset,
        phrase,
      );
      elements.verifyRecordingWorkshop.disabled = false;
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.previewReady",
        {
          actual: synchronization.actualStart.toFixed(2),
          phrase,
          start: choice.exactStart.toFixed(2),
        },
      );
    } catch {
      if (version !== previewVersion) return;
      stopPreview({ clearStatus: false });
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.loadError",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
    }
  }

  async function playPhrase() {
    const phraseKey = selectedPhraseKey();
    if (!phraseKey) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.loadError",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      return;
    }

    onStopPhrase();
    pausePreview();
    const version = ++previewVersion;
    elements.recordingWorkshopMessage.textContent = translate(
      "recordingWorkshop.loading",
    );
    elements.recordingWorkshopMessage.className =
      "recording-workshop-message";
    try {
      const generated = await loadPhrasePreview(phraseKey);
      if (version !== previewVersion) return;
      const played = await onPlayPhrase(generated);
      if (version !== previewVersion || played === false) return;
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.phrasePlaying",
      );
    } catch {
      if (version !== previewVersion) return;
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.loadError",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
    }
  }

  function adjustOffset(delta) {
    const current = Number(elements.recordingWorkshopOffset.value);
    const next = roundedOffset(
      (Number.isFinite(current) ? current : 0) + Number(delta),
    );
    elements.recordingWorkshopOffset.value = String(next);
    if (!elements.recordingWorkshopPreview.hidden) void preview();
  }

  function currentRejectedIds() {
    return selectedValidation()?.rejectedYoutubeIds ?? [];
  }

  function verify() {
    const youtubeId = youtubeIdFromValue(
      elements.recordingWorkshopYoutube.value,
    );
    const offset = roundedOffset(elements.recordingWorkshopOffset.value);
    if (!youtubeId || !Number.isFinite(offset)) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.invalid",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      return;
    }
    if (
      previewSignature !== verificationSignature(
        youtubeId,
        offset,
        elements.recordingWorkshopPhrase.value,
      )
    ) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.previewRequired",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      return;
    }
    persist({
      status: "verified",
      youtubeId,
      offset,
      rejectedYoutubeIds: currentRejectedIds(),
      updatedAt: new Date().toISOString(),
    });
    finishDecision();
    elements.recordingWorkshopMessage.textContent = translate(
      "recordingWorkshop.saved",
    );
    elements.recordingWorkshopMessage.className =
      "recording-workshop-message success";
  }

  function reject() {
    const youtubeId = youtubeIdFromValue(
      elements.recordingWorkshopYoutube.value,
    );
    if (!youtubeId) {
      elements.recordingWorkshopMessage.textContent = translate(
        "recordingWorkshop.invalid",
      );
      elements.recordingWorkshopMessage.className =
        "recording-workshop-message error";
      return;
    }
    persist({
      status: "wrong-version",
      rejectedYoutubeIds: [
        ...new Set([...currentRejectedIds(), youtubeId]),
      ],
      updatedAt: new Date().toISOString(),
    });
    finishDecision();
    elements.recordingWorkshopMessage.textContent = translate(
      "recordingWorkshop.rejected",
    );
    elements.recordingWorkshopMessage.className =
      "recording-workshop-message";
  }

  function markUnavailable() {
    persist({
      status: "unavailable",
      rejectedYoutubeIds: currentRejectedIds(),
      updatedAt: new Date().toISOString(),
    });
    finishDecision();
    elements.recordingWorkshopMessage.textContent = translate(
      "recordingWorkshop.unavailableSaved",
    );
    elements.recordingWorkshopMessage.className =
      "recording-workshop-message";
  }

  function initializeOptions() {
    const previousSoloId = elements.recordingWorkshopSolo.value;
    reviewPhraseKeySet = new Set(getReviewPhraseKeys());
    const sorted = reviewSolos().sort(compareSolos);
    elements.recordingWorkshopSolo.replaceChildren(
      ...sorted.map((solo) => {
        const option = documentObject.createElement("option");
        option.value = solo.id;
        return option;
      }),
    );
    for (const solo of sorted) {
      elements.recordingWorkshopSolo.value = solo.id;
      updateSoloOption();
    }
    const reviewed = new Set(Object.keys(validations()));
    const initial =
      sorted.find(({ id }) => id === previousSoloId) ??
      sorted.find(({ id }) => revalidationFor(id)) ??
      sorted.find(
        ({ id }) => !reviewed.has(id) && candidateEntries(id).length,
      ) ?? sorted.find(({ id }) => !reviewed.has(id)) ?? sorted[0];
    elements.recordingWorkshopSolo.value = initial?.id ?? "";
  }

  function open() {
    void youtubePlayer.prepare().catch(() => {});
    initializeOptions();
    renderProgress();
    selectSolo();
  }

  return Object.freeze({
    adjustOffset,
    markUnavailable,
    open,
    playPhrase,
    preview,
    reject,
    selectCandidate,
    selectedPhraseKey,
    selectSolo,
    stopPreview,
    useManualCandidate,
    verify,
  });
}
