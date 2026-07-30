import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  DEFAULT_PHRASE_MAX_NOTES,
  mergePhraseSettings,
  resolvePhraseSettings,
} from "../src/phrase-settings.js";
import { DEFAULT_PHRASE_SETTINGS } from "../data/default-phrase-settings.js";

const execFileAsync = promisify(execFile);

test("les 54 réglages de phrase exportés sont intégrés en dur", () => {
  assert.equal(Object.keys(DEFAULT_PHRASE_SETTINGS).length, 54);
  assert.deepEqual(DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-181:17"], {
    notesMax: 14,
    ignoredShortestNotes: 1,
    updatedAt: "2026-07-30T14:05:53.017Z",
  });
});

test("les réglages absents utilisent 20 notes et aucune note ignorée", () => {
  assert.deepEqual(resolvePhraseSettings({}, 31), {
    notesMax: DEFAULT_PHRASE_MAX_NOTES,
    ignoredShortestNotes: 0,
    fullPhraseNoteCount: 31,
    playedNoteCount: 20,
  });
  assert.deepEqual(resolvePhraseSettings({}, 8), {
    notesMax: 8,
    ignoredShortestNotes: 0,
    fullPhraseNoteCount: 8,
    playedNoteCount: 8,
  });
});

test("la longueur et les notes ignorées restent toujours jouables", () => {
  assert.deepEqual(
    resolvePhraseSettings(
      {
        notesMax: 99,
        ignoredShortestNotes: 99,
      },
      7,
    ),
    {
      notesMax: 7,
      ignoredShortestNotes: 6,
      fullPhraseNoteCount: 7,
      playedNoteCount: 1,
    },
  );
  assert.deepEqual(
    resolvePhraseSettings(
      {
        notesMax: 1,
        ignoredShortestNotes: 1,
      },
      20,
    ),
    {
      notesMax: 1,
      ignoredShortestNotes: 0,
      fullPhraseNoteCount: 20,
      playedNoteCount: 1,
    },
  );
});

test("la fusion conserve le réglage le plus récent sans le mêler aux étoiles", () => {
  assert.deepEqual(
    mergePhraseSettings(
      {
        "solo:1": {
          notesMax: 12,
          ignoredShortestNotes: 1,
          updatedAt: "2026-07-29T10:00:00.000Z",
        },
      },
      {
        "solo:1": {
          notesMax: 9,
          ignoredShortestNotes: 2,
          updatedAt: "2026-07-30T10:00:00.000Z",
        },
        invalide: { notesMax: 4 },
      },
    ),
    {
      "solo:1": {
        notesMax: 9,
        ignoredShortestNotes: 2,
        updatedAt: "2026-07-30T10:00:00.000Z",
      },
    },
  );
});

test("l’importeur accepte les anciens CSV et les nouveaux réglages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dictee-settings-"));
  const oldInput = join(directory, "old.csv");
  const oldOutput = join(directory, "old-output.mjs");
  const oldSettingsOutput = join(directory, "old-settings-output.mjs");
  await writeFile(
    oldInput,
    [
      "portee;identifiant;etoiles;musicien;morceau;phrase;mise_a_jour",
      'phrase;solo:1;3;Musicien;Morceau;1;"2026-07-30T10:00:00.000Z"',
    ].join("\n"),
  );
  await execFileAsync(
    process.execPath,
    [
      "scripts/generate_ratings_data.mjs",
      oldInput,
      oldOutput,
      oldSettingsOutput,
    ],
    { cwd: new URL("..", import.meta.url) },
  );
  const oldSource = await readFile(oldOutput, "utf8");
  const oldSettingsSource = await readFile(oldSettingsOutput, "utf8");
  assert.match(oldSource, /DEFAULT_PHRASE_RATINGS/);
  assert.match(
    oldSettingsSource,
    /DEFAULT_PHRASE_SETTINGS = Object\.freeze\(\{\}\)/,
  );

  const newInput = join(directory, "new.csv");
  const newOutput = join(directory, "new-output.mjs");
  const newSettingsOutput = join(directory, "new-settings-output.mjs");
  await writeFile(
    newInput,
    [
      "portee;identifiant;etoiles;musicien;morceau;phrase;mise_a_jour;notes_max;notes_courtes_ignorees;reglages_mise_a_jour",
      "phrase;solo:1;3;Musicien;Morceau;1;2026-07-30T10:00:00.000Z;12;2;2026-07-30T11:00:00.000Z",
      "phrase;solo:2;;;;;;5;0;2026-07-30T12:00:00.000Z",
    ].join("\n"),
  );
  await execFileAsync(
    process.execPath,
    [
      "scripts/generate_ratings_data.mjs",
      newInput,
      newOutput,
      newSettingsOutput,
    ],
    { cwd: new URL("..", import.meta.url) },
  );
  const importedRatings = await import(
    `${new URL(`file://${newOutput}`)}?v=1`
  );
  const importedSettings = await import(
    `${new URL(`file://${newSettingsOutput}`)}?v=1`
  );

  assert.equal(importedRatings.DEFAULT_PHRASE_RATINGS["solo:1"].rating, 3);
  assert.deepEqual(importedSettings.DEFAULT_PHRASE_SETTINGS["solo:1"], {
    notesMax: 12,
    ignoredShortestNotes: 2,
    updatedAt: "2026-07-30T11:00:00.000Z",
  });
  assert.deepEqual(importedSettings.DEFAULT_PHRASE_SETTINGS["solo:2"], {
    notesMax: 5,
    ignoredShortestNotes: 0,
    updatedAt: "2026-07-30T12:00:00.000Z",
  });
});
