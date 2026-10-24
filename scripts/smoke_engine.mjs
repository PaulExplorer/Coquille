/**
 * Standalone smoke test for the vendored engine: replicates the glue's
 * initialization in Node (worker-like globals: `self` set, `process` deleted
 * so upstream's CommonJS fallbacks stay dead) and checks a full parse
 * round-trip (grammar error, unknown-word detection, spell suggestions).
 *
 * Run: node scripts/smoke_engine.mjs
 *
 * Dev and CI only; never imported by the extension, and it never mutates the
 * repository: the engine reads its data from a read-only cache map.
 */
const nodeProcess = process;
globalThis.self = globalThis;
delete globalThis.process;

const BUNDLE = await import("../src/engine/grammalecte/_generated/engine_bundle.js");
const fs = await import("node:fs");
const path = await import("node:path");
const repo = path.dirname(path.dirname(new URL(import.meta.url).pathname));

const readJSONText = (rel) => fs.readFileSync(path.join(repo, "public", rel), "utf8");

const dictText = readJSONText("grammalecte/graphspell/_dictionaries/fr-allvars.json");
const dictUrl = "grammalecte/graphspell/_dictionaries/fr-allvars.json";

const cache = new Map([[dictUrl, dictText]]);
const originalLoader = BUNDLE.helpers.loadFile;
try {
  BUNDLE.helpers.loadFile = (url) => {
    const hit = cache.get(url);
    if (hit === undefined) throw new Error(`cache miss: ${url}`);
    return hit;
  };
  BUNDLE.conj.init(readJSONText("grammalecte/fr/conj_data.json"));
  BUNDLE.phonet.init(readJSONText("grammalecte/fr/phonet_data.json"));
  BUNDLE.mfsp.init(readJSONText("grammalecte/fr/mfsp_data.json"));
  BUNDLE.gc_engine.load("JavaScript", "aHSL", "grammalecte/graphspell/_dictionaries");
  if (BUNDLE.gc_engine.oSpellChecker === null) throw new Error("spell checker missing after load");
  BUNDLE.gc_engine.oSpellChecker.activateStorage();
} finally {
  BUNDLE.helpers.loadFile = originalLoader;
}

const text = "Je suit content de manger.";
const unknownWordText = "Un apalement bizarre au programme.";
const misspelled = BUNDLE.gc_engine.oSpellChecker.parseParagraph(unknownWordText);
const grammar = BUNDLE.gc_engine.parse(text, "FR", false, null, false);
console.log("grammar errors:");
for (const err of grammar) {
  console.log(
    `  [${err.nStart}:${err.nEnd}] ${err.sRuleId}: ${err.sMessage} → ${err.aSuggestions.join(" | ")}`,
  );
}
console.log(
  "misspelled tokens:",
  misspelled.map((t) => `${t.sValue}[${t.nStart}:${t.nEnd}]`).join(", ") || "(none)",
);
const suggestions = [...BUNDLE.gc_engine.oSpellChecker.suggest("apalement", 10)];
console.log('suggestions for "apalement":', suggestions.map((g) => g.join(" ")).join(" / "));
if (grammar.length === 0) {
  console.error("FAIL: expected grammar errors on the test sentence");
  nodeProcess.exit(1);
}
if (misspelled.length !== 1 || misspelled[0] === undefined || misspelled[0].sValue !== "apalement") {
  console.error('FAIL: expected the unknown word "apalement" to be flagged');
  nodeProcess.exit(1);
}
console.log("smoke: OK");
