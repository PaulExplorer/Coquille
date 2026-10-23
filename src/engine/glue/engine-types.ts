/**
 * Minimal structural typing for the parts of the vendored Grammalecte engine
 * that our glue code touches. The engine itself is untyped JavaScript that is
 * never edited here, so structural declarations are used instead of trying to
 * write a hand-maintained .d.ts for the whole code base.
 */

export interface GrammalecteError {
  nStart: number;
  nEnd: number;
  sLineId: string;
  sRuleId: string;
  sType: string;
  aColor: string | undefined;
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

export interface EngineOptionsObject {
  [option: string]: boolean | string | number;
}

export interface GrammalecteEngineNamespace {
  _createError: unknown;
  parse(
    sParagraph: string,
    sCountry: string,
    bDebug: boolean,
    bOrder: unknown,
    bContext: boolean,
    bSentence?: boolean,
  ): GrammalecteError[] | [GrammalecteError[], unknown[]];
  oOptionsColors: Record<string, string> | null;
  oSpellChecker: SpellChecker | null;
  oTokenizer: Tokenizer | null;
  setOptions(options: Map<string, boolean>): void;
  getOptions(): Map<string, boolean>;
  getDefaultOptions(): Map<string, boolean>;
  resetOptions(): void;
}

export interface SpellChecker {
  constructor: { name: string };
  setMainDictionary(dictionary: unknown, sPath?: string): boolean;
  loadTokenizer(): void;
  getTokenizer(): Tokenizer;
  activateStorage(): void;
  parseParagraph(sText: string): GrammalecteSpellToken[];
  suggest(word: string, limit: number): Iterable<string[]>;
  activateCommunityDictionary(): void;
  deactivateCommunityDictionary(): void;
  setPersonalDictionary(dictionary: Record<string, string>): void;
}

export interface Tokenizer {
  genTokens(sText: string): Iterable<GrammalecteSpellToken>;
}

export interface EngineConfigNamespace {
  getOptions(): unknown;
}

export interface GrammalecteHelperNamespace {
  // Only the helpers we use; the vendored module carries more utilities.
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
