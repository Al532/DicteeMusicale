import {
  DEFAULT_JAZZ_TRANSPOSITION_RANGE,
  jazzTranspositionInRange,
  makeJazzTranspositionCycle,
  normalizeJazzTranspositionRange,
  pitchClass,
} from "./engine.js";

export const CHALLENGE_SCHEMA_VERSION = 2;
export const CHALLENGE_PHRASE_COUNT = 3;
export const TRAINING_TONES_PER_PHRASE = 3;

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function uniqueCatalog(catalog) {
  const seen = new Set();
  return catalog.filter((phrase) => {
    if (!phrase?.phraseKey || seen.has(phrase.phraseKey)) return false;
    seen.add(phrase.phraseKey);
    return true;
  });
}

export function dynamicLengthPools(catalog) {
  const sorted = uniqueCatalog(catalog ?? []).sort(
    (left, right) =>
      Number(left.noteCount) - Number(right.noteCount) ||
      left.phraseKey.localeCompare(right.phraseKey),
  );
  if (sorted.length < CHALLENGE_PHRASE_COUNT) {
    throw new Error("Il faut au moins trois phrases 3★ pour créer un défi.");
  }

  const lowerCutoff =
    sorted[Math.ceil(sorted.length / 3) - 1].noteCount;
  const upperCutoff =
    sorted[Math.ceil((sorted.length * 2) / 3) - 1].noteCount;
  let pools = [
    sorted.filter(({ noteCount }) => noteCount <= lowerCutoff),
    sorted.filter(
      ({ noteCount }) =>
        noteCount > lowerCutoff && noteCount <= upperCutoff,
    ),
    sorted.filter(({ noteCount }) => noteCount > upperCutoff),
  ];

  if (pools.some((pool) => !pool.length)) {
    const firstBreak = Math.ceil(sorted.length / 3);
    const secondBreak = Math.ceil((sorted.length * 2) / 3);
    pools = [
      sorted.slice(0, firstBreak),
      sorted.slice(firstBreak, secondBreak),
      sorted.slice(secondBreak),
    ];
  }

  return {
    pools,
    cutoffs: {
      shortMax: Number(lowerCutoff),
      mediumMax: Number(upperCutoff),
    },
  };
}

function pickDiverse(pool, count, alreadySelected, random) {
  const available = shuffle(pool, random);
  const selected = [...alreadySelected];
  const usedSolos = new Set(
    selected.map((phrase) => phrase.soloId).filter(Boolean),
  );

  while (selected.length < count && available.length) {
    let index = available.findIndex(
      (phrase) => phrase.soloId && !usedSolos.has(phrase.soloId),
    );
    if (index < 0) index = 0;
    const [phrase] = available.splice(index, 1);
    selected.push(phrase);
    if (phrase.soloId) usedSolos.add(phrase.soloId);
  }
  return selected;
}

export function selectChallengePhrases({
  catalog,
  completedPhraseKeys = [],
  random = Math.random,
} = {}) {
  const phrases = uniqueCatalog(catalog ?? []);
  if (phrases.length < CHALLENGE_PHRASE_COUNT) {
    throw new Error("Il faut au moins trois phrases 3★ pour créer un défi.");
  }

  const catalogKeys = new Set(phrases.map(({ phraseKey }) => phraseKey));
  const completed = new Set(
    completedPhraseKeys.filter((phraseKey) => catalogKeys.has(phraseKey)),
  );
  let selected = [];
  const resetPhraseKeys = [];
  const { pools, cutoffs } = dynamicLengthPools(phrases);

  for (const pool of pools) {
    let candidates = pool.filter(
      ({ phraseKey }) => !completed.has(phraseKey),
    );
    if (!candidates.length) {
      resetPhraseKeys.push(...pool.map(({ phraseKey }) => phraseKey));
      candidates = pool;
    }
    selected = pickDiverse(
      candidates,
      selected.length + 1,
      selected,
      random,
    );
  }

  return {
    phrases: selected.slice(0, CHALLENGE_PHRASE_COUNT),
    historyReset: resetPhraseKeys.length > 0,
    resetPhraseKeys: [...new Set(resetPhraseKeys)],
    lengthCutoffs: cutoffs,
  };
}

export function createTranspositionState(
  transpositionRange = DEFAULT_JAZZ_TRANSPOSITION_RANGE,
  {
    initialTransposition = null,
    random = Math.random,
  } = {},
) {
  const normalizedRange = normalizeJazzTranspositionRange(
    transpositionRange,
  );
  const state = {
    transpositionRange: normalizedRange,
    remainingTranspositions: [],
    lastTransposition: null,
    transpositionsUsed: [],
    cycleNumber: 0,
  };
  if (Number.isFinite(initialTransposition)) {
    const normalizedInitial = jazzTranspositionInRange(
      initialTransposition,
      normalizedRange,
    );
    state.remainingTranspositions = makeJazzTranspositionCycle({
      excludeTransposition: normalizedInitial,
      transpositionRange: normalizedRange,
      random,
    });
    state.lastTransposition = normalizedInitial;
    state.transpositionsUsed = [normalizedInitial];
    state.cycleNumber = 1;
  }
  return state;
}

export function retargetTranspositionState(
  state,
  transpositionRange,
  random = Math.random,
) {
  if (!state || typeof state !== "object") return state;
  const normalizedRange = normalizeJazzTranspositionRange(
    transpositionRange,
  );
  const mapToRange = (transposition) =>
    jazzTranspositionInRange(transposition, normalizedRange);
  const used = Array.isArray(state.transpositionsUsed)
    ? state.transpositionsUsed
        .filter(Number.isFinite)
        .map(mapToRange)
    : [];
  const usedInCycleCount = used.length % 12;
  const usedInCycle = new Set(
    usedInCycleCount ? used.slice(-usedInCycleCount).map(pitchClass) : [],
  );
  const remaining = [];
  const remainingPitchClasses = new Set();
  for (const transposition of Array.isArray(state.remainingTranspositions)
    ? state.remainingTranspositions
    : []) {
    if (!Number.isFinite(transposition)) continue;
    const mapped = mapToRange(transposition);
    const mappedPitchClass = pitchClass(mapped);
    if (
      usedInCycle.has(mappedPitchClass) ||
      remainingPitchClasses.has(mappedPitchClass)
    ) {
      continue;
    }
    remaining.push(mapped);
    remainingPitchClasses.add(mappedPitchClass);
  }
  if (usedInCycleCount || remaining.length) {
    const missing = makeJazzTranspositionCycle({
      transpositionRange: normalizedRange,
      random,
    }).filter((transposition) => {
      const candidatePitchClass = pitchClass(transposition);
      return (
        !usedInCycle.has(candidatePitchClass) &&
        !remainingPitchClasses.has(candidatePitchClass)
      );
    });
    remaining.push(...missing);
  }

  state.transpositionRange = normalizedRange;
  state.remainingTranspositions = remaining;
  state.lastTransposition = Number.isFinite(state.lastTransposition)
    ? mapToRange(state.lastTransposition)
    : null;
  state.transpositionsUsed = used;
  state.cycleNumber = Number.isInteger(state.cycleNumber)
    ? state.cycleNumber
    : 0;
  return state;
}

function createPhraseState(phrase) {
  return {
    phraseKey: phrase.phraseKey,
    soloId: phrase.soloId ?? null,
    performer: phrase.performer ?? "",
    title: phrase.title ?? "",
    noteCount: Number(phrase.noteCount) || null,
    ...createTranspositionState(phrase.transpositionRange),
  };
}

export function drawNextTransposition(phrase, random = Math.random) {
  if (!phrase.remainingTranspositions.length) {
    phrase.remainingTranspositions = makeJazzTranspositionCycle({
      avoidFirstTransposition: phrase.lastTransposition,
      transpositionRange: phrase.transpositionRange,
      random,
    });
    phrase.cycleNumber += 1;
  }

  const transposition = phrase.remainingTranspositions.shift();
  if (
    Number.isFinite(phrase.lastTransposition) &&
    phrase.transpositionsUsed.length % 12 !== 0 &&
    pitchClass(transposition) === pitchClass(phrase.lastTransposition)
  ) {
    throw new Error("Une tonalité ne peut pas être répétée dans un même cycle.");
  }
  phrase.lastTransposition = transposition;
  phrase.transpositionsUsed.push(transposition);
  return transposition;
}

export function createChallengeSession(
  phrases,
  {
    random = Math.random,
    now = () => new Date().toISOString(),
    id = globalThis.crypto?.randomUUID?.() ?? `challenge-${Date.now()}`,
  } = {},
) {
  if (!Array.isArray(phrases) || phrases.length !== CHALLENGE_PHRASE_COUNT) {
    throw new Error("Un défi doit contenir exactement trois phrases.");
  }
  const phraseKeys = new Set(phrases.map(({ phraseKey }) => phraseKey));
  if (phraseKeys.size !== CHALLENGE_PHRASE_COUNT || phraseKeys.has(undefined)) {
    throw new Error("Les trois phrases du défi doivent être distinctes.");
  }

  const createdAt = now();
  const session = {
    schemaVersion: CHALLENGE_SCHEMA_VERSION,
    id,
    createdAt,
    updatedAt: createdAt,
    phase: "training",
    phraseIndex: 0,
    toneIndex: 0,
    currentTransposition: null,
    suddenQueue: [],
    suddenCompleted: [],
    phrases: phrases.map(createPhraseState),
  };
  session.currentTransposition = drawNextTransposition(
    session.phrases[0],
    random,
  );
  return session;
}

export function currentChallengePhrase(session) {
  if (session?.phase === "training") {
    return session.phrases[session.phraseIndex] ?? null;
  }
  if (session?.phase === "sudden-death") {
    const phraseKey = session.suddenQueue[0];
    return (
      session.phrases.find((phrase) => phrase.phraseKey === phraseKey) ?? null
    );
  }
  return null;
}

export function advanceTraining(
  session,
  { random = Math.random, now = () => new Date().toISOString() } = {},
) {
  if (session?.phase !== "training") {
    throw new Error("La phase d’apprentissage n’est pas active.");
  }

  if (session.toneIndex + 1 < TRAINING_TONES_PER_PHRASE) {
    session.toneIndex += 1;
  } else if (session.phraseIndex + 1 < CHALLENGE_PHRASE_COUNT) {
    session.phraseIndex += 1;
    session.toneIndex = 0;
  } else {
    session.phase = "transition";
    session.currentTransposition = null;
    session.suddenQueue = session.phrases.map(({ phraseKey }) => phraseKey);
    session.updatedAt = now();
    return session;
  }

  session.currentTransposition = drawNextTransposition(
    session.phrases[session.phraseIndex],
    random,
  );
  session.updatedAt = now();
  return session;
}

export function beginSuddenDeath(
  session,
  { random = Math.random, now = () => new Date().toISOString() } = {},
) {
  if (session?.phase !== "transition") {
    throw new Error("La transition vers la mort subite n’est pas active.");
  }
  session.phase = "sudden-death";
  const phrase = currentChallengePhrase(session);
  session.currentTransposition = drawNextTransposition(phrase, random);
  session.updatedAt = now();
  return session;
}

export function resolveSuddenDeath(
  session,
  success,
  { random = Math.random, now = () => new Date().toISOString() } = {},
) {
  if (session?.phase !== "sudden-death" || !session.suddenQueue.length) {
    throw new Error("La mort subite n’est pas active.");
  }

  const phraseKey = session.suddenQueue.shift();
  if (success) {
    session.suddenCompleted.push(phraseKey);
  } else {
    session.suddenQueue.push(phraseKey);
  }

  if (!session.suddenQueue.length) {
    session.phase = "complete";
    session.currentTransposition = null;
    session.completedAt = now();
    session.updatedAt = session.completedAt;
    return session;
  }

  const phrase = currentChallengePhrase(session);
  session.currentTransposition = drawNextTransposition(phrase, random);
  session.updatedAt = now();
  return session;
}

export function isResumableChallengeSession(session, catalogPhraseKeys) {
  if (
    !session ||
    session.schemaVersion !== CHALLENGE_SCHEMA_VERSION ||
    !["training", "transition", "sudden-death"].includes(session.phase) ||
    !Array.isArray(session.phrases) ||
    session.phrases.length !== CHALLENGE_PHRASE_COUNT
  ) {
    return false;
  }
  const keys = new Set(session.phrases.map(({ phraseKey }) => phraseKey));
  if (keys.size !== CHALLENGE_PHRASE_COUNT) return false;
  if (
    session.phrases.some((phrase) => {
      const normalizedRange = normalizeJazzTranspositionRange(
        phrase.transpositionRange,
      );
      return (
        !Array.isArray(phrase.transpositionRange) ||
        phrase.transpositionRange.length !== 2 ||
        normalizedRange[0] !== phrase.transpositionRange[0] ||
        normalizedRange[1] !== phrase.transpositionRange[1] ||
        !Array.isArray(phrase.remainingTranspositions) ||
        !Array.isArray(phrase.transpositionsUsed) ||
        [...phrase.remainingTranspositions, ...phrase.transpositionsUsed].some(
          (transposition) =>
            !Number.isInteger(transposition) ||
            jazzTranspositionInRange(transposition, normalizedRange) !==
              transposition,
        )
      );
    })
  ) {
    return false;
  }
  if (catalogPhraseKeys) {
    const available = new Set(catalogPhraseKeys);
    if ([...keys].some((phraseKey) => !available.has(phraseKey))) return false;
  }
  if (
    session.phase === "training" &&
    (!Number.isInteger(session.phraseIndex) ||
      session.phraseIndex < 0 ||
      session.phraseIndex >= CHALLENGE_PHRASE_COUNT ||
      !Number.isInteger(session.toneIndex) ||
      session.toneIndex < 0 ||
      session.toneIndex >= TRAINING_TONES_PER_PHRASE ||
      !Number.isFinite(session.currentTransposition))
  ) {
    return false;
  }
  if (
    session.phase === "sudden-death" &&
    (!Array.isArray(session.suddenQueue) ||
      !session.suddenQueue.length ||
      session.suddenQueue.some((phraseKey) => !keys.has(phraseKey)) ||
      !Number.isFinite(session.currentTransposition))
  ) {
    return false;
  }
  if (
    Number.isFinite(session.currentTransposition) &&
    jazzTranspositionInRange(
      session.currentTransposition,
      currentChallengePhrase(session)?.transpositionRange,
    ) !== session.currentTransposition
  ) {
    return false;
  }
  return true;
}
