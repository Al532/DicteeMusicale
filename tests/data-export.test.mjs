import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  DATA_EXPORT_HEADERS,
  createDataExportCsv,
  createDataExportRows,
} from "../src/data-export.js";

const execFileAsync = promisify(execFile);

function exportOptions() {
  return {
    phraseRatings: {
      "solo-a:1": {
        rating: 3,
        performer: "Musicien",
        title: "Morceau",
        phrase: "1",
        updatedAt: "2026-07-31T10:00:00.000Z",
      },
    },
    phraseSettings: {
      "solo-a:1": {
        notesMax: 8,
        ignoredShortestNotes: 0,
        updatedAt: "2026-07-31T11:00:00.000Z",
      },
    },
    protocol: { scopes: [], structuralRules: [] },
    protocolVersion: 4,
    recordingValidations: {
      "solo-a": {
        status: "verified",
        youtubeId: "abcdefghijk",
        offset: 12.3456,
        updatedAt: "2026-07-31T12:00:00.000Z",
      },
      "solo-b": {
        status: "wrong-version",
        rejectedYoutubeIds: ["ABCDEFGHIJK"],
        updatedAt: "2026-07-31T13:00:00.000Z",
      },
    },
    solosById: new Map([
      ["solo-a", { performer: "Musicien", title: "Morceau" }],
      ["solo-b", { performer: "Autre", title: "Standard" }],
    ]),
  };
}

test("l’export central réunit notes, réglages et synchronisations YouTube", () => {
  const rows = createDataExportRows(exportOptions());
  assert.deepEqual(rows[0], DATA_EXPORT_HEADERS);
  assert.equal(rows.every((row) => row.length === rows[0].length), true);

  const phrase = rows.find(
    (row) => row[1] === "phrase" && row[2] === "solo-a:1",
  );
  assert.equal(phrase[3], 3);
  assert.equal(phrase[13], 8);

  const verified = rows.find(
    (row) => row[1] === "youtube" && row[2] === "solo-a",
  );
  assert.equal(verified[17], "verified");
  assert.equal(verified[18], "abcdefghijk");
  assert.equal(verified[19], 12.3456);

  const rejected = rows.find(
    (row) => row[1] === "youtube" && row[2] === "solo-b",
  );
  assert.equal(rejected[17], "wrong-version");
  assert.equal(rejected[20], '["ABCDEFGHIJK"]');

  const csv = createDataExportCsv(exportOptions());
  assert.equal(csv.startsWith("\ufeff"), true);
  assert.match(csv, /"statut_youtube";"youtube_id";"decalage_youtube"/);
  assert.match(csv, /"youtube";"solo-a"/);
});

test("le même CSV régénère aussi recording-validations.js", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dictee-export-"));
  const input = join(directory, "data.csv");
  const ratingsOutput = join(directory, "ratings.mjs");
  const settingsOutput = join(directory, "settings.mjs");
  const recordingsOutput = join(directory, "recordings.mjs");
  await writeFile(input, createDataExportCsv(exportOptions()));

  await execFileAsync(
    process.execPath,
    [
      "scripts/generate_ratings_data.mjs",
      input,
      ratingsOutput,
      settingsOutput,
      recordingsOutput,
    ],
    { cwd: new URL("..", import.meta.url) },
  );

  const ratings = await import(`${pathToFileURL(ratingsOutput)}?v=1`);
  const settings = await import(`${pathToFileURL(settingsOutput)}?v=1`);
  const recordings = await import(
    `${pathToFileURL(recordingsOutput)}?v=1`
  );

  assert.equal(ratings.DEFAULT_PHRASE_RATINGS["solo-a:1"].rating, 3);
  assert.equal(settings.DEFAULT_PHRASE_SETTINGS["solo-a:1"].notesMax, 8);
  assert.deepEqual(recordings.RECORDING_VALIDATIONS["solo-a"], {
    status: "verified",
    youtubeId: "abcdefghijk",
    offset: 12.3456,
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
  assert.deepEqual(recordings.RECORDING_VALIDATIONS["solo-b"], {
    status: "wrong-version",
    rejectedYoutubeIds: ["ABCDEFGHIJK"],
    updatedAt: "2026-07-31T13:00:00.000Z",
  });
  assert.match(
    await readFile(recordingsOutput, "utf8"),
    /centralized in-app data export/,
  );
});
