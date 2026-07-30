import test from "node:test";
import assert from "node:assert/strict";

import { pitchClass } from "../src/engine.js";
import {
  CHALLENGE_SCHEMA_VERSION,
  advanceTraining,
  beginSuddenDeath,
  createChallengeSession,
  createTranspositionState,
  currentChallengePhrase,
  drawNextTransposition,
  dynamicLengthPools,
  isResumableChallengeSession,
  retargetTranspositionState,
  resolveSuddenDeath,
  selectChallengePhrases,
} from "../src/session.js";

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function phrase(
  index,
  soloId = `solo-${index}`,
  noteCount = 12 + index,
  transpositionRange = [-5, 6],
) {
  return {
    phraseKey: `${soloId}:${index}`,
    soloId,
    performer: `Musicien ${index}`,
    title: `Morceau ${index}`,
    noteCount,
    transpositionRange,
  };
}

test("la sélection évite les phrases terminées et diversifie les solos", () => {
  const catalog = [
    phrase(1, "solo-a", 7),
    phrase(2, "solo-a", 8),
    phrase(3, "solo-b", 12),
    phrase(4, "solo-c", 16),
    phrase(5, "solo-d", 18),
  ];
  const completedPhraseKeys = [catalog[0].phraseKey];
  const selection = selectChallengePhrases({
    catalog,
    completedPhraseKeys,
    random: seededRandom(11),
  });

  assert.equal(selection.historyReset, false);
  assert.equal(selection.phrases.length, 3);
  assert.ok(
    selection.phrases.every(
      ({ phraseKey }) => !completedPhraseKeys.includes(phraseKey),
    ),
  );
  assert.equal(
    new Set(selection.phrases.map(({ soloId }) => soloId)).size,
    3,
  );
  assert.deepEqual(selection.lengthCutoffs, {
    shortMax: 8,
    mediumMax: 16,
  });
  assert.deepEqual(
    selection.phrases.map(({ noteCount }) => noteCount),
    [...selection.phrases.map(({ noteCount }) => noteCount)].sort(
      (left, right) => left - right,
    ),
  );
});

test("chaque catégorie de longueur repart seulement après son épuisement", () => {
  const catalog = [
    phrase(1, "solo-a", 6),
    phrase(2, "solo-b", 9),
    phrase(3, "solo-c", 11),
    phrase(4, "solo-d", 14),
    phrase(5, "solo-e", 16),
    phrase(6, "solo-f", 24),
  ];
  const completedPhraseKeys = catalog
    .slice(0, 2)
    .map(({ phraseKey }) => phraseKey);
  const selection = selectChallengePhrases({
    catalog,
    completedPhraseKeys,
    random: seededRandom(12),
  });

  assert.equal(selection.historyReset, true);
  assert.deepEqual(
    new Set(selection.resetPhraseKeys),
    new Set(completedPhraseKeys),
  );
  assert.ok(
    selection.phrases.some(
      ({ phraseKey }) => completedPhraseKeys.includes(phraseKey),
    ),
  );
  assert.equal(new Set(selection.phrases.map(({ phraseKey }) => phraseKey)).size, 3);
});

test("les limites court, moyen et long suivent les tiers du corpus réel", () => {
  const first = dynamicLengthPools([
    phrase(1, "a", 4),
    phrase(2, "b", 6),
    phrase(3, "c", 8),
    phrase(4, "d", 12),
    phrase(5, "e", 20),
    phrase(6, "f", 40),
  ]);
  const second = dynamicLengthPools([
    phrase(1, "a", 10),
    phrase(2, "b", 11),
    phrase(3, "c", 12),
    phrase(4, "d", 13),
    phrase(5, "e", 14),
    phrase(6, "f", 15),
  ]);

  assert.deepEqual(first.cutoffs, { shortMax: 6, mediumMax: 12 });
  assert.deepEqual(second.cutoffs, { shortMax: 11, mediumMax: 13 });
  assert.deepEqual(first.pools.map((pool) => pool.length), [2, 2, 2]);
  assert.deepEqual(second.pools.map((pool) => pool.length), [2, 2, 2]);
});

test("la phase normale enchaîne A-A-A, B-B-B, C-C-C", () => {
  const phrases = [
    phrase(1, "solo-1", 13, [0, 11]),
    phrase(2, "solo-2", 14, [-5, 6]),
    phrase(3, "solo-3", 15, [-11, 0]),
  ];
  const random = seededRandom(21);
  const session = createChallengeSession(phrases, {
    random,
    id: "session-test",
    now: () => "2026-07-29T00:00:00.000Z",
  });
  const rounds = [];

  while (session.phase === "training") {
    rounds.push({
      phraseKey: currentChallengePhrase(session).phraseKey,
      tone: session.currentTransposition,
    });
    advanceTraining(session, { random });
  }

  assert.deepEqual(
    rounds.map(({ phraseKey }) => phraseKey),
    [
      phrases[0].phraseKey,
      phrases[0].phraseKey,
      phrases[0].phraseKey,
      phrases[1].phraseKey,
      phrases[1].phraseKey,
      phrases[1].phraseKey,
      phrases[2].phraseKey,
      phrases[2].phraseKey,
      phrases[2].phraseKey,
    ],
  );
  for (const phraseState of session.phrases) {
    assert.equal(phraseState.transpositionsUsed.length, 3);
    assert.equal(
      new Set(phraseState.transpositionsUsed.map(pitchClass)).size,
      3,
    );
    assert.ok(
      phraseState.transpositionsUsed.every(
        (transposition) =>
          transposition >= phraseState.transpositionRange[0] &&
          transposition <= phraseState.transpositionRange[1],
      ),
    );
  }
  assert.equal(session.phase, "transition");
});

test("la mort subite fait revenir un échec plus tard dans un nouveau ton", () => {
  const phrases = [phrase(1), phrase(2), phrase(3)];
  const random = seededRandom(31);
  const session = createChallengeSession(phrases, { random });
  while (session.phase === "training") advanceTraining(session, { random });

  beginSuddenDeath(session, { random });
  const failedKey = currentChallengePhrase(session).phraseKey;
  const failedTone = session.currentTransposition;
  resolveSuddenDeath(session, false, { random });

  assert.notEqual(currentChallengePhrase(session).phraseKey, failedKey);
  resolveSuddenDeath(session, true, { random });
  resolveSuddenDeath(session, true, { random });
  assert.equal(currentChallengePhrase(session).phraseKey, failedKey);
  assert.notEqual(pitchClass(session.currentTransposition), pitchClass(failedTone));

  resolveSuddenDeath(session, true, { random });
  assert.equal(session.phase, "complete");
  assert.equal(session.suddenCompleted.length, 3);
});

test("chaque phrase épuise ses douze tons avant un nouveau cycle", () => {
  const state = createTranspositionState([0, 11]);
  const random = seededRandom(41);
  for (let index = 0; index < 25; index += 1) {
    drawNextTransposition(state, random);
  }

  const pitchClasses = state.transpositionsUsed.map(pitchClass);
  assert.equal(new Set(pitchClasses.slice(0, 12)).size, 12);
  assert.equal(new Set(pitchClasses.slice(12, 24)).size, 12);
  assert.notEqual(pitchClasses[11], pitchClasses[12]);
  assert.equal(state.cycleNumber, 3);
  assert.ok(
    state.transpositionsUsed.every(
      (transposition) => transposition >= 0 && transposition <= 11,
    ),
  );
});

test("un changement de tessiture remappe le cycle restant sans répéter de ton", () => {
  const state = createTranspositionState([-5, 6]);
  const random = seededRandom(45);
  for (let index = 0; index < 4; index += 1) {
    drawNextTransposition(state, random);
  }
  const usedPitchClasses = state.transpositionsUsed.map(pitchClass);
  const remainingPitchClasses =
    state.remainingTranspositions.map(pitchClass);

  retargetTranspositionState(state, [0, 11], random);

  assert.deepEqual(
    state.transpositionsUsed.map(pitchClass),
    usedPitchClasses,
  );
  assert.deepEqual(
    state.remainingTranspositions.map(pitchClass),
    remainingPitchClasses,
  );
  assert.ok(
    [...state.transpositionsUsed, ...state.remainingTranspositions].every(
      (transposition) => transposition >= 0 && transposition <= 11,
    ),
  );
  while (state.transpositionsUsed.length < 12) {
    drawNextTransposition(state, random);
  }
  assert.equal(
    new Set(state.transpositionsUsed.map(pitchClass)).size,
    12,
  );
});

test("une session sérialisée reste reprenable", () => {
  const phrases = [phrase(1), phrase(2), phrase(3)];
  const random = seededRandom(51);
  const session = createChallengeSession(phrases, { random });
  advanceTraining(session, { random });
  const restored = JSON.parse(JSON.stringify(session));

  assert.equal(
    isResumableChallengeSession(
      restored,
      phrases.map(({ phraseKey }) => phraseKey),
    ),
    true,
  );
  assert.equal(restored.schemaVersion, CHALLENGE_SCHEMA_VERSION);
  const obsolete = JSON.parse(JSON.stringify(restored));
  obsolete.schemaVersion = CHALLENGE_SCHEMA_VERSION - 1;
  assert.equal(
    isResumableChallengeSession(
      obsolete,
      phrases.map(({ phraseKey }) => phraseKey),
    ),
    false,
  );
  restored.phrases[0].phraseKey = "inconnue:1";
  assert.equal(
    isResumableChallengeSession(
      restored,
      phrases.map(({ phraseKey }) => phraseKey),
    ),
    false,
  );
});
