import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const session = await readFile(
  new URL("../src/session.js", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
);
const frenchManifest = JSON.parse(
  await readFile(new URL("../manifest-fr.webmanifest", import.meta.url), "utf8"),
);
const icon = await readFile(new URL("../icon.svg", import.meta.url), "utf8");

test("l’accueil public présente directement Jazz Solo Challenge", () => {
  assert.match(index, /<title>Jazz Solo Challenge<\/title>/);
  assert.match(index, /<html lang="en">/);
  assert.match(
    index,
    /id="home-title">[\s\S]*?<span>Jazz Solo<\/span>[\s\S]*?<span>Challenge<\/span>/,
  );
  assert.match(
    index,
    /Play jazz solo phrases back by ear, in every key\./,
  );
  assert.match(index, /data-i18n="home\.rule\.phrases">phrases/);
  assert.match(index, /data-i18n="home\.rule\.keysEach">keys each/);
  assert.match(index, /data-i18n="home\.rule\.suddenDeath">sudden death/);
  assert.match(index, /id="start-challenge"[\s\S]*?data-i18n="home\.start">Start/);
  assert.match(index, /id="resume-challenge" hidden[\s\S]*?data-i18n="home\.resume">Resume/);
  assert.match(index, /id="open-favorites"[\s\S]*?data-i18n="home\.freeMode">Free mode/);
  assert.match(index, /navigator\.languages\?\.\[0\][\s\S]*?\^fr[\s\S]*?"fr" : "en"/);
  assert.match(index, /manifest-fr\.webmanifest/);
  assert.doesNotMatch(index, /Session guidée|≈ 10 min|Écoute\. Transpose\./);
  assert.doesNotMatch(index, /class="settings-drawer"|Son de la mélodie/);
  assert.doesNotMatch(index, /Phrases réelles[\s\S]*Phrases générées/);
});

test("les anciens outils restent confinés au mode développeur", () => {
  assert.match(
    index,
    /class="developer-lab developer-only" data-developer-only hidden[\s\S]*?id="start-real"[\s\S]*?id="start-random"[\s\S]*?id="start-rating"[\s\S]*?id="musician-picker"[\s\S]*?id="minimum-rating"/,
  );
  assert.match(index, /id="developer-mode" type="checkbox"/);
  assert.match(app, /function renderDeveloperMode\(\)/);
});

test("les statistiques de progression et leur collecte ont disparu", () => {
  assert.doesNotMatch(index, /Statistiques|Progression|stat-(?:exercises|notes|accuracy|response)/);
  assert.doesNotMatch(index, /export-csv|export-json|reset-stats|import-json/);
  assert.doesNotMatch(app, /renderStats|summarizeRecords|STORAGE_KEY|records\.push|exportCsv|resetStats/);
  assert.doesNotMatch(index, /score|points/i);
});

test("le défi utilise uniquement le catalogue 3★ et tronque à vingt notes", () => {
  assert.match(app, /const REAL_MAX_NOTES = 20/);
  assert.match(
    app,
    /function challengeCatalog\(\)[\s\S]*?jazzPhraseCatalog\(\{[\s\S]*?minimumRating: 3/,
  );
  assert.match(
    app,
    /function loadPublicPhrase\([\s\S]*?maxNotes: REAL_MAX_NOTES,[\s\S]*?minimumRating: isChallenge \? 3 : 0/,
  );
  assert.match(session, /export const CHALLENGE_PHRASE_COUNT = 3/);
  assert.match(session, /export const TRAINING_TONES_PER_PHRASE = 3/);
});

test("les trois transpositions d’une phrase restent consécutives", () => {
  assert.match(
    session,
    /if \(session\.toneIndex \+ 1 < TRAINING_TONES_PER_PHRASE\) \{[\s\S]*?session\.toneIndex \+= 1;[\s\S]*?\} else if \(session\.phraseIndex \+ 1 < CHALLENGE_PHRASE_COUNT\) \{[\s\S]*?session\.phraseIndex \+= 1;[\s\S]*?session\.toneIndex = 0;/,
  );
  assert.match(
    app,
    /t\("challenge\.progressPhrase", \{[\s\S]*?challengeSession\.phraseIndex \+ 1/,
  );
  assert.match(
    app,
    /t\("challenge\.progressTone", \{[\s\S]*?challengeSession\.toneIndex \+ 1/,
  );
  assert.match(index, /id="progress-dots"/);
});

test("la mort subite autorise les réécoutes avant l’unique tentative", () => {
  assert.match(
    index,
    /id="sudden-death-title" data-i18n="sudden\.title">Sudden death<\/h2>/,
  );
  assert.match(
    index,
    /data-i18n="sudden\.body"[\s\S]*?Replay as often as needed[\s\S]*?you have one\s+attempt/,
  );
  assert.match(
    app,
    /challengeSession\?\.phase === "sudden-death"[\s\S]*?!exercise\.executionStarted[\s\S]*?exercise\.executionStarted = true;[\s\S]*?elements\.replay\.disabled = true/,
  );
  assert.match(
    app,
    /function failSuddenDeath\(\)[\s\S]*?resolveSuddenDeath\(challengeSession, false\)[\s\S]*?loadChallengeRound\(\)/,
  );
  assert.match(
    session,
    /if \(success\) \{[\s\S]*?suddenCompleted\.push\(phraseKey\);[\s\S]*?\} else \{[\s\S]*?suddenQueue\.push\(phraseKey\);/,
  );
});

test("les cycles de tonalités sont indépendants et persistent avec la session", () => {
  assert.match(
    session,
    /makeJazzTranspositionCycle\(\{[\s\S]*?avoidFirstTransposition: phrase\.lastTransposition,[\s\S]*?random/,
  );
  assert.match(
    session,
    /remainingTranspositions:[\s\S]*?lastTransposition:[\s\S]*?transpositionsUsed:[\s\S]*?cycleNumber:/,
  );
  assert.match(app, /const CHALLENGE_SESSION_KEY = "dictee-musicale\.challenge-session\.v1"/);
  assert.match(app, /function persistChallengeSession\(\)/);
  assert.match(app, /function resumeChallenge\(\)/);
  assert.match(app, /isResumableChallengeSession/);
});

test("chaque session progresse d’une phrase courte à une moyenne puis une longue", () => {
  assert.match(
    session,
    /function dynamicLengthPools\(catalog\)[\s\S]*?Math\.ceil\(sorted\.length \/ 3\)[\s\S]*?Math\.ceil\(\(sorted\.length \* 2\) \/ 3\)/,
  );
  assert.match(
    session,
    /const \{ pools, cutoffs \} = dynamicLengthPools\(phrases\)[\s\S]*?for \(const pool of pools\)[\s\S]*?pool\.filter\([\s\S]*?!completed\.has\(phraseKey\)/,
  );
  assert.match(session, /resetPhraseKeys\.push\(\.\.\.pool\.map/);
  assert.match(app, /const COMPLETED_PHRASES_KEY = "dictee-musicale\.completed-phrases\.v1"/);
  assert.match(
    app,
    /selection\.resetPhraseKeys\.length[\s\S]*?completedPhraseKeys = completedPhraseKeys\.filter/,
  );
});

test("les favoris sont accessibles pendant le jeu et dans une liste libre", () => {
  assert.match(index, /id="favorite-toggle"/);
  assert.match(index, /id="favorites-list"/);
  assert.match(index, /id="favorites-empty"/);
  assert.match(
    index,
    /id="free-transpose" hidden[\s\S]*?data-i18n="free\.otherKey">Another key/,
  );
  assert.match(app, /const FAVORITES_KEY = "dictee-musicale\.favorites\.v1"/);
  assert.match(app, /function toggleCurrentFavorite\(\)/);
  assert.match(app, /function renderFavorites\(\)/);
  assert.match(app, /function startFreePhrase\(phraseKey\)/);
  assert.match(app, /function transposeFreePhrase\(\)/);
});

test("chaque phrase peut être ajoutée aux favoris depuis le bilan final", () => {
  assert.match(index, /id="challenge-complete-modal"/);
  assert.match(index, /id="completed-phrases"/);
  assert.match(
    app,
    /function renderCompletedChallenge\(phrases\)[\s\S]*?className = "completed-phrase-favorite"[\s\S]*?toggleFavoritePhrase\(phrase\.phraseKey\)[\s\S]*?renderFavoriteControl\(favorite, phrase\.phraseKey, subject\)/,
  );
  assert.match(
    styles,
    /\.completed-phrase \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 36px/,
  );
  assert.match(
    styles,
    /\.completed-phrase-favorite\[aria-pressed="true"\] \{[\s\S]*?color: var\(--accent\)/,
  );
});

test("le mode normal n’affiche que le musicien et le morceau", () => {
  assert.match(index, /id="source-summary" hidden/);
  assert.match(
    app,
    /elements\.sourceSummary\.append\([\s\S]*?performer,[\s\S]*?document\.createTextNode\(` — \$\{source\.title\}`\)/,
  );
  assert.match(
    app,
    /elements\.sourceLine\.hidden =\s*!developerMode \|\| currentMode === "challenge" \|\| currentMode === "free"/,
  );
  assert.match(
    app,
    /function loadPublicPhrase\([\s\S]*?elements\.sourceLine\.hidden = true/,
  );
});

test("l’accueil et le jeu occupent le paysage, le portrait demande une rotation", () => {
  assert.match(
    styles,
    /html:has\(body\.home-view\),[\s\S]*?body\.home-view \{[\s\S]*?overflow: hidden/,
  );
  assert.match(
    styles,
    /\.home-panel \{[\s\S]*?grid-template-columns:[\s\S]*?min-height: 100dvh/,
  );
  assert.match(app, /function showHome\(\) \{[\s\S]*?classList\.add\("home-view"\)/);
  assert.match(styles, /\.game-mode main \{[\s\S]*?height: 100dvh/);
  assert.match(
    styles,
    /\.game-mode \.exercise-panel \{[\s\S]*?grid-template-rows:[\s\S]*?minmax\(110px, 1fr\)/,
  );
  assert.match(styles, /\.piano \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.home-view \.rotate-overlay,[\s\S]*?\.game-mode:not\(\.rating-mode\) \.rotate-overlay/,
  );
  assert.match(app, /function buildPiano\(layout\)/);
  assert.match(app, /--white-key-count/);
});

test("la vitesse se règle sous le piano sans désaxer Réécouter", () => {
  assert.match(
    index,
    /class="game-controls"[\s\S]*?id="game-speed-setting"[\s\S]*?id="game-speed"[\s\S]*?id="replay"[\s\S]*?class="game-context-controls"[\s\S]*?id="free-transpose"/,
  );
  assert.equal((index.match(/id="game-speed"/g) ?? []).length, 1);
  assert.match(
    styles,
    /\.game-controls \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns:[\s\S]*?130px/,
  );
  assert.match(styles, /\.replay-button \{[\s\S]*?grid-column: 2/);
  assert.match(
    styles,
    /\.game-speed-control \{[\s\S]*?justify-self: start/,
  );
  assert.match(
    styles,
    /\.game-context-controls \{[\s\S]*?grid-column: 3;[\s\S]*?justify-self: end/,
  );
});

test("les écrans de mort subite et de réussite s’adaptent au paysage", () => {
  assert.match(
    styles,
    /@media \(orientation: landscape\) and \(max-height: 600px\)[\s\S]*?\.modal-layer \{[\s\S]*?safe-area-inset-right[\s\S]*?overflow-y: auto/,
  );
  assert.match(
    styles,
    /#sudden-death-modal \.sudden-death-card \{[\s\S]*?grid-template-columns:[\s\S]*?grid-template-areas:[\s\S]*?"symbol action"/,
  );
  assert.match(
    styles,
    /#challenge-complete-modal \.completion-card \{[\s\S]*?grid-template-columns:[\s\S]*?grid-template-areas:[\s\S]*?"home action"/,
  );
  assert.match(
    styles,
    /#sudden-death-modal \.modal-card,[\s\S]*?#challenge-complete-modal \.modal-card \{[\s\S]*?max-height: calc\(100dvh - 20px\);[\s\S]*?overflow-y: auto/,
  );
});

test("les transitions déclenchées par la dernière note attendent la fin du geste", () => {
  assert.match(app, /const COMPLETION_MODAL_DELAY_MS = 350/);
  assert.match(app, /const ROUND_ADVANCE_DELAY_MS = 720/);
  assert.match(
    app,
    /function scheduleRoundTransition\(callback\) \{[\s\S]*?window\.setTimeout\([\s\S]*?await callback\(\);[\s\S]*?ROUND_ADVANCE_DELAY_MS/,
  );
  assert.match(
    app,
    /function completeChallenge\(\) \{[\s\S]*?scheduleRoundTransition\(\(\) => \{[\s\S]*?challengeCompleteModal\.hidden = false/,
  );
  assert.match(
    app,
    /function failSuddenDeath\(\) \{[\s\S]*?scheduleRoundTransition\(async \(\) => \{[\s\S]*?loadChallengeRound\(\)/,
  );
  assert.match(
    app,
    /function finishExercise\(\) \{[\s\S]*?phase === "training"[\s\S]*?scheduleRoundTransition\(async \(\) => \{[\s\S]*?showSuddenDeathTransition\(\)[\s\S]*?phase === "sudden-death"[\s\S]*?scheduleRoundTransition\(async \(\) => \{[\s\S]*?loadChallengeRound\(\)[\s\S]*?scheduleCompletionModal\(\)/,
  );
});

test("le son public est uniquement synthétique", () => {
  assert.doesNotMatch(index, /id="melody-sound"|Clarinette|Piano<\/option>/);
  assert.match(app, /let melodySound = "synthetic"/);
  assert.match(
    app,
    /function loadSettings\(\)[\s\S]*?melodySound = "synthetic"/,
  );
  assert.match(
    app,
    /function playTone\([\s\S]*?if \(melodySound === "synthetic"\)[\s\S]*?playSyntheticTone/,
  );
  assert.doesNotMatch(app, /settings\.melodySound/);
  assert.match(app, /const path = `audio\/bass\/\$\{midi\}\.mp3`/);
});

test("la PWA embarque le nouveau moteur de session hors connexion", async () => {
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.name, "Jazz Solo Challenge");
  assert.equal(manifest.lang, "en");
  assert.equal(frenchManifest.lang, "fr");
  assert.equal(frenchManifest.name, manifest.name);
  assert.match(serviceWorker, /dictee-musicale-v38/);
  assert.match(index, /href="\.\/styles\.css\?v=38"/);
  assert.match(index, /src="\.\/src\/app\.js\?v=38"/);
  assert.match(serviceWorker, /\.\/styles\.css\?v=38/);
  assert.match(serviceWorker, /\.\/src\/app\.js\?v=38/);
  assert.match(serviceWorker, /\.\/src\/i18n\.js/);
  assert.match(serviceWorker, /\.\/manifest-fr\.webmanifest/);
  assert.match(serviceWorker, /\.\/src\/session\.js/);
  assert.doesNotMatch(serviceWorker, /CLARINET_SAMPLES|PIANO_SAMPLES/);
  assert.match(
    app,
    /navigator\.serviceWorker\.register\("\.\/sw\.js", \{ updateViaCache: "none" \}\)/,
  );

  await Promise.all(
    Array.from({ length: 21 }, (_, index) => index + 28).map(async (midi) => {
      const file = await stat(
        new URL(`../audio/bass/${midi}.mp3`, import.meta.url),
      );
      assert.ok(file.size > 0);
    }),
  );
});

test("l’installation est proposée directement sur Android et expliquée sur iOS", async () => {
  assert.match(index, /rel="apple-touch-icon" href="\.\/icon-180\.png"/);
  assert.match(
    index,
    /id="ios-install-modal"[\s\S]*?data-i18n="ios\.kicker">On iPhone and iPad[\s\S]*?data-i18n="ios\.share">Share[\s\S]*?data-i18n="ios\.addToHome">Add to Home Screen/,
  );
  assert.deepEqual(
    manifest.icons
      .filter(({ type }) => type === "image/png")
      .map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      { src: "./icon-192.png", sizes: "192x192", purpose: "any" },
      { src: "./icon-512.png", sizes: "512x512", purpose: "any" },
    ],
  );
  assert.match(app, /function isIosDevice\(\)/);
  assert.match(app, /navigator\.standalone === true/);
  assert.match(app, /window\.addEventListener\("beforeinstallprompt"/);
  assert.match(app, /window\.addEventListener\("appinstalled"/);
  assert.match(
    app,
    /if \(deferredInstallPrompt\) \{[\s\S]*?deferredInstallPrompt\.prompt\(\)[\s\S]*?\}[\s\S]*?if \(isIosDevice\(\)\) openIosInstallInstructions\(\)/,
  );

  for (const [filename, expectedSize] of [
    ["icon-180.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    const png = await readFile(new URL(`../${filename}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
    assert.match(serviceWorker, new RegExp(`\\.\\/${filename}`));
  }
});

test("l’icône reprend la palette de l’app sans l’artefact au-dessus de la hampe", () => {
  assert.match(icon, /<rect[^>]*fill="#11130f"/);
  assert.match(icon, /<circle[^>]*fill="#d8e56d"/);
  assert.match(icon, /<path d="M194 157v190/);
  assert.doesNotMatch(icon, /M194 139/);
});
