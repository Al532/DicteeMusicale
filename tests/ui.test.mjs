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

test("l’accueil ne propose que les deux boutons de lancement", () => {
  const home = index.match(
    /<section class="panel settings-panel"[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(home);
  assert.match(home, /id="start-parker"[\s\S]*?Phrases réelles de Charlie Parker/);
  assert.match(home, /id="start-random"[\s\S]*?Phrases générées sur Charlie Parker/);
  assert.equal(home.match(/<button/g)?.length, 2);
  assert.doesNotMatch(home, /<(?:input|select|label)\b/);
  assert.match(app, /let currentMode = "parker"/);
  assert.match(app, /function startMode\(mode\)/);
});

test("la vitesse Parker va de 25 à 100 % et vaut 100 % par défaut", () => {
  assert.match(app, /let parkerSpeedPercent = 100/);
  assert.match(app, /exercise\.speedPercent = parkerSpeedPercent/);
  assert.match(app, /const timeScale = 100 \/ exercise\.speedPercent/);
  assert.match(
    index,
    /id="game-speed" type="range" min="25" max="100" step="5" value="100"/,
  );
  assert.match(app, /elements\.gameSpeed\.addEventListener\("input"/);
});

test("la vitesse aléatoire affiche 25–100 % et double son maximum réel", () => {
  assert.doesNotMatch(index, /BPM/);
  assert.match(app, /const RANDOM_PLAYBACK_MIN_PERCENT = 50/);
  assert.match(app, /const RANDOM_PLAYBACK_MAX_PERCENT = 640/);
  assert.match(app, /function randomSliderToPlaybackPercent\(value\)/);
  assert.match(
    app,
    /RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE \*\s*\(exercise\.playbackRatePercent \/ 100\)/,
  );
});

test("la longueur reste disponible dans les deux modes", () => {
  assert.match(app, /elements\.gameLength\.min = isParker \? "5" : "3"/);
  assert.match(app, /elements\.gameLength\.max = "15"/);
  assert.match(app, /maxNotes: parkerMaxNotes/);
  assert.doesNotMatch(app, /Illimité|=== 16/);
});

test("le slider plein écran s’adapte aux deux modes", () => {
  assert.match(
    app,
    /if \(isParker\) \{[\s\S]*?gameSpeed\.min = "25";[\s\S]*?gameSpeed\.max = "100";/,
  );
  assert.match(
    app,
    /else \{[\s\S]*?gameSpeed\.min = String\(RANDOM_SLIDER_MIN\);[\s\S]*?gameSpeed\.max = String\(RANDOM_SLIDER_MAX\);/,
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
    /RANDOM_SPEED_REFERENCE_NOTES_PER_MINUTE \*\s*\(exercise\.playbackRatePercent \/ 100\)/,
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

test("chaque bouton d’accueil ouvre son mode de jeu", () => {
  assert.match(
    app,
    /function startExercise\(\) \{[\s\S]*?enterGameMode\(\);[\s\S]*?makeSequence/,
  );
  assert.match(app, /elements\.startParker\.addEventListener\("click", \(\) => startMode\("parker"\)\)/);
  assert.match(app, /elements\.startRandom\.addEventListener\("click", \(\) => startMode\("random"\)\)/);
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

test("le lecteur original commence à la frontière et conserve une courte fin", () => {
  assert.match(index, /id="original-controls" hidden/);
  assert.match(index, /id="play-original"[\s\S]*?>\s*Écouter Charlie Parker\s*</);
  assert.match(index, /id="audio-source-link"/);
  assert.doesNotMatch(app, /ORIGINAL_CONTEXT_(?:BEFORE|AFTER)_SECONDS/);
  assert.match(
    app,
    /const phraseStart = sourceMeta\.audioOffset \+ sourceMeta\.onsetStart/,
  );
  assert.match(
    app,
    /const phraseEnd = sourceMeta\.audioOffset \+ sourceMeta\.onsetEnd/,
  );
  assert.match(app, /const clipStart = Math\.max\(0, phraseStart\)/);
  assert.match(app, /const ORIGINAL_TAIL_SECONDS = 0\.25/);
  assert.match(
    app,
    /const clipEnd = Math\.min\([\s\S]*?recording\.duration,[\s\S]*?phraseEnd \+ ORIGINAL_TAIL_SECONDS/,
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

test("l’écoute Parker est visible et son toggle lui est directement rattaché", () => {
  assert.match(
    app,
    /elements\.playOriginal\.textContent = playing \? "Stop" : "Écouter Charlie Parker"/,
  );
  assert.match(index, /Transposer dans le ton actuel/);
  assert.match(app, /elements\.originalControls\.hidden = !hasOriginal/);
  assert.match(
    styles,
    /\.game-mode \.original-controls:not\(\[hidden\]\) \{\s*display: grid;/,
  );
  assert.match(styles, /\.parker-listen-button \{[\s\S]*?background: var\(--accent\)/);
  assert.match(app, /elements\.playOriginal\.addEventListener\("click", toggleOriginalPlayback\)/);
});

test("une erreur efface la progression puis relance automatiquement depuis le début", () => {
  assert.match(app, /const WRONG_NOTE_REPLAY_DELAY_MS = 650/);
  assert.match(
    app,
    /function resetExerciseProgress\(\) \{[\s\S]*?exercise\.currentIndex = 0;[\s\S]*?renderSequence\(\)/,
  );
  assert.match(
    app,
    /if \(!isCorrect\) \{[\s\S]*?restartAfterMistake\(\);[\s\S]*?return;/,
  );
  assert.match(
    app,
    /function restartAfterMistake\(\) \{[\s\S]*?resetExerciseProgress\(\);[\s\S]*?window\.setTimeout\([\s\S]*?playSequence\(\);[\s\S]*?WRONG_NOTE_REPLAY_DELAY_MS/,
  );
});

test("Réécouter remet toujours la saisie à la première note", () => {
  const toggle = app.match(
    /function togglePlayback\(\) \{([\s\S]*?)\n\}\n\nfunction resetExerciseProgress/,
  )?.[1];
  assert.ok(toggle);
  assert.equal(toggle.match(/resetExerciseProgress\(\)/g)?.length, 2);
  assert.match(toggle, /if \(exercise\.completedAt\) \{\s*prepareRepeatedExercise\(\)/);
});

test("les notes déjà justes ne deviennent pas des erreurs après une remise à zéro", () => {
  assert.match(
    app,
    /const wasAlreadySolved = attempt\.guesses\.some\(\(guess\) =>[\s\S]*?isCorrectMidi\(target, guess\.midi\)/,
  );
  assert.match(app, /if \(!isCorrect \|\| !wasAlreadySolved\) \{\s*attempt\.guesses\.push/);
});

test("le nombre de notes est réglable aussi dans l’interface de jeu", () => {
  assert.match(index, /id="game-length" type="range" min="5" max="15" value="15"/);
  assert.match(index, /id="game-length-output">15<\/output>/);
  assert.match(styles, /\.game-mode \.game-length-setting \{\s*display: grid;/);
  assert.match(app, /elements\.gameLength\.addEventListener\("input"/);
  assert.doesNotMatch(index, /Illimité|∞/);
});

test("les toggles de lecture gardent une largeur fixe pour ne pas déplacer les sliders", () => {
  assert.match(styles, /#replay \{[\s\S]*?width: 92px;[\s\S]*?min-width: 92px;/);
  assert.match(styles, /\.parker-listen-button \{[\s\S]*?width: 168px;/);
});

test("la réussite ouvre une modale Recommencer ou Suivant", () => {
  assert.match(index, /id="completion-modal"[\s\S]*?role="dialog"/);
  assert.match(index, /id="restart-exercise">Recommencer<\/button>/);
  assert.match(index, /id="completion-next">Suivant<\/button>/);
  assert.match(app, /function finishExercise\(\) \{[\s\S]*?showCompletionModal\(\)/);
  assert.match(
    app,
    /function restartSameExercise\(\) \{[\s\S]*?prepareRepeatedExercise\(\);[\s\S]*?resetExerciseProgress\(\);[\s\S]*?playSequence\(\)/,
  );
  assert.match(app, /elements\.completionNext\.addEventListener\("click", startExercise\)/);
  assert.match(styles, /\.completion-modal:not\(\[hidden\]\) \{\s*display: grid;/);
});

test("la modale Parker écoute l’original sans se fermer ni transposer", () => {
  assert.match(index, /id="completion-original"[\s\S]*?>\s*Écouter l’original\s*</);
  assert.match(
    app,
    /function showCompletionModal\(\) \{\s*elements\.completionOriginal\.hidden = !exercise\?\.source\?\.audioFile/,
  );
  const modalPlayback = app.match(
    /function toggleCompletionOriginal\(\) \{([\s\S]*?)\n\}/,
  )?.[1];
  assert.ok(modalPlayback);
  assert.match(modalPlayback, /playOriginalExcerpt\(\{ forceOriginalPitch: true \}\)/);
  assert.doesNotMatch(modalPlayback, /hideCompletionModal/);
  assert.match(
    app,
    /const semitones = !forceOriginalPitch && elements\.transposeOriginal\.checked/,
  );
  assert.match(styles, /\.completion-original \{[\s\S]*?grid-column: 1 \/ -1;/);
});

test("les enregistrements et le pitch-shifter sont disponibles hors connexion", () => {
  assert.match(serviceWorker, /dictee-musicale-v12/);
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
