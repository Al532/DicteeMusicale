import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("l’interface ne propose que les modes Random et Parker", () => {
  const optionValues = [...index.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, ["random", "parker"]);
});

test("la vitesse Parker va de 25 à 100 % et vaut 100 % par défaut", () => {
  assert.match(
    index,
    /id="speed" type="range" min="25" max="100" step="5" value="100"/,
  );
  assert.match(app, /exercise\.speedPercent = Number\(elements\.speed\.value\)/);
  assert.match(app, /const timeScale = 100 \/ exercise\.speedPercent/);
});

test("la longueur et le BPM sont masqués en mode Parker", () => {
  assert.match(app, /elements\.lengthSetting\.hidden = isParker/);
  assert.match(app, /elements\.tempoSetting\.hidden = isParker/);
  assert.match(app, /elements\.speedSetting\.hidden = !isParker/);
});

test("seule la première touche est animée pendant la lecture", () => {
  const guardedFlashes = app.match(
    /if \(index === 0\) \{\s*flashPlayedKey\(midi,[\s\S]*?\);\s*\}/g,
  );
  assert.equal(guardedFlashes?.length, 2);
});
