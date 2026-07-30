import {
  DEFAULT_PERFORMERS,
  WJAZZD_BLOCKS,
  WJAZZD_CORPUS_VERSION,
  WJAZZD_INDEX_VERSION,
  WJAZZD_INDEX_SCHEMA_VERSION,
  WJAZZD_PERFORMERS,
  WJAZZD_PHRASE_INDEX_FIELDS,
  WJAZZD_SOLO_INDEX,
  WJAZZD_STRUCTURAL_EXCLUSIONS,
} from "../data/wjazzd-index.js";

export {
  DEFAULT_PERFORMERS,
  WJAZZD_CORPUS_VERSION,
  WJAZZD_INDEX_VERSION,
  WJAZZD_PERFORMERS,
  WJAZZD_SOLO_INDEX,
};

export const CORPUS_BLOCK_CACHE_LIMIT = 8;

const DATA_DIRECTORY_URL = new URL("../data/", import.meta.url);
const blockPromiseCache = new Map();
const soloIndexById = new Map(
  WJAZZD_SOLO_INDEX.map((solo) => [solo.id, solo]),
);

function phraseReference(phraseKey) {
  const key = String(phraseKey ?? "");
  const separator = key.lastIndexOf(":");
  if (separator <= 0 || separator === key.length - 1) return null;
  return {
    phraseKey: key,
    soloId: key.slice(0, separator),
    phraseNumber: key.slice(separator + 1),
  };
}

function blockDescriptor(blockNumber) {
  const descriptor = WJAZZD_BLOCKS[Number(blockNumber)];
  if (!descriptor) {
    throw new Error(`Bloc de corpus inconnu : ${blockNumber}`);
  }
  return descriptor;
}

function touchCachedBlock(key, promise) {
  blockPromiseCache.delete(key);
  blockPromiseCache.set(key, promise);
  while (blockPromiseCache.size > CORPUS_BLOCK_CACHE_LIMIT) {
    blockPromiseCache.delete(blockPromiseCache.keys().next().value);
  }
}

function validateBlock(block, descriptor) {
  if (
    !block ||
    block.schemaVersion !== WJAZZD_INDEX_SCHEMA_VERSION ||
    block.corpusVersion !== WJAZZD_CORPUS_VERSION ||
    block.blockId !== descriptor.id ||
    !Array.isArray(block.solos) ||
    !block.chords ||
    typeof block.chords !== "object"
  ) {
    throw new Error(`Bloc de corpus invalide : ${descriptor.id}`);
  }
  return block;
}

async function fetchBlock(descriptor, fetchImplementation) {
  if (typeof fetchImplementation !== "function") {
    throw new Error("Le chargement du corpus nécessite fetch().");
  }
  const url = new URL(descriptor.url, DATA_DIRECTORY_URL);
  const response = await fetchImplementation(url);
  if (!response || response.ok === false) {
    throw new Error(
      `Chargement du bloc ${descriptor.id} impossible` +
        (response?.status ? ` (HTTP ${response.status})` : ""),
    );
  }
  return validateBlock(await response.json(), descriptor);
}

async function loadBlock(
  blockNumber,
  { fetch: fetchImplementation = globalThis.fetch } = {},
) {
  const descriptor = blockDescriptor(blockNumber);
  const key = descriptor.id;
  const cached = blockPromiseCache.get(key);
  if (cached) {
    touchCachedBlock(key, cached);
    return cached;
  }

  const promise = fetchBlock(descriptor, fetchImplementation).catch(
    (error) => {
      if (blockPromiseCache.get(key) === promise) {
        blockPromiseCache.delete(key);
      }
      throw error;
    },
  );
  touchCachedBlock(key, promise);
  return promise;
}

export function clearCorpusBlockCache() {
  blockPromiseCache.clear();
}

export function decodePhraseIndex(soloIndex, tuple) {
  const fields = WJAZZD_PHRASE_INDEX_FIELDS;
  const phrase = String(tuple[fields.phrase]);
  const minimum = Number(tuple[fields.transpositionMinimum]);
  const exclusionCode = Number(tuple[fields.structuralExclusion]) || 0;
  const exclusionId = WJAZZD_STRUCTURAL_EXCLUSIONS[exclusionCode] ?? null;
  const structuralMetric = Number(tuple[fields.structuralMetric]);
  const fullPhraseNoteCount = Number(tuple[fields.fullPhraseNoteCount]);
  return {
    phraseKey: `${soloIndex.id}:${phrase}`,
    soloId: soloIndex.id,
    performer: soloIndex.performer,
    title: soloIndex.title,
    phrase,
    sourceUrl: soloIndex.sourceUrl,
    noteCount: Number(tuple[fields.noteCount]),
    fullPhraseNoteCount,
    transpositionRange: [minimum, minimum + 11],
    structuralExclusion: exclusionId
      ? {
          id: exclusionId,
          noteCount: fullPhraseNoteCount,
          rapidRunNotes:
            exclusionId === "rapid-run-v1" ? structuralMetric : null,
          rapidWindowNotes:
            exclusionId === "dense-burst-v1"
              ? structuralMetric
              : null,
        }
      : null,
  };
}

export function* phraseIndexEntries(selectedPerformers = null) {
  const selected = selectedPerformers
    ? new Set(selectedPerformers)
    : null;
  for (const solo of WJAZZD_SOLO_INDEX) {
    if (selected && !selected.has(solo.performer)) continue;
    for (const tuple of solo.phrases) {
      yield decodePhraseIndex(solo, tuple);
    }
  }
}

export function getPhraseIndex(phraseKey) {
  const reference = phraseReference(phraseKey);
  if (!reference) return null;
  const solo = soloIndexById.get(reference.soloId);
  if (!solo) return null;
  const tuple = solo.phrases.find(
    (candidate) =>
      String(candidate[WJAZZD_PHRASE_INDEX_FIELDS.phrase]) ===
      reference.phraseNumber,
  );
  return tuple ? decodePhraseIndex(solo, tuple) : null;
}

export async function loadPhraseCorpus(phraseKey, options = {}) {
  const reference = phraseReference(phraseKey);
  const soloIndex = reference
    ? soloIndexById.get(reference.soloId)
    : null;
  if (!reference || !soloIndex) {
    throw new Error(`Phrase de corpus inconnue : ${phraseKey}`);
  }
  const tuple = soloIndex.phrases.find(
    (candidate) =>
      String(candidate[WJAZZD_PHRASE_INDEX_FIELDS.phrase]) ===
      reference.phraseNumber,
  );
  if (!tuple) {
    throw new Error(`Phrase de corpus inconnue : ${phraseKey}`);
  }

  const block = await loadBlock(soloIndex.block, options);
  const solo = block.solos.find(
    (candidate) => candidate.id === reference.soloId,
  );
  const phrase = solo?.phrases?.find(
    (candidate) => String(candidate[2]) === reference.phraseNumber,
  );
  if (!solo || !phrase) {
    throw new Error(`Phrase absente de son bloc : ${phraseKey}`);
  }
  return {
    phraseKey: reference.phraseKey,
    solo,
    phrase,
    chords: block.chords[solo.id] ?? [],
    index: decodePhraseIndex(soloIndex, tuple),
  };
}

export async function loadAllCorpus({
  concurrency = 4,
  ...options
} = {}) {
  const safeConcurrency = Math.max(
    1,
    Math.min(WJAZZD_BLOCKS.length, Math.round(Number(concurrency)) || 1),
  );
  const loadedBlocks = new Array(WJAZZD_BLOCKS.length);
  let nextBlock = 0;

  async function worker() {
    while (nextBlock < WJAZZD_BLOCKS.length) {
      const blockNumber = nextBlock;
      nextBlock += 1;
      loadedBlocks[blockNumber] = await loadBlock(blockNumber, options);
    }
  }

  await Promise.all(
    Array.from({ length: safeConcurrency }, () => worker()),
  );
  const detailedById = new Map(
    loadedBlocks.flatMap((block) =>
      block.solos.map((solo) => [solo.id, solo]),
    ),
  );
  const solos = WJAZZD_SOLO_INDEX.map(({ id }) => detailedById.get(id));
  if (solos.some((solo) => !solo)) {
    throw new Error("Le corpus détaillé est incomplet.");
  }
  const chords = Object.fromEntries(
    solos.map((solo) => {
      const block = loadedBlocks[soloIndexById.get(solo.id).block];
      return [solo.id, block.chords[solo.id] ?? []];
    }),
  );
  return {
    corpusVersion: WJAZZD_CORPUS_VERSION,
    performers: WJAZZD_PERFORMERS,
    defaultPerformers: DEFAULT_PERFORMERS,
    solos,
    chords,
  };
}
