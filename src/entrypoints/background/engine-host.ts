import { browser } from 'wxt/browser';
import { createGCEngine, type EngineDataResolver, type GrammalecteEngine } from '../../engine/glue/engine';
import type { BackgroundSettings } from '../../lib/messages';
import { getURLUnchecked } from '../../lib/get-url';

/**
 * Lazy singleton around the engine. MV3 contexts (Chrome service worker,
 * Firefox event page) may be started and stopped at any time; everything is
 * kept in module scope so a fresh start re-initializes cleanly.
 */
class EngineHost {
  private engineInstance: GrammalecteEngine | undefined;
  private enginePromise: Promise<GrammalecteEngine> | undefined;

  /** Initialize (or reuse) the engine. */
  get(): Promise<GrammalecteEngine> {
    if (!this.enginePromise) {
      this.enginePromise = this.create().then(engine => {
        this.engineInstance = engine;
        return engine;
      });
    }
    return this.enginePromise;
  }

  /** The engine if it is already initialized, without forcing a start. */
  current(): GrammalecteEngine | undefined {
    return this.engineInstance;
  }

  private create(): Promise<GrammalecteEngine> {
    return createGCEngine(extensionResolver());
  }
}

function extensionResolver(): EngineDataResolver {
  return {
    async fetchJsonText(relativePath: string): Promise<string> {
      const response = await fetch(getURLUnchecked(relativePath));
      if (!response.ok) {
        throw new Error(`Failed to fetch engine data ${relativePath}: HTTP ${response.status}`);
      }
      return response.text();
    },
  };
}

export const engineHost = new EngineHost();

/** Push user option overrides into the engine after (re)initialization. */
export async function applyEngineOptions(
  engine: GrammalecteEngine,
  settings: BackgroundSettings,
): Promise<void> {
  for (const [name, value] of Object.entries(settings.engineOptions)) {
    engine.setOption(name, value === true);
  }
}
