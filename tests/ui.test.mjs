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

test("l’accueil public est centré sur un seul Défi 3×3", () => {
  assert.match(index, /<title>Sur les traces des maîtres du jazz — Défi 3×3<\/title>/);
  assert.match(index, /id="home-title">Écoute\. Transpose\./);
  assert.match(index, /<h2>Défi 3×3<\/h2>/);
  assert.match(
    index,
    /<strong>3<\/strong> phrases[\s\S]*?<strong>3<\/strong> tons[\s\S]*?<strong>1<\/strong> mort subite/,
  );
  assert.match(index, /id="start-challenge"[\s\S]*?Commencer/);
  assert.match(index, /id="resume-challenge" hidden[\s\S]*?Reprendre/);
  assert.match(index, /id="open-favorites"[\s\S]*?Mode libre/);
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
  assert.match(app, /Phrase \$\{challengeSession\.phraseIndex \+ 1\} sur 3/);
  assert.match(app, /Ton \$\{challengeSession\.toneIndex \+ 1\} sur 3/);
  assert.match(index, /id="progress-dots"/);
});

test("la mort subite autorise les réécoutes avant l’unique tentative", () => {
  assert.match(index, /id="sudden-death-title">Mort subite<\/h2>/);
  assert.match(
    index,
    /Réécoute autant que nécessaire[\s\S]*?Dès ta première note, tu n’as qu’une\s+tentative/,
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
  assert.match(index, /id="free-transpose" hidden[\s\S]*?Autre ton/);
  assert.match(app, /const FAVORITES_KEY = "dictee-musicale\.favorites\.v1"/);
  assert.match(app, /function toggleCurrentFavorite\(\)/);
  assert.match(app, /function renderFavorites\(\)/);
  assert.match(app, /function startFreePhrase\(phraseKey\)/);
  assert.match(app, /function transposeFreePhrase\(\)/);
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

test("le piano occupe l’espace de jeu et le portrait demande une rotation", () => {
  assert.match(styles, /\.game-mode main \{[\s\S]*?height: 100dvh/);
  assert.match(
    styles,
    /\.game-mode \.exercise-panel \{[\s\S]*?grid-template-rows:[\s\S]*?minmax\(110px, 1fr\)/,
  );
  assert.match(styles, /\.piano \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
  assert.match(
    styles,
    /@media \(orientation: portrait\)[\s\S]*?\.game-mode:not\(\.rating-mode\) \.rotate-overlay/,
  );
  assert.match(app, /function buildPiano\(layout\)/);
  assert.match(app, /--white-key-count/);
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

test("la lecture et le clavier conservent les instruments samplés", () => {
  assert.match(
    index,
    /id="melody-sound"[\s\S]*?value="synthetic">Synthétique[\s\S]*?value="clarinet">Clarinette[\s\S]*?value="piano">Piano/,
  );
  assert.match(
    app,
    /clarinet: \{[\s\S]*?minMidi: 50,[\s\S]*?maxMidi: 92,[\s\S]*?headSeconds: 0\.025/,
  );
  assert.match(
    app,
    /piano: \{[\s\S]*?minMidi: 36,[\s\S]*?maxMidi: 96,[\s\S]*?headSeconds: 0/,
  );
  assert.match(app, /const path = `audio\/\$\{sound\}\/\$\{sampleMidi\}\.mp3`/);
  assert.match(app, /const path = `audio\/bass\/\$\{midi\}\.mp3`/);
});

test("la PWA embarque le nouveau moteur de session hors connexion", async () => {
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  assert.match(serviceWorker, /dictee-musicale-v33/);
  assert.match(index, /href="\.\/styles\.css\?v=33"/);
  assert.match(index, /src="\.\/src\/app\.js\?v=33"/);
  assert.match(serviceWorker, /\.\/styles\.css\?v=33/);
  assert.match(serviceWorker, /\.\/src\/app\.js\?v=33/);
  assert.match(serviceWorker, /\.\/src\/session\.js/);
  assert.match(
    app,
    /navigator\.serviceWorker\.register\("\.\/sw\.js", \{ updateViaCache: "none" \}\)/,
  );

  await Promise.all(
    Array.from({ length: 43 }, (_, index) => index + 50).map(async (midi) => {
      const file = await stat(
        new URL(`../audio/clarinet/${midi}.mp3`, import.meta.url),
      );
      assert.ok(file.size > 0);
    }),
  );
  await Promise.all(
    Array.from({ length: 61 }, (_, index) => index + 36).map(async (midi) => {
      const file = await stat(
        new URL(`../audio/piano/${midi}.mp3`, import.meta.url),
      );
      assert.ok(file.size > 0);
    }),
  );
});
