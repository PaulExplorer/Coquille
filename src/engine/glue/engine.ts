/**
 * Glue between the extension and the vendored Grammalecte engine.
 *
 * Initialization replicates the steps of upstream's own gce_worker.js with
 * one adaptation: MV3 service workers have no XHR, while the engine loads its
 * data files synchronously through helpers.loadFile. During initialization
 * only, that helper is patched with a synchronous cache filled beforehand
 * through the async resolver passed in.
 */

import * as bundleJs from "../grammalecte/_generated/engine_bundle.js";
import type { EngineBundleExports } from "./bundle-contract";
import * as offsets from "./offsets";
import type { OffsetMapper } from "./offsets";
import type {
  EngineOptionsObject,
  GrammalecteError,
  GrammalecteSpellToken,
  GrammalecteTextNamespace,
} from "./bundle-contract";

/** Internal export names of the generated bundle, typed in bundle-contract. */
export const BUNDLE = bundleJs as unknown as EngineBundleExports;

/** Path prefix of the runtime data copied by scripts/update_engine.py. */
const DATA_ROOT = "grammalecte/";
const MAIN_DICTIONARY_URL = `${DATA_ROOT}graphspell/_dictionaries/fr-allvars.json`;
const MAIN_DICTIONARY_DIR = `${DATA_ROOT}graphspell/_dictionaries`;
const MAX_PARAGRAPHS = 500;
const MAX_SPELL_SUGGESTIONS = 10;
/** Above this many misspelled words, suggestions are left empty (lazy). */
const MAX_EAGER_SPELLING_SUGGESTIONS = 25;
const SOFT_HYPHEN = "\u00AD";

export interface EngineDataResolver {
  /** Absolute or relative URL of a data file under the extension. */
  fetchJsonText(relativePath: string): Promise<string>;
}

export type LintKind = "grammar" | "spelling";

/** Engine analysis result, with offsets expressed in the raw input text. */
export interface RawLint {
  start: number;
  end: number;
  kind: LintKind;
  /** Engine identifier: sRuleId for grammar, the unknown word for spelling. */
  ruleId: string;
  message: string;
  url: string | undefined;
  /** Rule category color from the engine, if any. */
  color: string | undefined;
  /** Grammar: engine suggestions. Spelling: filled by spellingSuggestions. */
  suggestions: string[];
  /** Underlined text. */
  value: string;
}

export interface GrammalecteEngine {
  isReady(): boolean;
  /** Analyze a whole text, returning lints located in the incoming raw text. */
  lintText(text: string): Promise<RawLint[]>;
  /** Suggestions for an unknown word, priority on the last (personal) hit. */
  spellingSuggestions(word: string): Promise<string[]>;
  getOptions(): Record<string, boolean>;
  setOption(name: string, value: boolean): void;
  resetOptions(): void;
}

interface ParagraphSpan {
  start: number;
  end: number;
  text: string;
}

/** Split on line breaks while preserving offsets in the original text. */
function* splitParagraphs(text: string): IterableIterator<ParagraphSpan> {
  const pattern = /\r\n|\r|\n/g;
  let start = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    const end = match.index;
    yield { start, end, text: text.slice(start, end) };
    start = end + match[0].length;
    match = pattern.exec(text);
  }
  yield { start, end: text.length, text: text.slice(start) };
}

/** Normalize a paragraph the same way the engine does upstream. */
function normalizeParagraph(text: string): string {
  const softHyphenPattern = new RegExp(SOFT_HYPHEN, "g");
  return text.replace(softHyphenPattern, "").normalize("NFC");
}

export async function createGCEngine(resolver: EngineDataResolver): Promise<GrammalecteEngine> {
  // Data read before initialization, because the engine initializes its
  // dictionaries synchronously.
  const [dictionaryText, conjData, mfspData, phonetData] = await Promise.all([
    resolver.fetchJsonText(MAIN_DICTIONARY_URL),
    resolver.fetchJsonText(`${DATA_ROOT}fr/conj_data.json`),
    resolver.fetchJsonText(`${DATA_ROOT}fr/mfsp_data.json`),
    resolver.fetchJsonText(`${DATA_ROOT}fr/phonet_data.json`),
  ]);

  const fileCache = new Map<string, string>([
    [`${MAIN_DICTIONARY_DIR}/fr-allvars.json`, dictionaryText],
  ]);
  const originalLoader = BUNDLE.helpers.loadFile;
  try {
    BUNDLE.helpers.loadFile = (url: string): string => {
      const hit = fileCache.get(url);
      if (hit === undefined) {
        throw new Error(`Unexpected synchronous data load outside of init: ${url}`);
      }
      return hit;
    };
    BUNDLE.conj.init(conjData);
    BUNDLE.phonet.init(phonetData);
    BUNDLE.mfsp.init(mfspData);
    BUNDLE.gc_engine.load("JavaScript", "aHSL", MAIN_DICTIONARY_DIR);
    if (BUNDLE.gc_engine.oSpellChecker === null) {
      throw new Error("gc_engine.load failed to wire the spell checker");
    }
    BUNDLE.gc_engine.oSpellChecker.activateStorage();
  } finally {
    BUNDLE.helpers.loadFile = originalLoader;
  }

  const spellchecker = BUNDLE.gc_engine.oSpellChecker;

  const engine: GrammalecteEngine = {
    isReady: () => spellchecker !== null && !!BUNDLE.gc_engine.oTokenizer,

    async lintText(text) {
      const lints: RawLint[] = [];
      let paragraphIndex = 0;
      for (const paragraph of splitParagraphs(text)) {
        paragraphIndex += 1;
        if (paragraphIndex > MAX_PARAGRAPHS) break;
        const normalized = normalizeParagraph(paragraph.text);
        if (normalized.trim() === "") continue;
        const mapper = offsets.createOffsetMapper(paragraph.text, normalized);
        lints.push(...grammarLints(paragraph, normalized, mapper));
        lints.push(...spellingLints(paragraph, normalized, mapper));
      }
      return lints;
    },

    async spellingSuggestions(word) {
      if (spellchecker === null) return [];
      const groups = [...spellchecker.suggest(word, MAX_SPELL_SUGGESTIONS)];
      return groups.flat().slice(0, MAX_SPELL_SUGGESTIONS);
    },

    // Engine options are plain boolean toggles.
    getOptions: (): Record<string, boolean> =>
      BUNDLE.helpers.mapToObject(BUNDLE.gc_engine.getOptions()) as Record<string, boolean>,

    setOption(name, value) {
      BUNDLE.gc_engine.setOption(name, value);
    },

    resetOptions() {
      BUNDLE.gc_engine.resetOptions();
    },
  };

  return engine;
}

function mapGrammarError(
  paragraph: ParagraphSpan,
  mapper: OffsetMapper,
  error: GrammalecteError,
): RawLint | undefined {
  const localStart = mapper.rawOffset(error.nStart);
  const localEnd = mapper.rawOffset(error.nEnd);
  if (localStart >= localEnd) return undefined;
  const value = paragraph.text.slice(localStart, localEnd);
  if (value.trim() === "") return undefined;
  return {
    start: paragraph.start + localStart,
    end: paragraph.start + localEnd,
    kind: "grammar",
    ruleId: error.sRuleId,
    message: error.sMessage,
    url: error.URL === "" ? undefined : error.URL,
    color: error.aColor,
    suggestions: error.aSuggestions,
    value,
  };
}

function grammarLints(
  paragraph: ParagraphSpan,
  normalized: string,
  mapper: OffsetMapper,
): RawLint[] {
  const result = BUNDLE.gc_engine.parse(normalized, "FR", false, null, false);
  if (!Array.isArray(result) || (result.length > 0 && Array.isArray(result[0]))) {
    // parse(..., bSentence) was invoked: unexpected for our call shape.
    return [];
  }
  const errors = result as GrammalecteError[];
  const lints: RawLint[] = [];
  for (const error of errors) {
    const lint = mapGrammarError(paragraph, mapper, error);
    if (lint) lints.push(lint);
  }
  return lints;
}

function mapSpellToken(
  paragraph: ParagraphSpan,
  mapper: OffsetMapper,
  token: GrammalecteSpellToken,
): RawLint | undefined {
  const localStart = mapper.rawOffset(token.nStart);
  const localEnd = mapper.rawOffset(token.nEnd);
  if (localStart >= localEnd) return undefined;
  const value = paragraph.text.slice(localStart, localEnd);
  if (value.trim() === "") return undefined;
  return {
    start: paragraph.start + localStart,
    end: paragraph.start + localEnd,
    kind: "spelling",
    ruleId: token.sValue,
    message: "",
    url: undefined,
    color: undefined,
    suggestions: [],
    value,
  };
}

function spellingLints(
  paragraph: ParagraphSpan,
  normalized: string,
  mapper: OffsetMapper,
): RawLint[] {
  if (BUNDLE.gc_engine.oSpellChecker === null) return [];
  const tokens = BUNDLE.gc_engine.oSpellChecker.parseParagraph(normalized);
  const lints: RawLint[] = [];
  for (const token of tokens) {
    const lint = mapSpellToken(paragraph, mapper, token);
    if (lint) lints.push(lint);
  }
  const eagerSuggestions = lints.length <= MAX_EAGER_SPELLING_SUGGESTIONS;
  if (eagerSuggestions) {
    for (const lint of lints) {
      const groups = [...(BUNDLE.gc_engine.oSpellChecker?.suggest(lint.ruleId, MAX_SPELL_SUGGESTIONS) ?? [])];
      lint.suggestions = groups.flat().slice(0, MAX_SPELL_SUGGESTIONS);
    }
  }
  return lints;
}

export function fillSpellingSuggestions(
  engine: GrammalecteEngine,
  lint: RawLint,
): Promise<string[]> {
  return engine.spellingSuggestions(lint.ruleId);
}

// Reexport for consumers building engine-based UI copy.
export const textHelpers: GrammalecteTextNamespace = BUNDLE.text;
