import { browser } from 'wxt/browser';
import type { GrammalecteEngine, RawLint } from '../../engine/glue/engine';
import { applyEngineOptions } from './engine-host';
import {
  isSubdomainOf,
  normalizeDomain,
} from '../../lib/sites';
import type {
  BackgroundRequest,
  BackgroundSettings,
  EngineOptionInfo,
  EngineOptionsPayload,
  EngineVersion,
  LintBatch,
  LintDto,
  SiteStatus,
  TabStatus,
} from '../../lib/messages';
import { serveBackgroundRequests } from '../../lib/messaging';
import { loadEngineVersion, loadSettings, saveSettings } from '../../lib/storage';
import { optionCatalog } from './option-catalog';

export interface EngineHostLike {
  get(): Promise<GrammalecteEngine>;
  current(): GrammalecteEngine | undefined;
}

/**
 * Request router shared by the content scripts, the popup and the options
 * page. Returns a function that clears the state of one tab (used when tabs
 * are closed).
 */
export function serveRequests(engineHost: EngineHostLike): (tabId: number) => void {
  const lintCounts = new Map<number, number>();
  let settingsPromise: Promise<BackgroundSettings> | null = null;

  const getSettings = (): Promise<BackgroundSettings> =>
    (settingsPromise ??= loadSettings());

  const onTabRemoved = (tabId: number): void => {
    lintCounts.delete(tabId);
  };
  browser.tabs.onRemoved.addListener(onTabRemoved);

  serveBackgroundRequests(async (request, sender) => {
    switch (request.type) {
      case 'lintText': {
        const settings = await getSettings();
        const engine = await engineHost.get();
        await applyEngineOptions(engine, settings);
        const truncated = request.text.length > settings.maxTextLength;
        const rawLints = await engine.lintText(request.text.slice(0, settings.maxTextLength));
        const lints: LintDto[] = filterLints(rawLints, settings).map(toDto);
        return { lints, truncated } satisfies LintBatch;
      }

      case 'spellingSuggestions': {
        const engine = await engineHost.get();
        return engine.spellingSuggestions(request.word);
      }

      case 'getSiteStatus': {
        const domain = normalizeDomain(request.domain);
        const settings = await getSettings();
        return {
          domain,
          globalEnabled: settings.globalEnabled,
          effectiveEnabled: settings.globalEnabled && !isDisabled(domain, settings),
        } satisfies SiteStatus;
      }

      case 'setSiteEnabled': {
        const domain = normalizeDomain(request.domain);
        if (domain === '') throw new Error('Cannot configure an unknown site');
        const settings = await getSettings();
        // Drop every entry matching the domain or one of its parents so the
        // change is applied exactly once from the global default.
        const entries = settings.disabledSites.filter(entry => !isSubdomainOf(domain, entry));
        if (!request.enabled) {
          entries.push(domain);
        }
        settings.disabledSites = [...new Set(entries)];
        await saveSettings(settings);
        return { domain };
      }

      case 'getSettings':
        return getSettings();

      case 'setSettings': {
        const settings = await getSettings();
        const merged: BackgroundSettings = { ...settings, ...request.patch };
        await saveSettings(merged);
        return merged;
      }

      case 'setOption': {
        const settings = await getSettings();
        settings.engineOptions = {
          ...settings.engineOptions,
          [request.option]: request.value,
        };
        await saveSettings(settings);
        const engine = engineHost.current();
        if (engine) engine.setOption(request.option, request.value);
        return settings;
      }

      case 'resetOptions': {
        const settings = await getSettings();
        settings.engineOptions = {};
        await saveSettings(settings);
        const engine = engineHost.current();
        if (engine) engine.resetOptions();
        return settings;
      }

      case 'ignoreWord': {
        const settings = await getSettings();
        const word = request.word.trim();
        if (word !== '' && !settings.ignoredWords.some(entry => entry.toLowerCase() === word.toLowerCase())) {
          settings.ignoredWords.push(word);
          await saveSettings(settings);
        }
        return settings;
      }

      case 'unignoreWord': {
        const settings = await getSettings();
        settings.ignoredWords = settings.ignoredWords.filter(
          entry => entry.toLowerCase() !== request.word.toLowerCase(),
        );
        await saveSettings(settings);
        return settings;
      }

      case 'ignoreRule': {
        const settings = await getSettings();
        if (!settings.ignoredRules.includes(request.ruleId)) {
          settings.ignoredRules.push(request.ruleId);
          await saveSettings(settings);
        }
        return settings;
      }

      case 'reportLintCount': {
        if (sender.tabId != null) lintCounts.set(sender.tabId, request.count);
        return lintCounts.get(sender.tabId ?? -1) ?? 0;
      }

      case 'getTabStatus': {
        const lookup = request.tabId ?? sender.tabId;
        const count = lookup != null ? (lintCounts.get(lookup) ?? 0) : 0;
        return { lints: count } satisfies TabStatus;
      }

      case 'getOptions': {
        const engine = await engineHost.get();
        return {
          options: engine.getOptions(),
          infos: optionCatalog(),
        } satisfies EngineOptionsPayload;
      }

      case 'getEngineVersion':
        return loadEngineVersion() as Promise<EngineVersion>;

      default: {
        const unhandled: never = request;
        throw new Error(`Unknown request type: ${unhandled satisfies never}`);
      }
    }
  });

  return onTabRemoved;
}

function isDisabled(domain: string, settings: BackgroundSettings): boolean {
  return settings.disabledSites.some(entry => isSubdomainOf(domain, entry));
}

function filterLints(lints: RawLint[], settings: BackgroundSettings): RawLint[] {
  const ignoredWords = new Set(settings.ignoredWords.map(word => word.toLowerCase()));
  const ignoredRules = new Set(settings.ignoredRules);
  return lints.filter(lint =>
    lint.kind === 'spelling'
      ? !ignoredWords.has(lint.ruleId.toLowerCase())
      : !ignoredRules.has(lint.ruleId));
}

function toDto(lint: RawLint): LintDto {
  return {
    start: lint.start,
    end: lint.end,
    kind: lint.kind,
    ruleId: lint.ruleId,
    message: lint.message,
    url: lint.url,
    color: lint.color,
    suggestions: lint.suggestions,
    value: lint.value,
  };
}
