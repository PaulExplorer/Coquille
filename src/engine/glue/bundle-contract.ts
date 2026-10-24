/**
 * Typed view of what the extension uses inside the vendored Grammalecte
 * engine bundle. The vendored code is untyped external JavaScript; these
 * structural declarations describe only the parts our glue touches. The
 * generated `engine_bundle.d.ts` re-exports this interface so importing the
 * bundle stays type-safe without type-checking the engine sources themselves.
 */

export interface EngineOptionsObject {
  [option: string]: boolean | string | number;
}

export interface GrammalecteError {
  nStart: number;
  nEnd: number;
  sLineId: string;
  sRuleId: string;
  sType: string;
  aColor: [number, number, number] | string | undefined;
  sMessage: string;
  aSuggestions: string[];
  URL: string;
}

export interface GrammalecteSpellToken {
  nStart: number;
  nEnd: number;
  sValue: string;
  sType: string;
}

export interface SpellChecker {
  setMainDictionary(dictionary: unknown, sPath?: string): boolean;
  loadTokenizer(): void;
  getTokenizer(): Tokenizer;
  activateStorage(): void;
  parseParagraph(sText: string): GrammalecteSpellToken[];
  suggest(word: string, limit: number): Iterable<string[]>;
}

export interface Tokenizer {
  genTokens(sText: string): Iterable<GrammalecteSpellToken>;
}

export interface GrammalecteHelperNamespace {
  loadFile(url: string): string;
  mapToObject(map: Map<string, boolean>): EngineOptionsObject;
  objectToMap(object: EngineOptionsObject): Map<string, boolean>;
}

export interface GrammalecteTextNamespace {
  getParagraph(sText: string, separator?: string): Iterable<string>;
  getReadableError(error: GrammalecteError): string;
}

export interface GrammalecteModuleNamespace {
  init(sJSONData: string): void;
}

export interface GrammalecteEngineNamespace {
  load(sContext: string, sColorType: string, sPath: string): void;
  parse(
    sText: string,
    sCountry: string,
    bDebug: boolean,
    bOrder: null | unknown,
    bContext: boolean,
    bSentence?: boolean,
  ): GrammalecteError[] | [GrammalecteError[], unknown[]];
  oSpellChecker: SpellChecker | null;
  oTokenizer: Tokenizer | null;
  oOptionsColors: Record<string, string> | null;
  setOption(sName: string, bValue: boolean): void;
  setOptions(options: Map<string, boolean>): void;
  getOptions(): Map<string, boolean>;
  getDefaultOptions(): Map<string, boolean>;
  resetOptions(): void;
}

export interface GrammalecteFunctionNamespace {
  load(sContext: string, oSpellChecker: SpellChecker): void;
}

export interface GrammalecteOptionsNamespace {
  load(sContext: string): void;
  getOptionsColors(sContext: string, sColorType: string): Record<string, string> | null;
}

/** Symbols exported by the generated engine bundle. */
export interface EngineBundleExports {
  helpers: GrammalecteHelperNamespace;
  text: GrammalecteTextNamespace;
  conj: GrammalecteModuleNamespace;
  phonet: GrammalecteModuleNamespace;
  mfsp: GrammalecteModuleNamespace;
  gc_engine: GrammalecteEngineNamespace;
  gc_functions: GrammalecteFunctionNamespace;
  gc_options: GrammalecteOptionsNamespace;
  SpellChecker: new (
    sLangCode: string,
    sPath: string,
    mainDic: string,
    communityDic: string,
    personalDic: string,
  ) => SpellChecker;
  IBDAWG: unknown;
  Tokenizer: unknown;
  thesaurus: GrammalecteModuleNamespace;
}
