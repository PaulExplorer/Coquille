import { browser } from 'wxt/browser';
import type { BackgroundSettings, EngineVersion } from './messages';
import { getURLUnchecked } from './get-url';

const SETTINGS_SCHEMA = 'better-grammalecte/settings';

export const DEFAULT_SETTINGS: BackgroundSettings = {
  globalEnabled: true,
  disabledSites: [],
  debounceMs: 300,
  maxTextLength: 40_000,
  engineOptions: {},
  ignoredWords: [],
  ignoredRules: [],
};

function sanitize(raw: unknown): BackgroundSettings {
  if (raw == null || typeof raw != 'object') return { ...DEFAULT_SETTINGS };
  const candidate = raw as Partial<BackgroundSettings>;
  return {
    globalEnabled: typeof candidate.globalEnabled == 'boolean' ? candidate.globalEnabled : DEFAULT_SETTINGS.globalEnabled,
    disabledSites: Array.isArray(candidate.disabledSites)
      ? candidate.disabledSites.filter(entry => typeof entry == 'string')
      : [...DEFAULT_SETTINGS.disabledSites],
    debounceMs: typeof candidate.debounceMs == 'number' && candidate.debounceMs >= 0 ? candidate.debounceMs : DEFAULT_SETTINGS.debounceMs,
    maxTextLength: typeof candidate.maxTextLength == 'number' && candidate.maxTextLength > 0 ? candidate.maxTextLength : DEFAULT_SETTINGS.maxTextLength,
    engineOptions: candidate.engineOptions != null && typeof candidate.engineOptions == 'object'
      ? { ...candidate.engineOptions } as Record<string, boolean>
      : { ...DEFAULT_SETTINGS.engineOptions },
    ignoredWords: Array.isArray(candidate.ignoredWords) ? [...candidate.ignoredWords] : [],
    ignoredRules: Array.isArray(candidate.ignoredRules) ? [...candidate.ignoredRules] : [],
  };
}

export async function loadSettings(): Promise<BackgroundSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_SCHEMA);
  const raw = (stored as Record<string, unknown>)[SETTINGS_SCHEMA];
  return sanitize(raw);
}

export async function saveSettings(settings: BackgroundSettings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_SCHEMA]: settings });
}

/** Subscribe to any settings change (any context of the extension). */
export function watchSettings(listener: (settings: BackgroundSettings) => void): () => void {
  const onChange = (
    changes: Record<string, unknown>,
    area: string,
  ): void => {
    if (area != 'sync' || !(SETTINGS_SCHEMA in changes)) return;
    listener(sanitize((changes as Record<string, unknown>)[SETTINGS_SCHEMA]));
  };
  browser.storage.onChanged.addListener(onChange as never);
  return () => browser.storage.onChanged.removeListener(onChange as never);
}

export async function loadEngineVersion(): Promise<EngineVersion> {
  const url = getURLUnchecked('grammalecte/ENGINE_VERSION.json');
  const response = await fetch(url);
  return (await response.json()) as EngineVersion;
}
