/**
 * Option catalog: name, label and description for every engine option, taken
 * from the engine's own getOptionLabels("fr") so the wording stays that of
 * Grammalecte across engine updates.
 */

import { BUNDLE } from '../../engine/glue/engine';

/** Raw label entries: [label, description]; __optiontitle__ is a string. */
type EngineOptionLabels = Record<string, unknown>;

export interface EngineOptionInfo {
  name: string;
  label: string;
  description: string;
  /** True for category toggles (basic, gramm, verbs, style, misc…). */
  isCategory: boolean;
}

const CATEGORY_KEYS = new Set(['basic', 'gramm', 'verbs', 'style', 'misc']);

function labelsForFrench(): EngineOptionLabels {
  try {
    const raw = (
      BUNDLE.gc_options as unknown as {
        getOptionLabels?: (lang: string) => unknown;
      }
    ).getOptionLabels?.('fr');
    if (raw == null || typeof raw != 'object') return {};
    // The French table is returned directly for the 'fr' language code.
    if (typeof (raw as Record<string, unknown>)['__optiontitle__'] === 'string') {
      return raw as EngineOptionLabels;
    }
    const fr = (raw as Record<string, EngineOptionLabels>)['fr'];
    return typeof fr === 'object' && fr !== null ? fr : {};
  } catch {
    return {};
  }
}

export function optionCatalog(): EngineOptionInfo[] {
  const labels = labelsForFrench();
  const infos: EngineOptionInfo[] = [];
  for (const [key, value] of Object.entries(labels)) {
    if (key === '__optiontitle__' || !Array.isArray(value)) continue;
    infos.push({
      name: key,
      label: String(value[0] ?? key),
      description: String(value[1] ?? ''),
      isCategory: CATEGORY_KEYS.has(key),
    });
  }
  return infos;
}
