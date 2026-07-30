import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const engine = await readFile(
  new URL("../src/engine.js", import.meta.url),
  "utf8",
);
const session = await readFile(
  new URL("../src/session.js", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const pagesWorkflow = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);
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

test("le mode développeur ajoute seulement ses trois actions à l’accueil", () => {
  assert.match(
    index,
    /class="developer-home-actions"[\s\S]*?data-developer-only[\s\S]*?hidden[\s\S]*?id="start-rating"[\s\S]*?id="start-review"[\s\S]*?id="export-data"/,
  );
  assert.doesNotMatch(
    index,
    /developer-lab|start-real|start-random|musician-picker|minimum-rating/,
  );
  assert.doesNotMatch(
    app,
    /renderPerformerOptions|let selectedPerformers|let randomLength|let minimumRating|elements\.minimumRating/,
  );
  assert.match(index, /id="developer-mode" type="checkbox"/);
  assert.match(app, /function renderDeveloperMode\(\)/);
  assert.match(
    app,
    /elements\.developerMode\.closest\("details"\)\?\.removeAttribute\("open"\)/,
  );
});

test("les réglages de phrase sont accessibles pendant le jeu mais pas dans le feedback final", () => {
  assert.match(
    index,
    /id="phrase-adjustments"[\s\S]*?id="phrase-length-decrease"[\s\S]*?id="phrase-length-output"[\s\S]*?id="phrase-length-increase"[\s\S]*?id="short-notes-decrease"[\s\S]*?id="short-notes-output"[\s\S]*?id="short-notes-increase"/,
  );
  assert.match(index, /id="exercise-rating"/);
  assert.doesNotMatch(index, /id="completion-rating"/);
  assert.match(
    app,
    /function renderPhraseControls\(\)[\s\S]*?developerMode[\s\S]*?fullPhraseNoteCount[\s\S]*?phraseSettingsLocked\(\)/,
  );
  assert.match(
    styles,
    /\.developer-mode\.game-mode \.developer-game-control:not\(\[hidden\]\) \{[\s\S]*?display: flex/,
  );
});

test("la notation rapide écoute d’abord toute la phrase puis permet de poser sa fin", () => {
  assert.match(
    index,
    /id="set-phrase-end"[\s\S]*?data-i18n="rating\.setEnd">End here/,
  );
  assert.match(
    app,
    /const useFullQuickRatingPreview =[\s\S]*?isRatingMode[\s\S]*?fullPhrase: useFullQuickRatingPreview/,
  );
  assert.match(
    app,
    /function setQuickRatingPhraseEnd\(\)[\s\S]*?exercise\.playbackStartedAt[\s\S]*?exercise\.timings\.filter[\s\S]*?saveCurrentPhraseSettings/,
  );
  assert.match(
    app,
    /quickRatingFullPreview: useFullQuickRatingPreview/,
  );
});

test("la revue parcourt les phrases 3 étoiles avec compteur et navigation", () => {
  assert.match(
    index,
    /id="review-navigation"[\s\S]*?id="review-previous"[\s\S]*?id="review-counter"[\s\S]*?id="review-next"/,
  );
  assert.match(
    app,
    /function threeStarReviewCatalog\(\)[\s\S]*?minimumRating: 3/,
  );
  assert.match(
    app,
    /function renderReviewProgress\(\)[\s\S]*?reviewPhraseIndex \+ 1[\s\S]*?reviewPrevious\.disabled[\s\S]*?reviewNext\.disabled/,
  );
  assert.match(
    app,
    /function refreshReviewAfterRating\(\)[\s\S]*?threeStarReviewCatalog\(\)[\s\S]*?startExercise/,
  );
});

test("l’export réunit étoiles, longueur et notes brèves", () => {
  assert.match(
    app,
    /function exportData\(\)[\s\S]*?"notes_max"[\s\S]*?"notes_courtes_ignorees"[\s\S]*?"reglages_mise_a_jour"/,
  );
  assert.match(
    app,
    /new Set\(\[[\s\S]*?Object\.keys\(phraseRatings\)[\s\S]*?Object\.keys\(phraseSettings\)/,
  );
  assert.match(index, /data-i18n="developer\.exportData">Export data/);
});

test("les statistiques de progression et leur collecte ont disparu", () => {
  assert.doesNotMatch(index, /Statistiques|Progression|stat-(?:exercises|notes|accuracy|response)/);
  assert.doesNotMatch(index, /export-csv|export-json|reset-stats|import-json/);
  assert.doesNotMatch(app, /renderStats|summarizeRecords|STORAGE_KEY|records\.push|exportCsv|resetStats/);
  assert.doesNotMatch(
    app,
    /attempts:|replayCount:|guessStartedAt:|responseMs:|startedAt:|completedAt:/,
  );
  assert.doesNotMatch(index, /score|points/i);
});

test("le défi utilise uniquement le catalogue 3★ et les réglages propres à chaque phrase", () => {
  assert.match(
    app,
    /const PHRASE_SETTINGS_KEY = "dictee-musicale\.phrase-settings\.v1"/,
  );
  assert.match(app, /const REAL_MAX_NOTES = DEFAULT_PHRASE_MAX_NOTES/);
  assert.match(
    app,
    /function challengeCatalog\(\)[\s\S]*?jazzPhraseCatalog\(\{[\s\S]*?phraseSettings,[\s\S]*?minimumRating: 3/,
  );
  assert.match(
    app,
    /function loadPublicPhrase\([\s\S]*?maxNotes: REAL_MAX_NOTES,[\s\S]*?phraseSettings,[\s\S]*?minimumRating: isChallenge \? 3 : 0/,
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

test("la fenêtre de douze tons suit la tessiture dans tous les modes", () => {
  assert.match(
    engine,
    /JAZZ_TRANSPOSITION_TARGET_MIDI = 66[\s\S]*?DEFAULT_JAZZ_TRANSPOSITION_RANGE = Object\.freeze\(\[-5, 6\]\)/,
  );
  assert.match(
    engine,
    /function jazzTranspositionRangeForNotes\([\s\S]*?phraseCenter[\s\S]*?windowCenterOffset = 5\.5[\s\S]*?return \[minimum, minimum \+ 11\]/,
  );
  assert.match(
    engine,
    /function jazzPhraseCatalog\([\s\S]*?applyPhraseSettingsToEvents[\s\S]*?transpositionRange: jazzTranspositionRangeForNotes/,
  );
  assert.match(
    engine,
    /const transpositionRange = jazzTranspositionRangeForNotes\(excerpt\.notes\)[\s\S]*?randomJazzTransposition\(random, transpositionRange\)/,
  );
  assert.match(session, /export const CHALLENGE_SCHEMA_VERSION = 2/);
  assert.match(
    session,
    /function createPhraseState\(phrase\)[\s\S]*?createTranspositionState\(phrase\.transpositionRange\)/,
  );
  assert.match(
    app,
    /function startFreePhrase\(phraseKey\)[\s\S]*?createTranspositionState\([\s\S]*?catalogMap\(\)\.get\(phraseKey\)\?\.transpositionRange/,
  );
  assert.match(
    app,
    /const transpositionRange =[\s\S]*?generated\.meta\.source\.transpositionRange[\s\S]*?jazzTranspositionRangeForNotes\(originalNotes\)[\s\S]*?createTranspositionState\(transpositionRange/,
  );
  assert.match(
    app,
    /function reloadCurrentPhraseWithSettings\(\)[\s\S]*?retargetTranspositionState\([\s\S]*?transpositionRange/,
  );
  assert.doesNotMatch(
    app,
    /function transposeSameExercise|keyboardLayoutForNotes|voiceBassHits/,
  );
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

test("le mode normal masque les détails internes mais expose les originaux disponibles", () => {
  assert.match(index, /id="source-summary" hidden/);
  assert.match(
    app,
    /elements\.sourceSummary\.append\([\s\S]*?performer,[\s\S]*?document\.createTextNode\(` — \$\{source\.title\}`\)/,
  );
  assert.match(
    app,
    /elements\.sourceLine\.hidden =[\s\S]*?!developerMode[\s\S]*?currentMode === "challenge"[\s\S]*?currentMode === "free"[\s\S]*?currentMode === "review"/,
  );
  assert.match(
    index,
    /class="original-controls" id="original-controls" hidden[\s\S]*?id="play-original"[\s\S]*?id="transpose-original"[\s\S]*?id="audio-source-link"[\s\S]*?source\.youtubeRecording/,
  );
  assert.match(
    app,
    /const recordingUrl = recordingUrlAtPhrase\(source\)[\s\S]*?elements\.originalControls\.hidden = !hasOriginalAudio && !recordingUrl/,
  );
  assert.doesNotMatch(
    app,
    /elements\.originalControls\.hidden =\s*isRatingMode \|\| isReviewMode/,
  );
});

test("l’accueil accepte le portrait et seul le jeu avec piano demande une rotation", () => {
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.home-panel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /\.home-panel \{[\s\S]*?grid-template-columns:[\s\S]*?min-height: 100dvh/,
  );
  assert.match(app, /function showHome\(\) \{[\s\S]*?classList\.add\("home-view"\)/);
  assert.match(
    styles,
    /\.game-mode main \{[\s\S]*?height: var\(--game-viewport-height, 100dvh\)/,
  );
  assert.match(
    styles,
    /\.game-mode \.exercise-panel \{[\s\S]*?grid-template-rows:[\s\S]*?minmax\(110px, 1fr\)/,
  );
  assert.match(styles, /\.piano \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.game-mode:not\(\.rating-mode\) \.rotate-overlay/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.home-view \.rotate-overlay/,
  );
  assert.match(app, /function buildPiano\(layout\)/);
  assert.match(app, /--white-key-count/);
});

test("la hauteur du jeu suit le viewport visible pendant les rotations", () => {
  assert.match(
    app,
    /function syncGameViewportHeight\(\) \{[\s\S]*?window\.visualViewport\?\.height \?\? window\.innerHeight[\s\S]*?--game-viewport-height/,
  );
  assert.match(
    app,
    /function scheduleGameViewportSync\(\) \{[\s\S]*?VIEWPORT_SYNC_DELAYS_MS\.map/,
  );
  assert.match(
    app,
    /window\.addEventListener\("orientationchange", scheduleGameViewportSync\)/,
  );
  assert.match(
    app,
    /window\.visualViewport\?\.addEventListener\([\s\S]*?"resize",[\s\S]*?scheduleGameViewportSync/,
  );
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
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.developer-mode\.rating-mode \.game-controls \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 110px[\s\S]*?\.developer-mode\.rating-mode \.game-context-controls \{[\s\S]*?grid-column: 1 \/ -1/,
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
    /#sudden-death-modal \.modal-card,[\s\S]*?#challenge-complete-modal \.modal-card \{[\s\S]*?max-height: calc\(var\(--game-viewport-height, 100dvh\) - 20px\);[\s\S]*?overflow-y: auto/,
  );
});

test("les transitions déclenchées par la dernière note attendent la fin du geste", () => {
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
    /function finishExercise\(\) \{[\s\S]*?phase === "training"[\s\S]*?scheduleRoundTransition\(async \(\) => \{[\s\S]*?showSuddenDeathTransition\(\)[\s\S]*?phase === "sudden-death"[\s\S]*?scheduleRoundTransition\(async \(\) => \{[\s\S]*?loadChallengeRound\(\)/,
  );
  assert.doesNotMatch(
    app,
    /COMPLETION_MODAL_DELAY_MS|scheduleCompletionModal|completionModal/,
  );
  assert.doesNotMatch(index, /id="completion-modal"/);
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
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.name, "Jazz Solo Challenge");
  assert.equal(manifest.lang, "en");
  assert.equal(manifest.id, "./");
  assert.equal(frenchManifest.lang, "fr");
  assert.equal(frenchManifest.id, manifest.id);
  assert.equal(frenchManifest.name, manifest.name);
  assert.equal(frenchManifest.orientation, "any");
  assert.match(serviceWorker, /dictee-musicale-v43/);
  assert.match(index, /href="\.\/styles\.css\?v=43"/);
  assert.match(index, /src="\.\/src\/app\.js\?v=43"/);
  assert.match(serviceWorker, /\.\/styles\.css\?v=43/);
  assert.match(serviceWorker, /\.\/src\/app\.js\?v=43/);
  assert.match(serviceWorker, /\.\/src\/i18n\.js/);
  assert.match(serviceWorker, /\.\/src\/recording\.js/);
  assert.match(serviceWorker, /\.\/manifest-fr\.webmanifest/);
  assert.match(serviceWorker, /\.\/src\/session\.js/);
  assert.match(serviceWorker, /\.\/src\/phrase-settings\.js/);
  assert.match(serviceWorker, /\.\/data\/default-phrase-settings\.js/);
  assert.match(
    serviceWorker,
    /event\.request\.mode === "navigate"[\s\S]*?caches[\s\S]*?\.match\("\.\/index\.html"\)/,
  );
  assert.match(
    serviceWorker,
    /caches\.match\(event\.request\)[\s\S]*?if \(cachedResponse\) return cachedResponse;[\s\S]*?fetch\(event\.request\)/,
  );
  assert.doesNotMatch(serviceWorker, /mustRevalidate|cache: "no-store"/);
  assert.match(
    serviceWorker,
    /Promise\.allSettled\([\s\S]*?ESSENTIAL_SHELL[\s\S]*?missingEssential/,
  );
  assert.doesNotMatch(serviceWorker, /cache\.addAll\(APP_SHELL\)/);
  assert.doesNotMatch(serviceWorker, /\.\/audio\/parker\//);
  assert.doesNotMatch(serviceWorker, /CLARINET_SAMPLES|PIANO_SAMPLES/);
  assert.match(
    app,
    /navigator\.serviceWorker[\s\S]*?\.register\("\.\/sw\.js", \{ updateViaCache: "none" \}\)[\s\S]*?\.catch/,
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

test("GitHub Pages ne publie qu’après les contrôles automatisés", () => {
  assert.match(
    pagesWorkflow,
    /run: npm ci[\s\S]*?run: npm run check[\s\S]*?run: npm test[\s\S]*?uses: actions\/deploy-pages@v4/,
  );
  assert.match(
    pagesWorkflow,
    /mkdir _site[\s\S]*?src[\s\S]*?data[\s\S]*?audio[\s\S]*?path: _site/,
  );
  assert.doesNotMatch(pagesWorkflow, /path: \./);
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
