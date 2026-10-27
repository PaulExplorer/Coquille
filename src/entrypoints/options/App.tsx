import { useEffect, useState, type JSX } from 'react';
import { callBackground } from '../../lib/messaging';
import type {
  BackgroundSettings,
  EngineOptionInfo,
  EngineOptionsPayload,
  EngineVersion,
} from '../../lib/messages';
import { normalizeDomain } from '../../lib/sites';

type TabId = 'general' | 'rules' | 'sites' | 'dictionary' | 'about';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'general', label: 'Général' },
  { id: 'rules', label: 'Règles' },
  { id: 'sites', label: 'Sites' },
  { id: 'dictionary', label: 'Exclusions' },
  { id: 'about', label: 'À propos' },
];

export function App() {
  const [tab, setTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<BackgroundSettings | undefined>(undefined);
  const [engine, setEngine] = useState<EngineOptionsPayload | undefined>(undefined);
  const [version, setVersion] = useState<EngineVersion | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      setSettings(await callBackground<BackgroundSettings>({ type: 'getSettings' }));
      setEngine(await callBackground<EngineOptionsPayload>({ type: 'getOptions' }));
      setVersion(await callBackground<EngineVersion>({ type: 'getEngineVersion' }));
    })();
  }, []);

  if (settings === undefined || engine === undefined) {
    return <div className="options">Chargement…</div>;
  }

  return (
    <div className="options">
      <header className="options__head">
        <h1>Coquille</h1>
        {version !== undefined ? (
          <span className="options__version">moteur Grammalecte {version.engineVersion}</span>
        ) : undefined}
      </header>

      <nav className="options__tabs">
        {TABS.map(entry => (
          <button
            key={entry.id}
            type="button"
            className={`options__tab${tab === entry.id ? ' options__tab--active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === 'general' ? <GeneralTab settings={settings} onChange={setSettings} /> : undefined}
      {tab === 'rules' ? <RulesTab engine={engine} /> : undefined}
      {tab === 'sites' ? <SitesTab settings={settings} onChange={setSettings} /> : undefined}
      {tab === 'dictionary' ? <DictionaryTab settings={settings} onChange={setSettings} /> : undefined}
      {tab === 'about' ? <AboutTab settings={settings} onChange={setSettings} /> : undefined}
    </div>
  );
}

/* --------------------------------- General -------------------------------- */

function GeneralTab(props: {
  settings: BackgroundSettings;
  onChange: (settings: BackgroundSettings) => void;
}): React.JSX.Element {
  const { settings } = props;
  async function patch(part: Partial<BackgroundSettings>): Promise<void> {
    props.onChange(
      await callBackground<BackgroundSettings>({ type: 'setSettings', patch: part }),
    );
  }

  return (
    <section>
      <h2>Général</h2>
      <label className="row">
        <span>Correction active</span>
        <input
          type="checkbox"
          checked={settings.globalEnabled}
          onChange={event => void patch({ globalEnabled: event.target.checked })}
        />
      </label>
      <label className="row">
        <span>Désactiver le correcteur du navigateur sur les champs analysés</span>
        <input
          type="checkbox"
          checked={settings.suppressNativeSpellcheck}
          onChange={event => void patch({ suppressNativeSpellcheck: event.target.checked })}
        />
      </label>
      <label className="row">
        <span>Corriger même quand le site a désactivé le correcteur (spellcheck)</span>
        <input
          type="checkbox"
          checked={settings.forceSpellcheck}
          onChange={event => void patch({ forceSpellcheck: event.target.checked })}
        />
      </label>
      <label className="row">
        <span>Délai d'analyse après la frappe (ms)</span>
        <input
          type="number"
          min={50}
          max={2000}
          step={50}
          value={settings.debounceMs}
          onChange={event => void patch({ debounceMs: Number(event.target.value) })}
        />
      </label>
      <label className="row">
        <span>Taille maximale analysée (caractères)</span>
        <input
          type="number"
          min={1000}
          step={1000}
          value={settings.maxTextLength}
          onChange={event => void patch({ maxTextLength: Number(event.target.value) })}
        />
      </label>
    </section>
  );
}

/* ---------------------------------- Rules --------------------------------- */

function RulesTab(props: { engine: EngineOptionsPayload }): React.JSX.Element {
  const { engine } = props;
  const [options, setOptions] = useState(engine.options);

  const groups: Array<{ category: EngineOptionInfo | undefined; items: EngineOptionInfo[] }> = [];
  for (const info of engine.infos) {
    if (options[info.name] === undefined) continue;
    if (info.isCategory) {
      groups.push({ category: info, items: [] });
    } else {
      let last = groups[groups.length - 1];
      if (last === undefined) {
        last = { category: undefined, items: [] };
        groups.push(last);
      }
      last.items.push(info);
    }
  }

  async function toggle(name: string, value: boolean): Promise<void> {
    setOptions(previous => ({ ...previous, [name]: value }));
    await callBackground({ type: 'setOption', option: name, value });
  }

  async function reset(): Promise<void> {
    const settings = await callBackground<BackgroundSettings>({ type: 'resetOptions' });
    void settings;
    const refreshed = await callBackground<EngineOptionsPayload>({ type: 'getOptions' });
    setOptions(refreshed.options);
  }

  return (
    <section>
      <h2>
        Règles du moteur{' '}
        <button type="button" className="small" onClick={() => void reset()}>
          Réinitialiser
        </button>
      </h2>
      {groups.map((group, index) => (
        <div key={group.category?.name ?? `group-${index}`}>
          {group.category !== undefined ? (
            <label className="row row--group">
              <span className="row__label">{group.category.label}</span>
              <input
                type="checkbox"
                checked={options[group.category.name] === true}
                onChange={event => void toggle(group.category?.name as string, event.target.checked)}
              />
            </label>
          ) : undefined}
          {group.items.map(item => (
            <label key={item.name} className="row">
              <span className="row__label" title={item.description}>
                {item.label}
                {item.description !== '' ? <small className="row__hint">{item.description}</small> : undefined}
              </span>
              <input
                type="checkbox"
                checked={options[item.name] === true}
                onChange={event => void toggle(item.name, event.target.checked)}
              />
            </label>
          ))}
        </div>
      ))}
    </section>
  );
}

/* ---------------------------------- Sites --------------------------------- */

function SitesTab(props: {
  settings: BackgroundSettings;
  onChange: (settings: BackgroundSettings) => void;
}): React.JSX.Element {
  const { settings } = props;
  const [draft, setDraft] = useState('');

  async function save(disabledSites: string[]): Promise<void> {
    props.onChange(await callBackground<BackgroundSettings>({ type: 'setSettings', patch: { disabledSites } }));
  }

  return (
    <section>
      <h2>Sites où la correction est désactivée</h2>
      <form
        className="add"
        onSubmit={event => {
          event.preventDefault();
          const domain = normalizeDomain(draft);
          if (domain === '' || settings.disabledSites.includes(domain)) return;
          void save([...settings.disabledSites, domain]);
          setDraft('');
        }}
      >
        <input
          type="text"
          placeholder="exemple.fr"
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
        <button type="submit">Ajouter</button>
      </form>
      {settings.disabledSites.length === 0 ? (
        <p className="empty">Aucun site désactivé.</p>
      ) : (
        <ul className="list">
          {settings.disabledSites.map(domain => (
            <li key={domain}>
              {domain}
              <button
                type="button"
                className="small"
                onClick={() => void save(settings.disabledSites.filter(entry => entry !== domain))}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Ajouter « exemple.fr » désactive aussi ses sous-domaines. Le bouton dans la popup ajoute le domaine du site
        courant.
      </p>
    </section>
  );
}

/* -------------------------------- Dictionary ------------------------------- */

function DictionaryTab(props: {
  settings: BackgroundSettings;
  onChange: (settings: BackgroundSettings) => void;
}): React.JSX.Element {
  const { settings } = props;
  const [wordDraft, setWordDraft] = useState('');

  async function save(part: Partial<BackgroundSettings>): Promise<void> {
    props.onChange(await callBackground<BackgroundSettings>({ type: 'setSettings', patch: part }));
  }

  return (
    <section>
      <h2>Mots ignorés</h2>
      <form
        className="add"
        onSubmit={event => {
          event.preventDefault();
          const word = wordDraft.trim();
          if (word === '' || settings.ignoredWords.includes(word)) return;
          void save({ ignoredWords: [...settings.ignoredWords, word] });
          setWordDraft('');
        }}
      >
        <input
          type="text"
          placeholder="mot accepté"
          value={wordDraft}
          onChange={event => setWordDraft(event.target.value)}
        />
        <button type="submit">Ajouter</button>
      </form>
      {settings.ignoredWords.length === 0 ? (
        <p className="empty">Aucun mot ignoré.</p>
      ) : (
        <ul className="list">
          {settings.ignoredWords.map(word => (
            <li key={word}>
              {word}
              <button
                type="button"
                className="small"
                onClick={() =>
                  void save({
                    ignoredWords: settings.ignoredWords.filter(entry => entry.toLowerCase() !== word.toLowerCase()),
                  })
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>Règles ignorées</h2>
      {settings.ignoredRules.length === 0 ? (
        <p className="empty">Aucune règle ignorée.</p>
      ) : (
        <ul className="list">
          {settings.ignoredRules.map(ruleId => (
            <li key={ruleId}>
              {ruleId}
              <button
                type="button"
                className="small"
                onClick={() =>
                  void save({ ignoredRules: settings.ignoredRules.filter(entry => entry !== ruleId) })
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Les mots et règles sont ici gérés globalement. Ils peuvent aussi être ignorés depuis le popover de correction.
      </p>
    </section>
  );
}

/* ---------------------------------- About --------------------------------- */

function AboutTab(props: {
  settings: BackgroundSettings;
  onChange: (settings: BackgroundSettings) => void;
}): React.JSX.Element {
  async function decrementRules(ruleId: string): Promise<void> {
    props.onChange(
      await callBackground<BackgroundSettings>({
        type: 'setSettings',
        patch: { ignoredRules: props.settings.ignoredRules.filter(entry => entry !== ruleId) },
      }),
    );
  }
  void decrementRules;

  return (
    <section>
      <h2>À propos</h2>
      <p>
        Extension « dérivée » de Grammalecte : elle conserve le moteur original (spell checking et règles
        grammaticales) et remplace l'interface par une correction inline directement dans les champs de texte.
      </p>
      <ul>
        <li>
          Moteur et règles :{' '}
          <a href="https://grammalecte.net/" target="_blank" rel="noreferrer">
            Grammalecte
          </a>{' '}
          (© Olivier R.), licence GPL-3.0-or-later.
        </li>
        <li>
          Approche du rendu inline (mesure miroir, boîtes, popover) inspirée de{' '}
          <a href="https://github.com/Automattic/harper" target="_blank" rel="noreferrer">
            Harper
          </a>{' '}
          (Automattic, Apache-2.0).
        </li>
      </ul>
      <p className="hint">
       Cette extension et son code sont distribués sous GPL-3.0-or-later ; les sources sont publiées pour
        transparence. Un court texte d'information sur l'aide apportée par l'IA figure dans le fichier README du
        dépôt.
      </p>
    </section>
  );
}
