import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  hasTranslation,
  localizeError,
  noteName,
  resolveLocale,
  translationKeys,
  translateFor,
} from "../src/i18n.js";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("le français suit la langue principale et l’anglais sert de repli", () => {
  assert.equal(resolveLocale("fr"), "fr");
  assert.equal(resolveLocale("fr-FR"), "fr");
  assert.equal(resolveLocale(["fr-CA", "en-US"]), "fr");
  assert.equal(resolveLocale("en-GB"), "en");
  assert.equal(resolveLocale("de-DE"), "en");
  assert.equal(resolveLocale(["de-DE", "fr-FR"]), "en");
  assert.equal(resolveLocale(), "en");
});

test("le document et le manifeste utilisent la langue système dès le chargement", () => {
  const setupScript = index.match(
    /<script>\s*([\s\S]*?primaryLanguage[\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(setupScript);

  for (const [systemLanguage, expectedLocale, expectedManifest] of [
    ["fr-FR", "fr", "./manifest-fr.webmanifest"],
    ["en-US", "en", "./manifest.webmanifest"],
    ["de-DE", "en", "./manifest.webmanifest"],
  ]) {
    const manifest = { href: "./manifest.webmanifest" };
    const context = {
      navigator: {
        languages: [systemLanguage],
        language: systemLanguage,
      },
      document: {
        documentElement: { lang: "en" },
        querySelector: () => manifest,
      },
    };
    context.globalThis = context;
    runInNewContext(setupScript, context);
    assert.equal(context.document.documentElement.lang, expectedLocale);
    assert.equal(context.__JAZZ_SOLO_LOCALE__, expectedLocale);
    assert.equal(manifest.href, expectedManifest);
  }
});

test("tous les textes statiques et dynamiques existent dans les deux langues", () => {
  const keys = new Set();
  for (const match of index.matchAll(
    /data-i18n(?:-aria-label|-title)?="([^"]+)"/g,
  )) {
    keys.add(match[1]);
  }
  for (const match of app.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
    keys.add(match[1]);
  }

  assert.ok(keys.size > 80);
  for (const key of keys) {
    assert.equal(hasTranslation("en", key), true, `traduction anglaise : ${key}`);
    assert.equal(hasTranslation("fr", key), true, `traduction française : ${key}`);
  }
  assert.deepEqual(translationKeys("fr"), translationKeys("en"));
});

test("les messages variables et les noms de notes sont localisés", () => {
  assert.equal(
    translateFor("en", "session.training", { phrase: 2, tone: 3 }),
    "Session in progress · phrase 2 of 3, key 3 of 3.",
  );
  assert.equal(
    translateFor("fr", "session.training", { phrase: 2, tone: 3 }),
    "Session en cours · phrase 2 sur 3, ton 3 sur 3.",
  );
  assert.equal(noteName(0, "en"), "C");
  assert.equal(noteName(0, "fr"), "Do");
  assert.equal(noteName(10, "en"), "B♭");
  assert.equal(noteName(10, "fr"), "Si♭");
  assert.equal(
    localizeError("Sélectionne au moins un musicien.", "en"),
    "Select at least one musician.",
  );
});
