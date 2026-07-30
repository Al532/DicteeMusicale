import test from "node:test";
import assert from "node:assert/strict";
import {
  bootApp,
  enterExerciseNotes,
  finishPlayback,
} from "./helpers/app-dom-harness.mjs";

const SETTINGS_KEY = "dictee-musicale.settings.v1";
const RATINGS_KEY = "dictee-musicale.ratings.v1";
const PHRASE_SETTINGS_KEY =
  "dictee-musicale.phrase-settings.v1";

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
        transposeOriginal: false,
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
      assert.equal(
        restarted.element("#transpose-original").checked,
        true,
      );
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

  await t.test("original Parker local et lecteur YouTube borné", async () => {
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
      assert.equal(source.audioFile, "audio/parker/donna-lee.mp3");
      assert.equal(parker.element("#play-original").hidden, false);
      await parker.click("#play-original");
      assert.ok(
        parker.fetchCalls.some((url) =>
          /\/audio\/parker\/donna-lee\.mp3$/.test(url),
        ),
      );
      assert.equal(parker.snapshot().isOriginalPlaying, true);
      const sliced = parker.audio.buffers.at(-1);
      const expectedDuration =
        source.onsetEnd - source.onsetStart + 0.25;
      assert.ok(Math.abs(sliced.duration - expectedDuration) < 0.01);
    } finally {
      parker.close();
    }

    const youtube = await bootApp({
      favorites: ["wjazzd-v2.1-10:1"],
    });
    try {
      await youtube.click("#open-favorites");
      await youtube.click(".favorite-row-main");
      await youtube.waitFor(
        () => youtube.snapshot().exercise,
        "phrase JazzTube",
      );
      const source = youtube.snapshot().exercise.source;
      assert.equal(Boolean(source.audioFile), false);
      await youtube.click("#play-original");
      assert.equal(youtube.element("#recording-modal").hidden, false);

      const embed = new URL(youtube.element("#recording-player").src);
      const expectedStart = Math.floor(111.8102 + source.onsetStart);
      const expectedEnd = Math.ceil(
        111.8102 + source.onsetEnd + 0.25,
      );
      assert.equal(embed.hostname, "www.youtube-nocookie.com");
      assert.equal(embed.searchParams.get("start"), String(expectedStart));
      assert.equal(embed.searchParams.get("end"), String(expectedEnd));
      assert.equal(embed.searchParams.get("autoplay"), "1");

      const fallback = new URL(
        youtube.element("#recording-external-link").href,
      );
      assert.equal(fallback.searchParams.get("t"), `${expectedStart}s`);
      await youtube.click("#close-recording");
      assert.equal(youtube.element("#recording-modal").hidden, true);
      assert.equal(
        youtube.element("#recording-player").hasAttribute("src"),
        false,
      );
    } finally {
      youtube.close();
    }
  });
});
