const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/**
 * Create the stateless DOM renderers used by the application.
 *
 * @param {object} dependencies
 * @param {Record<string, Element>} dependencies.elements
 * @param {Document} dependencies.document
 * @param {(key: string, variables?: object) => string} dependencies.translate
 * @param {(pitchClass: number) => string} dependencies.noteName
 * @param {(midi: number) => number} dependencies.pitchClass
 */
export function createAppRenderer({
  elements,
  document: documentObject,
  translate,
  noteName,
  pitchClass,
}) {
  function noteLabel(midi) {
    return `${noteName(pitchClass(midi))}${Math.floor(midi / 12) - 1}`;
  }

  function phraseNumber(reference) {
    const explicit = String(reference?.phrase ?? "").trim();
    if (explicit) return explicit;
    const phraseKey = String(reference?.phraseKey ?? "");
    const separator = phraseKey.lastIndexOf(":");
    return separator >= 0 ? phraseKey.slice(separator + 1).trim() : "";
  }

  function phraseReference(reference) {
    const phrase = phraseNumber(reference);
    return phrase ? translate("phrase.number", { phrase }) : "";
  }

  function createPianoKey(midi, color, onInput) {
    const key = documentObject.createElement("button");
    key.type = "button";
    key.className = `key ${color}`;
    key.dataset.midi = String(midi);
    key.setAttribute("aria-label", noteLabel(midi));
    if (color === "white") {
      const label = documentObject.createElement("span");
      label.textContent = noteLabel(midi);
      key.append(label);
    }
    key.addEventListener("pointerdown", (event) => {
      onInput?.(midi, key, event);
    });
    return key;
  }

  function buildPiano(layout, onInput) {
    elements.piano.replaceChildren();
    const whiteMidi = [];
    for (
      let midi = layout.startMidi;
      midi <= layout.endMidi;
      midi += 1
    ) {
      if (!BLACK_PITCH_CLASSES.has(pitchClass(midi))) {
        whiteMidi.push(midi);
      }
    }
    const whiteCount = whiteMidi.length;
    elements.piano.style.setProperty(
      "--white-key-count",
      String(whiteCount),
    );
    elements.piano.setAttribute(
      "aria-label",
      translate("piano.range", {
        chunks: layout.chunkCount,
        start: noteLabel(layout.startMidi),
        end: noteLabel(layout.endMidi),
      }),
    );

    for (const [whiteIndex, midi] of whiteMidi.entries()) {
      const key = createPianoKey(midi, "white", onInput);
      key.style.left = `${(whiteIndex * 100) / whiteCount}%`;
      if (pitchClass(midi) === 0 || pitchClass(midi) === 5) {
        key.classList.add("chunk-start");
      }
      elements.piano.append(key);
    }

    for (
      let midi = layout.startMidi;
      midi <= layout.endMidi;
      midi += 1
    ) {
      if (!BLACK_PITCH_CLASSES.has(pitchClass(midi))) continue;
      const previousWhiteIndex = whiteMidi.indexOf(midi - 1);
      if (previousWhiteIndex < 0) continue;
      const key = createPianoKey(midi, "black", onInput);
      const whiteBoundary = previousWhiteIndex + 1;
      key.style.left =
        `calc(${(whiteBoundary * 100) / whiteCount}% - ` +
        `(100% / ${whiteCount} * 0.31))`;
      elements.piano.append(key);
    }
  }

  function renderProgressDots(total, completed, current = null) {
    const fragment = documentObject.createDocumentFragment();
    for (let index = 0; index < total; index += 1) {
      const dot = documentObject.createElement("span");
      dot.className = "progress-dot";
      if (index < completed) dot.classList.add("complete");
      if (index === current) dot.classList.add("current");
      fragment.append(dot);
    }
    elements.progressDots.replaceChildren(fragment);
  }

  function renderFavoriteControl(
    button,
    { favorite, subject = "" } = {},
  ) {
    button.classList.toggle("active", Boolean(favorite));
    button.textContent = favorite ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(Boolean(favorite)));
    button.setAttribute(
      "aria-label",
      favorite
        ? translate("favorites.remove", { subject })
        : translate("favorites.addSubject", { subject }),
    );
  }

  function renderStarRating(
    element,
    { rating = 0, visible = true } = {},
  ) {
    element.hidden = !visible;
    element.setAttribute(
      "aria-label",
      rating
        ? translate("rating.current", { rating })
        : translate("rating.unrated"),
    );
    for (const button of element.querySelectorAll("[data-rating]")) {
      const value = Number(button.dataset.rating);
      button.classList.toggle("selected", value <= rating);
      button.setAttribute("aria-pressed", String(value === rating));
    }
  }

  function renderPhraseControls({
    visible,
    settings,
    locked = false,
  }) {
    elements.phraseAdjustments.hidden = !visible;
    if (!visible) return;

    elements.phraseLengthOutput.value =
      `${settings.notesMax}/${settings.fullPhraseNoteCount}`;
    elements.phraseLengthDecrease.disabled =
      locked || settings.notesMax <= 1;
    elements.phraseLengthIncrease.disabled =
      locked || settings.notesMax >= settings.fullPhraseNoteCount;
    elements.openPhraseEditor.disabled = locked;
  }

  function renderHomeState(session) {
    const hasSession = Boolean(session);
    elements.startChallenge.hidden = hasSession;
    elements.resumeChallenge.hidden = !hasSession;
    elements.newChallenge.hidden = !hasSession;
    elements.sessionStatus.hidden = !hasSession;
    if (!hasSession) {
      elements.sessionStatus.textContent = "";
      return;
    }

    if (session.phase === "training") {
      elements.sessionStatus.textContent = translate("session.training", {
        phrase: session.phraseIndex + 1,
        tone: session.toneIndex + 1,
      });
    } else if (session.phase === "transition") {
      elements.sessionStatus.textContent = translate("session.transition");
    } else {
      elements.sessionStatus.textContent = translate("session.sudden", {
        count: session.suddenQueue.length,
      });
    }
  }

  function showHomePanel(homeVisible) {
    documentObject.body.classList.toggle("home-view", homeVisible);
    elements.homePanel.hidden = !homeVisible;
    elements.favoritesPanel.hidden = homeVisible;
  }

  function renderFavorites(phrases, { onOpen }) {
    elements.favoritesList.replaceChildren();
    elements.favoritesEmpty.hidden = phrases.length > 0;
    elements.favoritesRandom.hidden = phrases.length === 0;
    elements.favoritesRandom.disabled = phrases.length === 0;
    for (const phrase of phrases) {
      const row = documentObject.createElement("article");
      row.className = "favorite-row";

      const open = documentObject.createElement("button");
      open.type = "button";
      open.className = "favorite-row-main";
      const performer = documentObject.createElement("strong");
      performer.textContent = phrase.performer;
      const title = documentObject.createElement("span");
      title.textContent = [phrase.title, phraseReference(phrase)]
        .filter(Boolean)
        .join(" · ");
      open.append(performer, title);
      open.addEventListener("click", () => onOpen(phrase.phraseKey));

      row.append(open);
      elements.favoritesList.append(row);
    }
  }

  function renderChallengeProgress(session, currentRound) {
    elements.challengeProgress.hidden = false;
    elements.progressDots.hidden = false;
    elements.reviewNavigation.hidden = true;
    elements.freeNavigation.hidden = true;
    documentObject.body.classList.toggle(
      "sudden-death-mode",
      session?.phase === "sudden-death",
    );
    if (session?.phase === "training") {
      elements.progressTitle.textContent = translate(
        "challenge.progressPhrase",
        { current: session.phraseIndex + 1 },
      );
      elements.progressDetail.textContent = translate(
        "challenge.progressTone",
        { current: session.toneIndex + 1 },
      );
      renderProgressDots(9, currentRound, currentRound);
      return;
    }
    if (session?.phase === "sudden-death") {
      const completed = session.suddenCompleted.length;
      elements.progressTitle.textContent = translate("mode.suddenDeath");
      elements.progressDetail.textContent = translate(
        "challenge.remaining",
        { count: session.suddenQueue.length },
      );
      renderProgressDots(3, completed, Math.min(completed, 2));
    }
  }

  function renderReviewProgress({ index, total }) {
    elements.challengeProgress.hidden = false;
    elements.progressDots.hidden = true;
    elements.reviewNavigation.hidden = false;
    elements.freeNavigation.hidden = true;
    elements.progressTitle.textContent = translate("mode.review");
    elements.progressDetail.textContent = total
      ? translate("review.progress", {
          current: index + 1,
          total,
        })
      : translate("review.empty");
    elements.reviewCounter.textContent = total
      ? `${index + 1}/${total}`
      : "0/0";
    elements.reviewPrevious.disabled = index <= 0;
    elements.reviewNext.disabled = !total || index >= total - 1;
  }

  function renderFreeProgress({ index, total }) {
    elements.challengeProgress.hidden = false;
    elements.progressDots.hidden = true;
    elements.reviewNavigation.hidden = true;
    elements.freeNavigation.hidden = false;
    elements.progressTitle.textContent = translate("mode.free");
    elements.progressDetail.textContent = translate("free.progress", {
      current: index + 1,
      total,
    });
    elements.freeCounter.textContent = total ? `${index + 1}/${total}` : "0/0";
    elements.freePrevious.disabled = index <= 0;
    elements.freeNext.disabled = !total || index >= total - 1;
    elements.freeRandom.disabled = !total;
  }

  function renderLickExerciseProgress({
    current,
    patternId,
  }) {
    elements.challengeProgress.hidden = false;
    elements.progressDots.hidden = true;
    elements.reviewNavigation.hidden = true;
    elements.freeNavigation.hidden = true;
    elements.progressTitle.textContent = translate(
      "lickExercise.progress",
      { current },
    );
    elements.progressDetail.textContent = patternId;
  }

  function renderRatingSession({
    count,
    distribution,
    newScopeCount,
    protocol,
  }) {
    elements.ratingSessionSummary.textContent =
      translate("rating.sessionCount", { count }) +
      (count
        ? ` · ${translate("rating.sessionDistribution", {
            one: distribution[1],
            two: distribution[2],
            three: distribution[3],
          })}`
        : "");
    elements.ratingCoverageSummary.textContent =
      translate("rating.coverage", {
        covered: protocol.covered,
        total: protocol.total,
        percent: protocol.total
          ? Math.round((protocol.covered / protocol.total) * 100)
          : 0,
      }) +
      (protocol.structuralExcluded
        ? ` · ${translate("protocol.structuralExcluded", {
            count: protocol.structuralExcluded,
          })}`
        : "") +
      (newScopeCount
        ? ` · ${translate("rating.newGlobalDecisions", {
            count: newScopeCount,
          })}`
        : "");
    elements.undoRating.disabled = !count;
  }

  function renderSource(source, {
    developerMode,
    mode,
    sourceLabel,
  }) {
    elements.sourceSummary.hidden = !source.performer;
    elements.sourceSummary.replaceChildren();
    if (source.performer) {
      const performer = documentObject.createElement("strong");
      performer.textContent = source.performer;
      const reference = phraseReference(source);
      elements.sourceSummary.append(
        performer,
        documentObject.createTextNode(
          ` — ${source.title}${reference ? ` · ${reference}` : ""}`,
        ),
      );
    }
    elements.sourceLine.hidden =
      !developerMode ||
      mode === "challenge" ||
      mode === "free" ||
      mode === "lick-exercise" ||
      mode === "review";
    const transposition = Number.isFinite(source.transposition)
      ? source.transposition === 0
        ? translate("source.originalKey")
        : translate("source.transposition", {
            value: source.transposition,
          })
      : "";
    const originalTempo = Number.isFinite(source.originalTempo)
      ? translate("source.originalTempo", {
          tempo: Math.round(source.originalTempo),
        })
      : "";
    elements.sourceDetails.textContent = translate("source.details", {
      label: sourceLabel,
      details: [transposition, originalTempo].filter(Boolean).join(" · "),
    });
    elements.copyPhraseId.textContent = translate("source.copy");
    if (source.phraseKey) {
      elements.phraseReference.hidden = false;
      elements.phraseId.textContent = source.phraseKey;
      elements.copyPhraseId.setAttribute(
        "aria-label",
        translate("source.copyId", { id: source.phraseKey }),
      );
    } else {
      elements.phraseReference.hidden = true;
      elements.phraseId.textContent = "";
      elements.copyPhraseId.removeAttribute("aria-label");
    }
    if (source.url) {
      elements.sourceLink.hidden = false;
      elements.sourceLink.href = source.url;
      elements.sourceLink.textContent =
        source.dataset ?? translate("source.view");
    } else {
      elements.sourceLink.hidden = true;
      elements.sourceLink.removeAttribute("href");
    }
  }

  function renderCompletedChallenge(
    phrases,
    { isFavorite, onToggleFavorite },
  ) {
    const fragment = documentObject.createDocumentFragment();
    for (const phrase of phrases) {
      const row = documentObject.createElement("article");
      row.className = "completed-phrase";
      const copy = documentObject.createElement("div");
      copy.className = "completed-phrase-copy";
      const performer = documentObject.createElement("strong");
      performer.textContent = phrase.performer;
      const title = documentObject.createElement("span");
      title.textContent = [phrase.title, phraseReference(phrase)]
        .filter(Boolean)
        .join(" · ");
      copy.append(performer, title);

      const favorite = documentObject.createElement("button");
      favorite.type = "button";
      favorite.className = "completed-phrase-favorite";
      const subject = [
        phrase.performer,
        phrase.title,
        phraseReference(phrase),
      ].filter(Boolean).join(", ");
      const updateFavorite = () =>
        renderFavoriteControl(favorite, {
          favorite: isFavorite(phrase.phraseKey),
          subject,
        });
      updateFavorite();
      favorite.addEventListener("click", () => {
        onToggleFavorite(phrase.phraseKey);
        updateFavorite();
      });

      row.append(copy, favorite);
      fragment.append(row);
    }
    elements.completedPhrases.replaceChildren(fragment);
  }

  return Object.freeze({
    buildPiano,
    createPianoKey,
    noteLabel,
    renderChallengeProgress,
    renderCompletedChallenge,
    renderFavoriteControl,
    renderFavorites,
    renderFreeProgress,
    renderHomeState,
    renderLickExerciseProgress,
    renderPhraseControls,
    renderProgressDots,
    renderRatingSession,
    renderReviewProgress,
    renderSource,
    renderStarRating,
    showHomePanel,
  });
}
