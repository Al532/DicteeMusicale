import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
);

test("Phrases réelles est le premier mode et le choix par défaut", () => {
  const optionValues = [...index.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, ["parker", "random"]);
  assert.match(app, /settings\.mode === "random" \? "random" : "parker"/);
});

test("la vitesse Parker va de 25 à 100 % et vaut 100 % par défaut", () => {
  assert.match(
    index,
    /id="speed" type="range" min="25" max="100" step="5" value="100"/,
  );
  assert.match(app, /exercise\.speedPercent = Number\(elements\.speed\.value\)/);
  assert.match(app, /const timeScale = 100 \/ exercise\.speedPercent/);
  assert.match(
    index,
    /id="game-speed" type="range" min="25" max="100" step="5" value="100"/,
  );
  assert.match(app, /elements\.gameSpeed\.addEventListener\("input"/);
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

test("la lecture audio commence bien par la première note", () => {
  const playback = app.match(
    /function playSequence\(\) \{([\s\S]*?)\n\}\n\nfunction renderSequence/,
  )?.[1];
  assert.ok(playback);
  assert.equal(playback.match(/exercise\.notes\.forEach/g)?.length, 2);
  assert.equal(playback.match(/playTone\(midi,/g)?.length, 2);
  assert.doesNotMatch(playback, /exercise\.notes\.slice\(1\)/);
});

test("les notes restent pleines presque jusqu’à leur fin annotée", () => {
  assert.match(
    app,
    /safeDuration - Math\.min\(0\.035, safeDuration \* 0\.15\)/,
  );
  assert.doesNotMatch(app, /safeDuration \* 0\.72/);
});

test("la première note doit être saisie avant d’apparaître dans la séquence", () => {
  assert.match(app, /currentIndex: 0/);
  assert.match(app, /const isRecorded = index < exercise\.currentIndex/);
  assert.match(
    app,
    /if \(isRecorded\) \{\s*slot\.className = index === 0 \? "reference" : "solved"/,
  );
  assert.match(app, /markReferenceKey\(\)/);
});

test("la PWA se lance en plein écran paysage", () => {
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  assert.deepEqual(manifest.display_override, ["fullscreen", "standalone"]);
});

test("le bouton de jeu demande le plein écran et verrouille le paysage", () => {
  assert.match(index, /id="fullscreen-button">Plein écran</);
  assert.match(index, /class="rotate-overlay"/);
  assert.match(app, /document\.documentElement\.requestFullscreen/);
  assert.match(app, /screen\.orientation\?\.lock\?\.\("landscape"\)/);
  assert.match(app, /document\.addEventListener\("fullscreenchange"/);
});

test("Commencer ouvre le mode jeu et le clavier reste absent de l’écran principal", () => {
  assert.match(
    app,
    /function startExercise\(\) \{[\s\S]*?enterGameMode\(\);[\s\S]*?makeSequence/,
  );
  assert.match(styles, /\.piano-shell \{\s*display: none;/);
  assert.match(styles, /\.game-mode \.piano-shell \{\s*display: block;/);
  assert.match(styles, /\.exercise-panel \{\s*display: none;/);
  assert.match(styles, /\.game-mode \.exercise-panel \{\s*display: grid;/);
});

test("le mode jeu donne toute la largeur disponible au piano dynamique", () => {
  assert.match(styles, /\.game-mode main \{[\s\S]*?width: 100%;[\s\S]*?height: 100dvh;/);
  assert.match(styles, /\.game-mode \.piano \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(styles, /@media \(orientation: portrait\)[\s\S]*?\.game-mode \.rotate-overlay/);
  assert.match(app, /function buildPiano\(layout\)/);
  assert.match(app, /--white-key-count/);
  assert.match(app, /midi = layout\.startMidi; midi <= layout\.endMidi/);
});

test("les notes validées sont des boutons audibles", () => {
  assert.match(app, /button\.addEventListener\("click", \(\) => playRecordedNote\(midi\)\)/);
  assert.match(app, /function playRecordedNote\(midi\) \{[\s\S]*?playTone\(midi/);
});

test("Suivant est disponible en jeu et Note de départ a disparu", () => {
  assert.match(
    index,
    /class="ghost-button compact" id="next-exercise" disabled>Suivant</,
  );
  assert.doesNotMatch(index, /id="reference-note"/);
  assert.match(app, /elements\.nextExercise\.addEventListener\("click", startExercise\)/);
  assert.doesNotMatch(app, /playReference|referenceNote/);
});

test("Réécouter devient Stop pendant la lecture et arrête toutes les sources", () => {
  assert.match(app, /elements\.replay\.textContent = playing \? "Stop" : "Réécouter"/);
  assert.match(app, /function togglePlayback\(\) \{[\s\S]*?if \(isPlaying\) \{[\s\S]*?stopAllTones\(\)/);
  assert.match(app, /for \(const source of activeAudioSources\) \{[\s\S]*?source\.stop\(\)/);
  assert.match(app, /elements\.replay\.addEventListener\("click", togglePlayback\)/);
});

test("les chicks ne sont programmés que pour la lecture rythmée Parker", () => {
  const playback = app.match(
    /function playSequence\(\) \{([\s\S]*?)\n\}\n\nfunction renderSequence/,
  )?.[1];
  assert.ok(playback);
  assert.match(
    playback,
    /if \(exercise\.timings\) \{[\s\S]*?for \(const chick of exercise\.chicks \?\? \[\]\) \{[\s\S]*?playChick\(chick\.offset \* timeScale\)/,
  );
  assert.match(app, /filter\.type = "highpass"/);
  assert.match(app, /gain\.gain\.setValueAtTime\(0\.032, start\)/);
});
