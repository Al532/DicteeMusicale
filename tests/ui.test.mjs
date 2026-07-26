import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
);

test("Phrases réelles est le premier mode et le choix par défaut", () => {
  const optionValues = [...index.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, ["parker", "random"]);
  assert.match(index, /<option value="random">Aléatoire — Markov Parker<\/option>/);
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

test("la vitesse aléatoire va de 50 à 320 % sans être exprimée en BPM", () => {
  assert.match(
    index,
    /id="random-speed" type="range" min="50" max="320" step="2" value="88"/,
  );
  assert.match(index, /id="random-speed-output">88 %<\/output>/);
  assert.doesNotMatch(index, /BPM/);
  assert.match(
    app,
    /settings\.randomSpeedPercent \?\? settings\.randomTempo \?\? settings\.tempo/,
  );
  assert.match(app, /elements\.randomSpeedOutput\.value = `\$\{elements\.randomSpeed\.value\} %`/);
});

test("la longueur et la vitesse aléatoire sont masquées en mode Parker", () => {
  assert.match(app, /elements\.lengthSetting\.hidden = isParker/);
  assert.match(app, /elements\.randomSpeedSetting\.hidden = isParker/);
  assert.match(app, /elements\.speedSetting\.hidden = !isParker/);
});

test("le slider plein écran s’adapte aux deux modes", () => {
  assert.match(
    app,
    /if \(isParker\) \{[\s\S]*?gameSpeed\.min = "25";[\s\S]*?gameSpeed\.max = "100";/,
  );
  assert.match(
    app,
    /else \{[\s\S]*?gameSpeed\.min = "50";[\s\S]*?gameSpeed\.max = "320";/,
  );
  assert.match(app, /function syncGameSpeed\(value\)/);
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

test("le mode aléatoire joue legato jusqu’à la note suivante", () => {
  const playback = app.match(
    /function playSequence\(\) \{([\s\S]*?)\n\}\n\nfunction renderSequence/,
  )?.[1];
  assert.ok(playback);
  assert.match(
    playback,
    /RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE \* \(exercise\.speedPercent \/ 100\)/,
  );
  assert.match(playback, /const noteIntervalMs = 60_000 \/ notesPerMinute/);
  assert.match(
    playback,
    /const toneDuration = noteIntervalMs \/ 1000 \+ LEGATO_RELEASE_SECONDS/,
  );
  assert.doesNotMatch(playback, /toneDuration = Math\.min/);
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

test("le lecteur original prend du contexte et cite chaque enregistrement", () => {
  assert.match(index, /id="original-controls" hidden/);
  assert.match(index, /id="play-original"[\s\S]*?>\s*Original\s*</);
  assert.match(index, /id="audio-source-link"/);
  assert.match(app, /const ORIGINAL_CONTEXT_BEFORE_SECONDS = 3/);
  assert.match(app, /const ORIGINAL_CONTEXT_AFTER_SECONDS = 1\.5/);
  assert.match(
    app,
    /const phraseStart = sourceMeta\.audioOffset \+ sourceMeta\.onsetStart/,
  );
  assert.match(
    app,
    /const phraseEnd = sourceMeta\.audioOffset \+ sourceMeta\.onsetEnd/,
  );
  assert.match(app, /sliceAudioBuffer\(context, recording, clipStart, clipEnd\)/);
  assert.match(app, /elements\.audioSourceLink\.href = source\.audioSourceUrl/);
});

test("le toggle transpose l’original sans changer sa durée", () => {
  assert.match(index, /id="transpose-original" type="checkbox"/);
  assert.match(
    app,
    /elements\.transposeOriginal\.checked\s*\?\s*sourceMeta\.transposition\s*:\s*0/,
  );
  assert.match(app, /clip = pitchShiftAudioBuffer\(context, clip, semitones\)/);
  assert.match(app, /elements\.transposeOriginal\.addEventListener\("change", saveSettings\)/);
});

test("Original devient Stop et n’est proposé qu’en mode phrases réelles", () => {
  assert.match(
    app,
    /elements\.playOriginal\.textContent = playing \? "Stop" : "Original"/,
  );
  assert.match(app, /elements\.originalControls\.hidden = !hasOriginal/);
  assert.match(
    styles,
    /\.game-mode \.original-controls:not\(\[hidden\]\) \{\s*display: flex;/,
  );
  assert.match(app, /elements\.playOriginal\.addEventListener\("click", toggleOriginalPlayback\)/);
});

test("les enregistrements et le pitch-shifter sont disponibles hors connexion", () => {
  assert.match(serviceWorker, /dictee-musicale-v10/);
  assert.match(serviceWorker, /\.\/src\/audio\.js/);
  for (const name of [
    "billies-bounce",
    "donna-lee",
    "ornithology",
    "scrapple-from-the-apple",
    "thriving-on-a-riff",
    "yardbird-suite",
  ]) {
    assert.match(serviceWorker, new RegExp(`\\./audio/parker/${name}\\.mp3`));
  }
});
