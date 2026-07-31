import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(
  new URL("../sw.js", import.meta.url),
  "utf8",
);
const corpusManifest = JSON.parse(
  await readFile(
    new URL(
      "../data/wjazzd-blocks/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const ORIGIN = "https://example.test/app/";
const CORPUS_CACHE_NAME =
  workerSource.match(
    /const CORPUS_CACHE = `\$\{CACHE_PREFIX\}corpus-([^`]+)`/,
  )?.[1];

function requestUrl(request) {
  return new URL(
    typeof request === "string" ? request : request.url,
    ORIGIN,
  ).toString();
}

class FakeResponse {
  constructor(body, { status = 200 } = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }

  clone() {
    return new FakeResponse(this.body, { status: this.status });
  }

  async json() {
    return JSON.parse(this.body);
  }
}

function createWorkerHarness({ fail = null } = {}) {
  const listeners = new Map();
  const cacheStores = new Map();
  const fetchCalls = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  function storeFor(name) {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    return cacheStores.get(name);
  }

  const caches = {
    async delete(name) {
      return cacheStores.delete(name);
    },
    async keys() {
      return [...cacheStores.keys()];
    },
    async open(name) {
      const store = storeFor(name);
      return {
        async match(request) {
          return store.get(requestUrl(request))?.clone() ?? null;
        },
        async put(request, response) {
          store.set(requestUrl(request), response.clone());
        },
      };
    },
  };

  const fetch = async (request) => {
    const url = requestUrl(request);
    fetchCalls.push(url);
    if (fail && url.includes(fail)) {
      return new FakeResponse("offline", { status: 503 });
    }
    if (url.endsWith("/data/wjazzd-blocks/manifest.json")) {
      return new FakeResponse(JSON.stringify(corpusManifest));
    }
    return new FakeResponse(`resource:${url}`);
  };

  const self = {
    clients: {
      async claim() {
        claimCalls += 1;
      },
    },
    location: new URL(`${ORIGIN}sw.js`),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
  };
  vm.runInNewContext(workerSource, {
    Array,
    Error,
    Map,
    Math,
    Promise,
    Set,
    URL,
    caches,
    fetch,
    self,
  });

  async function dispatchExtendable(type) {
    let promise = null;
    listeners.get(type)({
      waitUntil(value) {
        promise = Promise.resolve(value);
      },
    });
    await promise;
  }

  async function dispatchFetch(path, { mode = "same-origin" } = {}) {
    let responsePromise = null;
    const waits = [];
    const request = {
      method: "GET",
      mode,
      url: new URL(path, ORIGIN).toString(),
    };
    listeners.get("fetch")({
      request,
      respondWith(value) {
        responsePromise = Promise.resolve(value);
      },
      waitUntil(value) {
        waits.push(Promise.resolve(value));
      },
    });
    const response = await responsePromise;
    await Promise.all(waits);
    return response;
  }

  return {
    cacheStores,
    caches,
    dispatchExtendable,
    dispatchFetch,
    fetchCalls,
    get claimCalls() {
      return claimCalls;
    },
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
  };
}

test("l’installation atomique prépare l’interface et le corpus complet", async () => {
  assert.equal(
    CORPUS_CACHE_NAME,
    corpusManifest.corpusVersion.slice(0, 8),
  );
  const worker = createWorkerHarness();
  await worker.dispatchExtendable("install");

  assert.equal(worker.skipWaitingCalls, 1);
  const shell = worker.cacheStores.get(
    "dictee-musicale-shell-v52",
  );
  const corpus = worker.cacheStores.get(
    `dictee-musicale-corpus-${CORPUS_CACHE_NAME}`,
  );
  assert.ok(shell);
  assert.ok(corpus);
  assert.equal(corpus.size, 57);
  assert.equal(
    [...corpus.keys()].every((url) =>
      /\/data\/wjazzd-blocks\/block-\d{3}\.json$/.test(url)
    ),
    true,
  );
  assert.equal(
    [...shell.keys()].some((url) =>
      /wjazzd-(?:solos|chords)\.js$/.test(url)
    ),
    false,
  );
  assert.equal(
    [...shell.keys()].some((url) =>
      url.endsWith("/data/wjazzd-index.js")
    ),
    true,
  );
  assert.equal(
    [...shell.keys()].some((url) =>
      url.endsWith("/audio/parker/donna-lee.mp3")
    ),
    false,
  );
});

test("un échec de préchauffage conserve l’ancien worker actif", async () => {
  const worker = createWorkerHarness({ fail: "block-004.json" });
  await assert.rejects(
    worker.dispatchExtendable("install"),
    /block-004\.json: 503/,
  );
  assert.equal(worker.skipWaitingCalls, 0);
});

test("un bloc demandé est servi cache-first puis conservé", async () => {
  const worker = createWorkerHarness();
  const blockPath = "data/wjazzd-blocks/block-012.json";
  const first = await worker.dispatchFetch(blockPath);
  const afterFirst = worker.fetchCalls.length;
  const second = await worker.dispatchFetch(blockPath);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(worker.fetchCalls.length, afterFirst);
  assert.equal(
    worker.cacheStores.get(
      `dictee-musicale-corpus-${CORPUS_CACHE_NAME}`,
    ).size,
    1,
  );
});

test("l’activation ne supprime que les anciennes caches de l’application", async () => {
  const worker = createWorkerHarness();
  await worker.caches.open("dictee-musicale-shell-v45");
  await worker.caches.open("dictee-musicale-shell-v46");
  await worker.caches.open("dictee-musicale-shell-v47");
  await worker.caches.open("dictee-musicale-shell-v48");
  await worker.caches.open("dictee-musicale-shell-v49");
  await worker.caches.open("dictee-musicale-shell-v50");
  await worker.caches.open("dictee-musicale-shell-v51");
  await worker.caches.open("dictee-musicale-shell-v52");
  await worker.caches.open(
    `dictee-musicale-corpus-${CORPUS_CACHE_NAME}`,
  );
  await worker.caches.open("autre-application-v1");

  await worker.dispatchExtendable("activate");

  assert.deepEqual(
    new Set(await worker.caches.keys()),
    new Set([
      "dictee-musicale-shell-v52",
      `dictee-musicale-corpus-${CORPUS_CACHE_NAME}`,
      "autre-application-v1",
    ]),
  );
  assert.equal(worker.claimCalls, 1);
});
