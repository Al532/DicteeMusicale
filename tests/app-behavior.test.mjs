import test from "node:test";
import assert from "node:assert/strict";
import {
  bootApp,
  enterExerciseNotes,
  finishPlayback,
} from "./helpers/app-dom-harness.mjs";
import { formatVideoTimestamp } from "../src/recording.js";

const SETTINGS_KEY = "dictee-musicale.settings.v1";
const RATINGS_KEY = "dictee-musicale.ratings.v1";
const PHRASE_SETTINGS_KEY =
  "dictee-musicale.phrase-settings.v1";
const RECORDING_VALIDATIONS_KEY =
  "dictee-musicale.recording-validations.v1";

test("les parcours principaux exécutent réellement app.js dans le DOM", async (t) => {
  await t.test("démarrage, migration, accueil et navigation", async () => {
    const app = await bootApp({
      storage: {
        [SETTINGS_KEY]: {
          parkerSpeed: 75,
          randomLength: 12,
          selectedPerformers: ["Charlie Parker"],
        },
        [PHRASE_SETTINGS_KEY]: {
          "wjazzd-v2.1-55:3": {
            notesMax: 8,
            ignoredShortestNotes: 1,
          },
          "ancienne-phrase:999": {
            notesMax: 4,
            ignoredShortestNotes: 0,
          },
        },
      },
    });
    try {
      assert.equal(app.document.body.classList.contains("home-view"), true);
      assert.equal(app.element("#home-panel").hidden, false);
      assert.equal(app.element("#favorites-panel").hidden, true);
      assert.equal(app.element("#game-speed").value, "75");
      assert.deepEqual(app.storageJson(SETTINGS_KEY), {
        realSpeed: 75,
        developerMode: false,
      });
      assert.deepEqual(app.serviceWorkerCalls, ["./sw.js"]);
      assert.equal(
        app.fetchCalls.some((url) =>
          url.includes("/data/wjazzd-blocks/")
        ),
        false,
      );
      assert.equal(app.element("#session-status").hidden, true);

      await app.click("#open-favorites");
      assert.equal(app.element("#home-panel").hidden, true);
      assert.equal(app.element("#favorites-panel").hidden, false);
      await app.click("#close-favorites");
      assert.equal(app.element("#home-panel").hidden, false);

      await app.change("#developer-mode", undefined, { checked: true });
      assert.equal(
        app.element(".developer-home-actions").hidden,
        false,
      );
      assert.equal(
        app.storageJson(SETTINGS_KEY).developerMode,
        true,
      );

      await app.click("#open-lick-explorer");
      await app.waitFor(
        () => app.snapshot().lickExplorer,
        "explorateur de licks initialisé",
      );
      assert.equal(app.element("#home-panel").hidden, true);
      assert.equal(app.element("#lick-explorer-panel").hidden, false);
      assert.equal(app.snapshot().lickExplorer.index, 0);
      assert.equal(app.snapshot().lickExplorer.total, 58);
      assert.equal(app.snapshot().lickExplorer.patternId, "P01");
      assert.equal(app.snapshot().lickExplorer.harmonicFunction, "I");
      assert.equal(app.snapshot().lickExplorer.startDegree, "2");
      assert.equal(app.snapshot().lickExplorer.rhythmMode, "synthetic");
      await app.click("#lick-explorer-next");
      assert.equal(app.snapshot().lickExplorer.index, 1);
      await app.click("#lick-explorer-previous");
      assert.equal(app.snapshot().lickExplorer.index, 0);
      await app.click("#close-lick-explorer");
      assert.equal(app.element("#home-panel").hidden, false);
      assert.equal(app.element("#lick-explorer-panel").hidden, true);
    } finally {
      app.close();
    }

    const restarted = await bootApp({
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 75,
          developerMode: true,
          transposeOriginal: true,
        },
      },
    });
    try {
      assert.equal(restarted.element("#game-speed").value, "75");
      assert.equal(restarted.element("#developer-mode").checked, true);
      assert.equal(restarted.document.querySelector("#transpose-original"), null);
      assert.deepEqual(restarted.storageJson(SETTINGS_KEY), {
        realSpeed: 75,
        developerMode: true,
      });
    } finally {
      restarted.close();
    }
  });

  await t.test("un chargement ancien ne remplace jamais le dernier lancement", async () => {
    const firstKey = "wjazzd-v2.1-1:1";
    const secondKey = "wjazzd-v2.1-456:1";
    const app = await bootApp({
      deferCorpus: true,
      favorites: [firstKey, secondKey],
    });
    try {
      await app.click("#open-favorites");
      const favorites = [
        ...app.document.querySelectorAll(".favorite-row-main"),
      ];
      assert.equal(favorites.length, 2);

      favorites[0].click();
      await app.flush();
      favorites[1].click();
      await app.flush();
      assert.equal(app.pendingCorpusFetches.length, 2);

      await app.resolveCorpusFetch(1);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.phraseKey === secondKey,
        "dernier lancement résolu",
      );
      await app.resolveCorpusFetch(0);
      await app.flush(32);
      assert.equal(
        app.snapshot().exercise.source.phraseKey,
        secondKey,
      );
      assert.equal(app.snapshot().freePhraseKey, secondKey);
    } finally {
      app.close();
    }
  });

  await t.test("le Lick trainer enchaîne des tirages aléatoires sans fin", async () => {
    const app = await bootApp();
    try {
      const trainerButton = app.element("#start-lick-exercise");
      assert.equal(trainerButton.isConnected, true);
      assert.equal(trainerButton.closest("[hidden]"), null);
      assert.equal(trainerButton.textContent.trim(), "Lick trainer");

      await app.click("#start-lick-exercise");
      await app.waitFor(
        () => app.snapshot().exercise?.source?.kind === "dtl-lick-exercise",
        "premier exercice de lick",
      );

      const first = app.snapshot();
      assert.equal(first.developerMode, false);
      assert.equal(first.currentMode, "lick-exercise");
      assert.equal(
        app.document.body.classList.contains("lick-exercise-mode"),
        true,
      );
      assert.equal(first.lickExercise.index, 0);
      assert.equal(first.lickExercise.number, 1);
      assert.equal(first.lickExercise.total, 58);
      assert.equal(
        new Set(first.lickExercise.deckIds).size,
        first.lickExercise.total,
      );
      assert.equal(
        first.exercise.source.id,
        first.lickExercise.currentId,
      );
      assert.equal(first.lickExercise.toneState.transpositionsUsed.length, 1);
      assert.equal(
        first.lickExercise.toneState.lastTransposition,
        first.exercise.transposition,
      );
      assert.equal(app.element("#next-exercise").hidden, true);
      assert.equal(app.element("#next-exercise").disabled, true);
      assert.equal(app.element("#free-transpose").hidden, true);
      assert.equal(app.element("#progress-title").textContent, "Lick 1");
      assert.equal(
        app.element("#progress-detail").textContent,
        first.exercise.source.patternId,
      );
      assert.equal(
        app.fetchCalls.some((url) => url.includes("/data/wjazzd-blocks/")),
        false,
      );

      await app.click("#free-transpose");
      await app.click("#next-exercise");
      assert.equal(app.snapshot().exercise.source.id, first.exercise.source.id);
      assert.equal(
        app.snapshot().exercise.transposition,
        first.exercise.transposition,
      );

      const visitedFirstDeck = new Set();
      let current = first;
      for (
        let completed = 0;
        completed < first.lickExercise.total;
        completed += 1
      ) {
        visitedFirstDeck.add(current.exercise.source.id);
        await finishPlayback(app);
        await enterExerciseNotes(app);
        assert.equal(app.element("#feedback").className, "feedback success");
        assert.equal(app.element("#feedback").textContent, "Lick complete.");
        assert.equal(app.element("#replay").disabled, true);

        const completedId = current.exercise.source.id;
        const completedNumber = current.lickExercise.number;
        await app.clock.tick(719);
        assert.equal(app.snapshot().exercise.source.id, completedId);
        await app.clock.tick(1);
        await app.waitFor(
          () =>
            app.snapshot().lickExercise?.number === completedNumber + 1,
          "lick suivant automatique",
        );

        const next = app.snapshot();
        assert.notEqual(next.exercise.source.id, completedId);
        assert.equal(next.lickExercise.number, completedNumber + 1);
        assert.equal(next.lickExercise.toneState.transpositionsUsed.length, 1);
        assert.equal(
          next.lickExercise.toneState.lastTransposition,
          next.exercise.transposition,
        );
        assert.equal(app.element("#next-exercise").hidden, true);
        assert.equal(app.element("#free-transpose").hidden, true);
        assert.equal(
          app.element("#progress-title").textContent,
          `Lick ${next.lickExercise.number}`,
        );
        if (next.lickExercise.number <= first.lickExercise.total) {
          assert.deepEqual(
            next.lickExercise.deckIds,
            first.lickExercise.deckIds,
          );
        }
        current = next;
      }

      assert.deepEqual(
        [...visitedFirstDeck].sort(),
        [...first.lickExercise.deckIds].sort(),
      );
      assert.equal(
        current.lickExercise.number,
        first.lickExercise.total + 1,
      );
      assert.equal(current.lickExercise.index, 0);
      assert.equal(current.lickExercise.total, 58);
      assert.equal(
        new Set(current.lickExercise.deckIds).size,
        current.lickExercise.total,
      );

      await app.click("#fullscreen-button");
      assert.equal(app.snapshot().lickExercise, null);
      assert.equal(app.element("#home-panel").hidden, false);
    } finally {
      app.close();
    }
  });

  await t.test("le mode libre parcourt les favoris dans leur ordre affiché", async () => {
    const app = await bootApp({
      favorites: ["wjazzd-v2.1-1:1", "wjazzd-v2.1-456:1"],
    });
    try {
      await app.click("#open-favorites");
      const favoriteReferences = [
        ...app.document.querySelectorAll(".favorite-row-main span"),
      ].map(({ textContent }) => textContent);
      assert.equal(favoriteReferences.length, 2);
      assert.equal(
        favoriteReferences.every((reference) => /phrase \d+/.test(reference)),
        true,
      );

      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "première phrase libre",
      );
      const first = app.snapshot();
      assert.equal(first.freeBrowsePhraseKeys.length, 2);
      assert.equal(app.element("#free-counter").textContent, "1/2");
      assert.equal(app.element("#free-previous").disabled, true);
      assert.equal(app.element("#free-next").disabled, false);
      assert.match(
        app.element("#source-summary").textContent,
        new RegExp(`phrase ${first.exercise.source.phrase}`),
      );

      await app.click("#free-next");
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.phraseKey !==
          first.exercise.source.phraseKey,
        "phrase libre suivante",
      );
      assert.equal(app.element("#free-counter").textContent, "2/2");
      assert.equal(app.element("#free-next").disabled, true);

      await app.click("#free-previous");
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.phraseKey ===
          first.exercise.source.phraseKey,
        "retour à la phrase libre précédente",
      );
      assert.equal(app.element("#free-counter").textContent, "1/2");
    } finally {
      app.close();
    }
  });

  await t.test("le tirage libre parcourt tous les favoris avant de reboucler", async () => {
    const favorites = [
      "wjazzd-v2.1-1:1",
      "wjazzd-v2.1-55:3",
      "wjazzd-v2.1-456:1",
    ];
    const app = await bootApp({ favorites });
    try {
      await app.click("#open-favorites");
      assert.equal(app.element("#favorites-random").hidden, false);
      assert.equal(
        app.element("#favorites-random").textContent.trim(),
        "Choose at random",
      );

      await app.click("#favorites-random");
      await app.waitFor(
        () => app.snapshot().exercise,
        "premier favori tiré au hasard",
      );
      assert.equal(app.element("#free-random").title, "Random phrase");

      const firstCycle = [app.snapshot().freePhraseKey];
      while (firstCycle.length < favorites.length) {
        const previous = app.snapshot().freePhraseKey;
        await app.click("#free-random");
        await app.waitFor(
          () => {
            const snapshot = app.snapshot();
            return (
              snapshot.freePhraseKey !== previous &&
              snapshot.exercise?.source?.phraseKey ===
                snapshot.freePhraseKey
            );
          },
          "favori aléatoire suivant",
        );
        firstCycle.push(app.snapshot().freePhraseKey);
      }

      assert.equal(new Set(firstCycle).size, favorites.length);
      assert.deepEqual([...firstCycle].sort(), [...favorites].sort());

      const lastOfFirstCycle = app.snapshot().freePhraseKey;
      await app.click("#free-random");
      await app.waitFor(
        () => {
          const snapshot = app.snapshot();
          return (
            snapshot.freePhraseKey !== lastOfFirstCycle &&
            snapshot.exercise?.source?.phraseKey ===
              snapshot.freePhraseKey
          );
        },
        "nouveau cycle sans répétition immédiate",
      );
      assert.equal(favorites.includes(app.snapshot().freePhraseKey), true);
    } finally {
      app.close();
    }
  });

  await t.test("mode libre, transposition et réglage de longueur", async () => {
    const phraseKey = "wjazzd-v2.1-55:3";
    let persistedPhraseSettings;
    const app = await bootApp({
      favorites: [phraseKey],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
      },
    });
    try {
      await app.click("#open-favorites");
      assert.equal(
        app.element(".favorite-row-main strong").textContent,
        "Charlie Parker",
      );
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "chargement de la phrase libre",
      );
      const first = app.snapshot();
      assert.equal(first.currentMode, "free");
      assert.equal(first.exercise.source.phraseKey, phraseKey);
      assert.equal(app.document.body.classList.contains("game-mode"), true);
      assert.equal(app.element("#free-transpose").hidden, false);

      await app.click("#free-transpose");
      await app.waitFor(
        () =>
          app.snapshot().exercise?.transposition !==
          first.exercise.transposition,
        "transposition libre",
      );
      const transposed = app.snapshot();
      assert.equal(transposed.exercise.source.phraseKey, phraseKey);
      assert.notEqual(
        transposed.exercise.transposition,
        first.exercise.transposition,
      );

      const beforeLength = Number(
        app.element("#phrase-length-output").value.split("/")[0],
      );
      await app.click("#phrase-length-decrease");
      assert.equal(
        Number(app.element("#phrase-length-output").value.split("/")[0]),
        beforeLength - 1,
      );
      assert.equal(
        app.storageJson(PHRASE_SETTINGS_KEY)[phraseKey].notesMax,
        beforeLength - 1,
      );
      await app.clock.tick(140);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.maxNotes ===
          beforeLength - 1,
        "phrase rechargée après réglage",
      );
      assert.equal(
        app.snapshot().exercise.source.phraseKey,
        phraseKey,
      );
      persistedPhraseSettings = app.storageJson(PHRASE_SETTINGS_KEY);
    } finally {
      app.close();
    }

    const restarted = await bootApp({
      favorites: [phraseKey],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
        [PHRASE_SETTINGS_KEY]: persistedPhraseSettings,
      },
    });
    try {
      assert.equal(
        restarted.fetchCalls.some((url) =>
          url.includes("/data/wjazzd-blocks/")
        ),
        false,
      );
      await restarted.click("#open-favorites");
      await restarted.click(".favorite-row-main");
      await restarted.waitFor(
        () => restarted.snapshot().exercise,
        "réglage de phrase persisté",
      );
      assert.equal(
        restarted.snapshot().exercise.source.maxNotes,
        persistedPhraseSettings[phraseKey].notesMax,
      );
      assert.equal(
        new Set(
          restarted.fetchCalls.filter((url) =>
            url.includes("/data/wjazzd-blocks/")
          ),
        ).size,
        1,
      );
    } finally {
      restarted.close();
    }
  });

  await t.test("l’éditeur MIDI corrige, ajoute et restaure une note", async () => {
    const phraseKey = "wjazzd-v2.1-55:3";
    const app = await bootApp({
      favorites: [phraseKey],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
      },
    });
    try {
      await app.click("#open-favorites");
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "phrase à corriger",
      );

      await app.click("#open-phrase-editor");
      await app.waitFor(
        () => app.snapshot().phraseEditorOpen,
        "éditeur MIDI ouvert",
      );
      const originalCount = app.document.querySelectorAll(
        ".phrase-editor-note",
      ).length;
      const originalFirstMidi = Number(
        app.element('.phrase-editor-note[data-index="0"]').dataset.midi,
      );
      const selectedIndex = Math.min(2, originalCount - 1);
      await app.click(
        `.phrase-editor-note[data-index="${selectedIndex}"]`,
      );
      assert.equal(
        app.element("#phrase-editor-counter").value,
        `${selectedIndex + 1}/${originalCount}`,
      );
      const oscillatorCount = app.audio.sources.filter(
        ({ kind }) => kind === "oscillator",
      ).length;
      await app.click("#phrase-editor-play-selected");
      const previewOscillators = app.audio.sources
        .filter(({ kind }) => kind === "oscillator")
        .slice(oscillatorCount);
      assert.equal(
        previewOscillators.length,
        (originalCount - selectedIndex) * 2,
      );
      assert.equal(
        app.element("#phrase-editor-play-selected").getAttribute(
          "aria-pressed",
        ),
        "true",
      );
      assert.equal(app.element("#phrase-editor-play").disabled, true);
      await app.click("#phrase-editor-play-selected");
      assert.equal(app.element("#phrase-editor-play").disabled, false);

      await app.click('.phrase-editor-note[data-index="0"]');
      await app.click('[data-phrase-editor-action="pitch-increase"]');
      await app.click('[data-phrase-editor-action="add-after"]');
      assert.equal(
        app.document.querySelectorAll(".phrase-editor-note").length,
        originalCount + 1,
      );
      await app.click("#phrase-editor-save");

      const saved = app.storageJson(PHRASE_SETTINGS_KEY)[phraseKey];
      assert.equal(saved.ignoredShortestNotes, 0);
      assert.equal(saved.editedEvents.length, originalCount + 1);
      assert.equal(saved.editedEvents[0][0], originalFirstMidi + 1);
      await app.clock.tick(140);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.fullPhraseNoteCount ===
          originalCount + 1,
        "phrase corrigée rechargée",
      );
      assert.equal(
        app.snapshot().exercise.notes[0] -
          app.snapshot().exercise.transposition,
        originalFirstMidi + 1,
      );

      await app.click("#open-phrase-editor");
      await app.waitFor(
        () => app.snapshot().phraseEditorOpen,
        "éditeur rouvert",
      );
      await app.click('[data-phrase-editor-action="restore"]');
      await app.click("#phrase-editor-save");
      assert.equal(
        "editedEvents" in app.storageJson(PHRASE_SETTINGS_KEY)[phraseKey],
        false,
      );
      await app.clock.tick(140);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.fullPhraseNoteCount ===
          originalCount,
        "transcription originale restaurée",
      );
      assert.equal(
        app.snapshot().exercise.notes[0] -
          app.snapshot().exercise.transposition,
        originalFirstMidi,
      );
    } finally {
      app.close();
    }
  });

  await t.test("une ancienne suppression de note brève devient une correction MIDI", async () => {
    const phraseKey = "wjazzd-v2.1-55:3";
    const app = await bootApp({
      favorites: [phraseKey],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
        [PHRASE_SETTINGS_KEY]: {
          [phraseKey]: {
            notesMax: 8,
            ignoredShortestNotes: 1,
          },
        },
      },
    });
    try {
      await app.click("#open-favorites");
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "phrase avec ancien réglage",
      );
      const originalCount = app.snapshot().exercise.source.fullPhraseNoteCount;

      await app.click("#open-phrase-editor");
      await app.waitFor(
        () => app.snapshot().phraseEditorOpen,
        "ancien réglage matérialisé",
      );
      assert.equal(
        app.document.querySelectorAll(".phrase-editor-note").length,
        originalCount - 1,
      );
      await app.click("#phrase-editor-save");

      const saved = app.storageJson(PHRASE_SETTINGS_KEY)[phraseKey];
      assert.equal(saved.ignoredShortestNotes, 0);
      assert.equal(saved.editedEvents.length, originalCount - 1);
      assert.equal(saved.notesMax, 7);
      await app.clock.tick(140);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.fullPhraseNoteCount ===
          originalCount - 1,
        "correction explicite rechargée",
      );
      assert.equal(app.snapshot().exercise.notes.length, 7);
    } finally {
      app.close();
    }
  });

  await t.test("l’éditeur ouvre une phrase dont la source contient une durée nulle", async () => {
    const phraseKey = "wjazzd-v2.1-181:17";
    const app = await bootApp({
      favorites: [phraseKey],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
      },
    });
    try {
      await app.click("#open-favorites");
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "phrase avec durée MIDI nulle",
      );

      await app.click("#open-phrase-editor");
      await app.waitFor(
        () => app.snapshot().phraseEditorOpen,
        "éditeur MIDI ouvert malgré la durée nulle",
      );
      assert.equal(app.element("#phrase-editor-modal").hidden, false);
    } finally {
      app.close();
    }
  });

  await t.test("un réglage local hydrate l’ambitus avant le premier ton", async () => {
    const phraseKey = "wjazzd-v2.1-1:1";
    const app = await bootApp({
      favorites: [phraseKey],
      storage: {
        [PHRASE_SETTINGS_KEY]: {
          [phraseKey]: {
            notesMax: 1,
            ignoredShortestNotes: 0,
          },
        },
      },
    });
    try {
      assert.equal(
        app.fetchCalls.some((url) =>
          url.includes("/data/wjazzd-blocks/")
        ),
        false,
      );
      await app.click("#open-favorites");
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "phrase réglée chargée",
      );
      assert.deepEqual(
        app.snapshot().freeToneState.transpositionRange,
        [-4, 7],
      );
      assert.deepEqual(
        app.snapshot().exercise.source.transpositionRange,
        [-4, 7],
      );
    } finally {
      app.close();
    }
  });

  await t.test("la saisie MIDI tient les notes et verrouille l’octave par tentative", async () => {
    const phraseKey = "wjazzd-v2.1-1:1";
    const app = await bootApp({ favorites: [phraseKey], midi: true });
    try {
      await app.click("#open-favorites");
      await app.click(".favorite-row-main");
      await app.waitFor(
        () => app.snapshot().exercise,
        "phrase MIDI chargée",
      );
      await finishPlayback(app);

      assert.equal(app.element("#midi-connect").hidden, false);
      await app.click("#midi-connect");
      assert.deepEqual(app.midi.requestCalls, [{ sysex: false }]);
      assert.equal(app.snapshot().midiInput.state, "connected");

      const firstMidi = app.snapshot().exercise.notes[0];
      const lowFirstMidi = firstMidi - 24;
      await app.midi.send([0x90, lowFirstMidi, 100]);
      assert.equal(app.snapshot().exercise.currentIndex, 1);
      assert.equal(app.snapshot().midiInput.translation, 24);
      assert.equal(app.snapshot().midiInput.activeToneCount, 1);

      await app.midi.send([0x80, lowFirstMidi, 0]);
      assert.equal(app.snapshot().exercise.currentIndex, 1);
      assert.equal(app.snapshot().midiInput.activeToneCount, 0);

      await app.click("#replay");
      assert.equal(app.snapshot().exercise.currentIndex, 0);
      assert.equal(app.snapshot().midiInput.translation, null);
      assert.equal(app.snapshot().isPlaying, true);

      const highFirstMidi = firstMidi + 12;
      await app.midi.send([0x90, highFirstMidi, 96]);
      assert.equal(app.snapshot().isPlaying, false);
      assert.equal(app.snapshot().exercise.currentIndex, 1);
      assert.equal(app.snapshot().midiInput.translation, -12);
      assert.equal(app.snapshot().midiInput.activeToneCount, 1);

      await app.midi.send([0x90, highFirstMidi, 0]);
      assert.equal(app.snapshot().exercise.currentIndex, 1);
      assert.equal(app.snapshot().midiInput.activeToneCount, 0);
    } finally {
      app.close();
    }
  });

  await t.test("défi complet et protection contre les clics traversants", async () => {
    const app = await bootApp();
    try {
      await app.click("#start-challenge");
      await app.waitFor(
        () => app.snapshot().exercise,
        "premier exercice du défi",
      );
      assert.equal(app.snapshot().currentMode, "challenge");
      assert.ok(app.storageJson("dictee-musicale.challenge-session.v1"));

      for (let round = 0; round < 9; round += 1) {
        await finishPlayback(app);
        const completed = app.snapshot().exercise;
        await enterExerciseNotes(app);

        if (round === 0) {
          const lastMidi = completed.notes.at(-1);
          await app.pointerDown(
            `#piano [data-midi="${lastMidi}"]`,
          );
          await app.clock.tick(719);
          assert.equal(
            app.snapshot().exercise.source.phraseKey,
            completed.source.phraseKey,
          );
          await app.clock.tick(1);
          await app.waitFor(
            () =>
              app.snapshot().exercise?.transposition !==
              completed.transposition,
            "ton suivant du défi",
          );
          assert.equal(
            app.snapshot().exercise.source.phraseKey,
            completed.source.phraseKey,
          );
          assert.notEqual(
            app.snapshot().exercise.transposition,
            completed.transposition,
          );
        } else {
          await app.clock.tick(720);
          if (round < 8) {
            await app.waitFor(() => {
              const current = app.snapshot().exercise;
              return (
                current?.source?.phraseKey !==
                  completed.source.phraseKey ||
                current?.transposition !== completed.transposition
              );
            }, "exercice suivant du défi");
          }
        }
      }

      assert.equal(app.element("#sudden-death-modal").hidden, false);
      await app.click("#start-sudden-death");
      for (let round = 0; round < 3; round += 1) {
        await finishPlayback(app);
        await enterExerciseNotes(app);
        if (round < 2) await app.clock.tick(720);
      }
      assert.equal(app.element("#challenge-complete-modal").hidden, true);
      await app.clock.tick(719);
      assert.equal(app.element("#challenge-complete-modal").hidden, true);
      await app.clock.tick(1);
      assert.equal(app.element("#challenge-complete-modal").hidden, false);
      assert.equal(app.snapshot().challengeSession, null);
    } finally {
      app.close();
    }
  });

  await t.test("notation rapide, notation persistée et review", async () => {
    const app = await bootApp({
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
      },
    });
    try {
      await app.click("#start-rating");
      await app.waitFor(
        () => app.snapshot().exercise,
        "première phrase de notation",
      );
      assert.equal(app.snapshot().currentMode, "rating");
      await app.clock.tick(900);
      const preview = app.snapshot().exercise;
      assert.equal(preview.quickRatingFullPreview, true);
      assert.equal(app.element("#set-phrase-end").disabled, false);

      const thirdNote = preview.timings[Math.min(2, preview.timings.length - 1)];
      await app.clock.tick(
        Math.max(
          1,
          thirdNote.offset * (100 / preview.speedPercent) * 1000 + 1,
        ),
      );
      await app.click("#set-phrase-end");
      const shortened =
        app.storageJson(PHRASE_SETTINGS_KEY)[preview.source.phraseKey];
      assert.ok(shortened.notesMax >= 1);
      assert.ok(shortened.notesMax <= 3);
      await app.clock.tick(140);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.maxNotes ===
          shortened.notesMax,
        "aperçu raccourci rechargé",
      );

      const ratedKey = app.snapshot().exercise.source.phraseKey;
      await app.click('[data-quick-rating="3"]');
      assert.equal(app.storageJson(RATINGS_KEY)[ratedKey].rating, 3);
      await app.clock.tick(180);
      assert.ok(app.snapshot().exercise);

      await app.click("#fullscreen-button");
      assert.equal(app.element("#home-panel").hidden, false);
      await app.click("#start-review");
      await app.waitFor(
        () =>
          app.snapshot().currentMode === "review" &&
          /^\d+\/\d+$/.test(
            app.element("#review-counter").textContent,
          ),
        "première phrase de review",
      );
      assert.equal(app.snapshot().currentMode, "review");
      const firstReviewKey = app.snapshot().exercise.source.phraseKey;
      const firstCounter = app.element("#review-counter").textContent;
      assert.match(firstCounter, /^\d+\/\d+$/);
      await app.click("#review-next");
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.phraseKey !== firstReviewKey,
        "phrase suivante de review",
      );
      assert.notEqual(
        app.snapshot().exercise.source.phraseKey,
        firstReviewKey,
      );

      const reviewedKey = app.snapshot().exercise.source.phraseKey;
      await app.click('#exercise-rating [data-rating="2"]');
      assert.equal(app.storageJson(RATINGS_KEY)[reviewedKey].rating, 2);
      await app.waitFor(
        () =>
          app.snapshot().exercise?.source?.phraseKey !== reviewedKey,
        "retrait de la phrase renotée",
      );
      assert.notEqual(
        app.snapshot().exercise.source.phraseKey,
        reviewedKey,
      );
    } finally {
      app.close();
    }
  });

  await t.test("les originaux utilisent uniquement les intégrations YouTube validées", async () => {
    const parker = await bootApp({
      favorites: ["wjazzd-v2.1-55:3"],
    });
    try {
      await parker.click("#open-favorites");
      await parker.click(".favorite-row-main");
      await parker.waitFor(
        () => parker.snapshot().exercise,
        "phrase Parker",
      );
      const source = parker.snapshot().exercise.source;
      assert.equal(source.audioFile, undefined);
      assert.equal(parker.element("#play-original").hidden, false);
      await parker.click("#play-original");
      assert.equal(
        parker.fetchCalls.some((url) => url.includes("/audio/parker/")),
        false,
      );
      assert.equal(parker.snapshot().isOriginalPlaying, true);
      assert.equal(parker.element("#recording-modal").hidden, false);
      const recording = new URL(parker.element("#recording-player").src);
      assert.equal(recording.pathname, "/embed/02apSoxB7B4");
      assert.equal(
        recording.searchParams.get("start"),
        String(Math.floor(30.1666 + source.onsetStart)),
      );
      assert.equal(
        recording.searchParams.get("end"),
        String(Math.ceil(30.1666 + source.onsetEnd + 0.25)),
      );
    } finally {
      parker.close();
    }

    const youtube = await bootApp({
      favorites: ["wjazzd-v2.1-14:2"],
      storage: {
        [SETTINGS_KEY]: {
          realSpeed: 100,
          developerMode: true,
          transposeOriginal: false,
        },
      },
    });
    try {
      await youtube.click("#open-favorites");
      await youtube.click(".favorite-row-main");
      await youtube.waitFor(
        () => youtube.snapshot().exercise,
        "phrase YouTube",
      );
      const source = youtube.snapshot().exercise.source;
      assert.equal(Boolean(source.audioFile), false);
      assert.equal(youtube.element("#play-original").hidden, true);
      assert.equal(youtube.element("#original-controls").hidden, true);

      await youtube.click("#fullscreen-button");
      await youtube.click("#close-favorites");
      await youtube.click("#open-recording-workshop");
      await youtube.waitFor(
        () =>
          youtube.element("#recording-workshop-panel").hidden === false &&
          youtube.element("#recording-workshop-solo").options.length ===
            112,
        "ouverture de l’atelier",
      );
      await youtube.change(
        "#recording-workshop-solo",
        "wjazzd-v2.1-14",
      );
      assert.equal(
        youtube.element("#recording-workshop-youtube").value,
        "wbU4zwhOGVg",
      );
      assert.equal(
        Number(youtube.element("#recording-workshop-offset").value),
        58.1878,
      );
      assert.deepEqual(
        [
          ...youtube.element("#recording-workshop-phrase").options,
        ].map(({ value }) => value),
        ["2", "6"],
      );

      const workshopPhraseKey = "wjazzd-v2.1-14:2";
      await youtube.click("#edit-recording-workshop-phrase");
      await youtube.waitFor(
        () => youtube.snapshot().phraseEditorOpen,
        "éditeur MIDI ouvert depuis l’atelier",
      );
      const workshopFirstMidi = Number(
        youtube.element('.phrase-editor-note[data-index="0"]').dataset.midi,
      );
      await youtube.click('[data-phrase-editor-action="pitch-increase"]');
      await youtube.click("#phrase-editor-save");
      assert.equal(youtube.snapshot().phraseEditorOpen, false);
      assert.equal(
        youtube.element("#recording-workshop-panel").hidden,
        false,
      );
      assert.equal(
        youtube.storageJson(PHRASE_SETTINGS_KEY)[workshopPhraseKey]
          .editedEvents[0][0],
        workshopFirstMidi + 1,
      );

      await youtube.waitFor(
        () =>
          !youtube.element("#recording-workshop-phrase-timestamp")
            .disabled,
        "chargement du minutage précis",
      );
      assert.equal(
        youtube.element("#recording-workshop-phrase-timestamp").value,
        formatVideoTimestamp(58.1878 + source.phraseOnsetStart),
      );
      const precisePhraseTimestamp = 75.432;
      await youtube.change(
        "#recording-workshop-phrase-timestamp",
        "1:15.432",
      );
      const preciseOffset = Number(
        (precisePhraseTimestamp - source.phraseOnsetStart).toFixed(4),
      );
      assert.equal(
        Number(youtube.element("#recording-workshop-offset").value),
        preciseOffset,
      );

      const sourceCountBeforePhrase = youtube.audio.sources.length;
      await youtube.click("#play-recording-workshop-phrase");
      await youtube.waitFor(
        () => youtube.audio.sources.length > sourceCountBeforePhrase,
        "lecture de la phrase dans l’atelier",
      );
      assert.ok(
        youtube.audio.sources
          .slice(sourceCountBeforePhrase)
          .some(({ kind }) => kind === "oscillator"),
      );

      await youtube.click("#preview-recording-workshop");
      await youtube.waitFor(
        () =>
          youtube
            .element("#recording-workshop-player")
            .hasAttribute("src"),
        "aperçu de la phrase",
      );
      const preview = new URL(
        youtube.element("#recording-workshop-player").src,
      );
      assert.equal(preview.hostname, "www.youtube-nocookie.com");
      assert.equal(preview.searchParams.get("enablejsapi"), "1");
      assert.equal(
        preview.searchParams.get("start"),
        String(Math.floor(preciseOffset + source.onsetStart)),
      );
      assert.equal(
        preview.searchParams.get("end"),
        String(Math.ceil(preciseOffset + source.onsetEnd + 0.25)),
      );

      await youtube.click('[data-recording-offset="0.1"]');
      const adjustedOffset = Number((preciseOffset + 0.1).toFixed(4));
      assert.equal(
        Number(youtube.element("#recording-workshop-offset").value),
        adjustedOffset,
      );
      assert.equal(
        youtube.element("#recording-workshop-phrase-timestamp").value,
        formatVideoTimestamp(
          adjustedOffset + source.phraseOnsetStart,
        ),
      );
      await youtube.click("#verify-recording-workshop");
      assert.deepEqual(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          "wjazzd-v2.1-14"
        ],
        {
          status: "verified",
          youtubeId: "wbU4zwhOGVg",
          offset: adjustedOffset,
          updatedAt:
            youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
              "wjazzd-v2.1-14"
            ].updatedAt,
        },
      );
      assert.notEqual(
        youtube.element("#recording-workshop-solo").value,
        "wjazzd-v2.1-14",
      );
      assert.equal(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          youtube.element("#recording-workshop-solo").value
        ],
        undefined,
      );

      await youtube.click("#close-recording-workshop");
      assert.equal(
        youtube.element("#recording-workshop-panel").hidden,
        true,
      );

      let exportedBlob = null;
      let exportedFilename = null;
      const originalCreateObjectUrl = URL.createObjectURL;
      const originalRevokeObjectUrl = URL.revokeObjectURL;
      const originalAnchorClick =
        youtube.window.HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (blob) => {
        exportedBlob = blob;
        return "blob:central-export";
      };
      URL.revokeObjectURL = () => {};
      youtube.window.HTMLAnchorElement.prototype.click = function () {
        exportedFilename = this.download;
      };
      try {
        await youtube.click("#export-data");
      } finally {
        URL.createObjectURL = originalCreateObjectUrl;
        URL.revokeObjectURL = originalRevokeObjectUrl;
        youtube.window.HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
      assert.ok(exportedBlob);
      assert.match(
        exportedFilename,
        /^jazz-solo-challenge-donnees-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      const exportedCsv = await exportedBlob.text();
      assert.match(
        exportedCsv,
        /"youtube";"wjazzd-v2\.1-14"/,
      );
      assert.ok(
        exportedCsv.includes(`"wbU4zwhOGVg";"${adjustedOffset}"`),
      );

      await youtube.click("#open-favorites");
      await youtube.click(".favorite-row-main");
      await youtube.waitFor(
        () => youtube.snapshot().exercise,
        "phrase validée",
      );
      const validatedSource = youtube.snapshot().exercise.source;
      assert.equal(youtube.element("#play-original").hidden, false);
      await youtube.click("#play-original");
      assert.equal(youtube.element("#recording-modal").hidden, false);
      assert.match(
        youtube.element("#recording-title").textContent,
        new RegExp(`phrase ${validatedSource.phrase}`),
      );

      const embed = new URL(youtube.element("#recording-player").src);
      const expectedStart = Math.floor(
        adjustedOffset + validatedSource.onsetStart,
      );
      const expectedEnd = Math.ceil(
        adjustedOffset + validatedSource.onsetEnd + 0.25,
      );
      assert.equal(embed.hostname, "www.youtube-nocookie.com");
      assert.equal(embed.searchParams.get("start"), String(expectedStart));
      assert.equal(embed.searchParams.get("end"), String(expectedEnd));
      assert.equal(embed.searchParams.get("autoplay"), "1");
      assert.equal(
        youtube.document.querySelector("#recording-external-link"),
        null,
      );
      await youtube.click("#close-recording");
      assert.equal(youtube.element("#recording-modal").hidden, true);
      assert.equal(
        youtube.element("#recording-player").hasAttribute("src"),
        false,
      );

      await youtube.click("#fullscreen-button");
      await youtube.click("#close-favorites");
      await youtube.click("#open-recording-workshop");
      await youtube.waitFor(
        () =>
          youtube.element("#recording-workshop-panel").hidden === false,
        "réouverture de l’atelier",
      );
      await youtube.change(
        "#recording-workshop-solo",
        "wjazzd-v2.1-15",
      );
      const rejectedId =
        youtube.element("#recording-workshop-youtube").value;
      await youtube.click("#reject-recording-workshop");
      assert.deepEqual(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          "wjazzd-v2.1-15"
        ].rejectedYoutubeIds,
        [rejectedId],
      );
      assert.equal(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          "wjazzd-v2.1-15"
        ].status,
        "wrong-version",
      );
      const soloAfterRejection =
        youtube.element("#recording-workshop-solo").value;
      assert.notEqual(
        soloAfterRejection,
        "wjazzd-v2.1-15",
      );
      assert.equal(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          soloAfterRejection
        ],
        undefined,
      );
      await youtube.click("#unavailable-recording-workshop");
      assert.equal(
        youtube.storageJson(RECORDING_VALIDATIONS_KEY)[
          soloAfterRejection
        ].status,
        "unavailable",
      );
      assert.notEqual(
        youtube.element("#recording-workshop-solo").value,
        soloAfterRejection,
      );
    } finally {
      youtube.close();
    }
  });
});
