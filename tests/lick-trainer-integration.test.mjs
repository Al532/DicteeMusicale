import test from "node:test";
import assert from "node:assert/strict";

import {
  installLickTrainerIntegration,
  isLickCompletionMessage,
  lickPatternId,
} from "../src/lick-trainer-integration.js";

class FakeStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

class FakeClassList {
  #values = new Set();

  constructor(notify) {
    this.notify = notify;
  }

  add(...values) {
    let changed = false;
    for (const value of values) {
      if (!this.#values.has(value)) {
        this.#values.add(value);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  contains(value) {
    return this.#values.has(value);
  }

  remove(...values) {
    let changed = false;
    for (const value of values) changed = this.#values.delete(value) || changed;
    if (changed) this.notify();
  }
}

class FakeElement extends EventTarget {
  #disabled = false;
  #hidden = false;
  #textContent = "";

  constructor(notify) {
    super();
    this.notify = notify;
    this.checked = false;
    this.className = "";
    this.classList = new FakeClassList(notify);
    this.insertedAfter = null;
  }

  get disabled() {
    return this.#disabled;
  }

  set disabled(value) {
    const next = Boolean(value);
    if (next === this.#disabled) return;
    this.#disabled = next;
    this.notify();
  }

  get hidden() {
    return this.#hidden;
  }

  set hidden(value) {
    const next = Boolean(value);
    if (next === this.#hidden) return;
    this.#hidden = next;
    this.notify();
  }

  get textContent() {
    return this.#textContent;
  }

  set textContent(value) {
    const next = String(value ?? "");
    if (next === this.#textContent) return;
    this.#textContent = next;
    this.notify();
  }

  after(node) {
    this.insertedAfter = node;
    this.notify();
  }

  click() {
    this.dispatchEvent(new Event("click", { bubbles: true }));
  }

  replaceChildren(...nodes) {
    this.textContent = nodes
      .map((node) => node?.textContent ?? String(node ?? ""))
      .join("");
  }
}

function createHarness() {
  const observers = new Set();
  let mutationQueued = false;
  const notify = () => {
    if (mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      for (const observer of observers) observer.callback();
    });
  };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }

    disconnect() {
      observers.delete(this);
    }

    observe() {
      observers.add(this);
    }
  }

  const selectors = [
    "#start-lick-exercise",
    "#developer-mode",
    "#open-favorites",
    "#next-exercise",
    "#free-transpose",
    "#feedback",
    "#exercise-kicker",
    "#progress-title",
    "#progress-detail",
  ];
  const elements = Object.fromEntries(
    selectors.map((selector) => [selector, new FakeElement(notify)]),
  );
  const body = new FakeElement(notify);
  const documentObject = {
    body,
    createTextNode(text) {
      return { textContent: String(text) };
    },
    querySelector(selector) {
      return elements[selector] ?? null;
    },
  };
  const windowObject = {
    Event,
    MutationObserver: FakeMutationObserver,
    clearTimeout,
    localStorage: new FakeStorage(),
    setTimeout,
  };
  return { documentObject, elements, windowObject };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
}

test("les helpers reconnaissent les fins et les identifiants de licks", () => {
  assert.equal(lickPatternId("V-03 · V · starts on 3"), "V-03");
  assert.equal(lickPatternId(""), null);
  assert.equal(isLickCompletionMessage("Lick complete. Next."), true);
  assert.equal(isLickCompletionMessage("Lick retrouvé. Suivant."), true);
  assert.equal(isLickCompletionMessage("Correct. Note 3 of 8."), false);
});

test("le bouton public enchaîne les licks sans fin ni répétition immédiate", async () => {
  const { documentObject, elements, windowObject } = createHarness();
  const button = elements["#start-lick-exercise"];
  const developerMode = elements["#developer-mode"];
  const openFavorites = elements["#open-favorites"];
  const nextExercise = elements["#next-exercise"];
  const freeTranspose = elements["#free-transpose"];
  const feedback = elements["#feedback"];
  const kicker = elements["#exercise-kicker"];
  const progressTitle = elements["#progress-title"];
  const progressDetail = elements["#progress-detail"];
  const developerChanges = [];
  let deck = [];
  let index = 0;
  let starts = 0;
  let nextClicks = 0;

  developerMode.addEventListener("change", () => {
    developerChanges.push(developerMode.checked);
  });
  button.addEventListener("click", () => {
    starts += 1;
    deck = starts === 1 ? ["I-01", "V-02"] : ["V-02", "II-03"];
    index = 0;
    documentObject.body.classList.add("game-mode");
    nextExercise.hidden = false;
    freeTranspose.hidden = false;
    progressDetail.hidden = false;
    kicker.textContent = "Lick exercise";
    progressTitle.textContent = `Lick ${index + 1} of ${deck.length}`;
    progressDetail.textContent = `${deck[index]} · V · starts on 3`;
    nextExercise.disabled = index >= deck.length - 1;
    feedback.textContent = "Your turn";
  });
  nextExercise.addEventListener("click", () => {
    nextClicks += 1;
    index += 1;
    nextExercise.hidden = false;
    freeTranspose.hidden = false;
    progressDetail.hidden = false;
    progressTitle.textContent = `Lick ${index + 1} of ${deck.length}`;
    progressDetail.textContent = `${deck[index]} · V · starts on 3`;
    nextExercise.disabled = index >= deck.length - 1;
    feedback.textContent = "Your turn";
  });

  const cleanup = installLickTrainerIntegration({
    documentObject,
    windowObject,
  });

  assert.equal(openFavorites.insertedAfter, button);
  assert.equal(button.textContent, "Lick trainer");
  assert.match(button.className, /lick-trainer-button/);

  button.click();
  await settle();

  assert.deepEqual(developerChanges, [true]);
  assert.equal(starts, 1);
  assert.equal(progressDetail.textContent.startsWith("I-01"), true);
  assert.equal(progressDetail.hidden, true);
  assert.equal(nextExercise.hidden, true);
  assert.equal(freeTranspose.hidden, true);
  assert.equal(kicker.textContent, "Lick trainer");
  assert.equal(progressTitle.textContent, "Lick 1");

  feedback.textContent = "Lick complete. Replay it or move on.";
  await settle();

  assert.equal(nextClicks, 1);
  assert.equal(progressDetail.textContent.startsWith("V-02"), true);
  assert.equal(progressTitle.textContent, "Lick 2");

  feedback.textContent = "Lick complete. End of set.";
  await settle();
  await settle();

  assert.equal(starts, 2);
  assert.equal(nextClicks, 2);
  assert.equal(progressDetail.textContent.startsWith("II-03"), true);
  assert.equal(progressTitle.textContent, "Lick 3");
  assert.equal(progressDetail.hidden, true);
  assert.equal(nextExercise.hidden, true);
  assert.equal(freeTranspose.hidden, true);

  documentObject.body.classList.remove("game-mode");
  await settle();
  assert.deepEqual(developerChanges, [true, false]);
  assert.equal(developerMode.checked, false);
  assert.equal(progressDetail.hidden, false);

  cleanup();
});

test("un mode développeur déjà actif utilise aussi le trainer public", async () => {
  const { documentObject, elements, windowObject } = createHarness();
  const button = elements["#start-lick-exercise"];
  const developerMode = elements["#developer-mode"];
  const nextExercise = elements["#next-exercise"];
  const freeTranspose = elements["#free-transpose"];
  const feedback = elements["#feedback"];
  const progressTitle = elements["#progress-title"];
  const progressDetail = elements["#progress-detail"];
  let nextClicks = 0;

  developerMode.checked = true;
  button.addEventListener("click", () => {
    documentObject.body.classList.add("game-mode");
    progressTitle.textContent = "Lick 1 of 2";
    progressDetail.textContent = "I-01 · I · starts on 3";
    nextExercise.hidden = false;
    freeTranspose.hidden = false;
    nextExercise.disabled = false;
    feedback.textContent = "Your turn";
  });
  nextExercise.addEventListener("click", () => {
    nextClicks += 1;
    progressTitle.textContent = "Lick 2 of 2";
    progressDetail.textContent = "V-02 · V · starts on 5";
    nextExercise.disabled = true;
    feedback.textContent = "Your turn";
  });

  const cleanup = installLickTrainerIntegration({
    documentObject,
    windowObject,
  });
  button.click();
  await settle();

  assert.equal(progressDetail.hidden, true);
  assert.equal(nextExercise.hidden, true);
  assert.equal(freeTranspose.hidden, true);
  assert.equal(progressTitle.textContent, "Lick 1");

  feedback.textContent = "Lick complete. Replay it or move on.";
  await settle();
  assert.equal(nextClicks, 1);
  assert.equal(progressTitle.textContent, "Lick 2");

  documentObject.body.classList.remove("game-mode");
  await settle();
  assert.equal(developerMode.checked, true);

  cleanup();
});
