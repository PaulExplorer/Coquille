/**
 * Typed message contract between the background, the content scripts, the
 * popup and the options page. All calls go through lib/messaging.ts helpers,
 * with a single response envelope.
 */

export interface SiteStatus {
  /** Master switch of the extension. */
  globalEnabled: boolean;
  /** Effective state for the domain: globalEnabled && !disabled. */
  effectiveEnabled: boolean;
  domain: string;
}

export interface BackgroundSettings {
  globalEnabled: boolean;
  disabledSites: string[];
  debounceMs: number;
  maxTextLength: number;
  engineOptions: Record<string, boolean>;
  ignoredWords: string[];
  ignoredRules: string[];
  /** Turn off the browser's own spellcheck on fields we analyze. */
  suppressNativeSpellcheck: boolean;
}

export interface LintDto {
  /** Offsets in the text sent for analysis. */
  start: number;
  end: number;
  kind: 'grammar' | 'spelling' | 'style';
  ruleId: string;
  message: string;
  url: string | undefined;
  suggestions: string[];
  value: string;
}

export interface LintBatch {
  lints: LintDto[];
  /** True when the text exceeded the analysis limit and was checked partially. */
  truncated: boolean;
}

export interface TabStatus {
  lints: number;
}

export type BackgroundRequest =
  | { type: 'lintText'; text: string }
  | { type: 'spellingSuggestions'; word: string }
  | { type: 'getSiteStatus'; domain: string }
  | { type: 'setSiteEnabled'; domain: string; enabled: boolean }
  | { type: 'getSettings' }
  | { type: 'setSettings'; patch: Partial<BackgroundSettings> }
  | { type: 'getOptions' }
  | { type: 'setOption'; option: string; value: boolean }
  | { type: 'resetOptions' }
  | { type: 'ignoreWord'; word: string }
  | { type: 'unignoreWord'; word: string }
  | { type: 'ignoreRule'; ruleId: string }
  | { type: 'reportLintCount'; count: number }
  | { type: 'getTabStatus'; tabId?: number }
  | { type: 'getEngineVersion' };

export interface BackgroundResponse<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/** Option catalog built from the engine's own getOptionLabels. */
export interface EngineOptionInfo {
  name: string;
  label: string;
  description: string;
  /** True for category toggles (basic, gramm, verbs, style, misc…). */
  isCategory: boolean;
}

export interface EngineOptionsPayload {
  options: Record<string, boolean>;
  infos: EngineOptionInfo[];
}

export interface EngineVersion {
  engineVersion: string;
  packagedAt: string;
}
