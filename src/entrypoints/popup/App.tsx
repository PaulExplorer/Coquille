import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { callBackground } from '../../lib/messaging';
import type { BackgroundSettings, SiteStatus, TabStatus } from '../../lib/messages';
import { domainFromUrl } from '../../lib/sites';

export function App() {
  const [tabId, setTabId] = useState<number | undefined>(undefined);
  const [site, setSite] = useState<SiteStatus | undefined>(undefined);
  const [settings, setSettings] = useState<BackgroundSettings | undefined>(undefined);
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTabId = tab?.id;
        const domain = domainFromUrl(tab?.url ?? '');
        const [siteStatus, currentSettings, tabStatus] = await Promise.all([
          callBackground<SiteStatus>({ type: 'getSiteStatus', domain }),
          callBackground<BackgroundSettings>({ type: 'getSettings' }),
          callBackground<TabStatus>({ type: 'getTabStatus', tabId: activeTabId }),
        ]);
        setTabId(activeTabId);
        setSite(siteStatus);
        setSettings(currentSettings);
        setCount(tabStatus.lints);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, []);

  if (error !== undefined) {
    return (
      <div className="popup">
        <p className="popup__error">{error}</p>
      </div>
    );
  }
  if (site === undefined || settings === undefined || tabId === undefined) {
    return <div className="popup">Chargement…</div>;
  }

  const isOnPage = site.domain !== '';

  async function toggleMaster(): Promise<void> {
    const next = (settings as BackgroundSettings).globalEnabled !== true;
    const updated = await callBackground<BackgroundSettings>({
      type: 'setSettings',
      patch: { globalEnabled: next },
    });
    setSettings(updated);
    await refreshSite();
  }

  async function toggleSite(): Promise<void> {
    if (!isOnPage) return;
    const next = !(site as SiteStatus).effectiveEnabled;
    await callBackground({ type: 'setSiteEnabled', domain: (site as SiteStatus).domain, enabled: next });
    await refreshSite();
  }

  async function refreshSite(): Promise<void> {
    setSite(
      await callBackground<SiteStatus>({
        type: 'getSiteStatus',
        domain: (site as SiteStatus).domain,
      }),
    );
  }

  async function openPanel(): Promise<void> {
    if (tabId === undefined) {
      setError('Aucun onglet actif.');
      return;
    }
    try {
      await browser.tabs.sendMessage(tabId, { type: 'openReviewPanel' });
      window.close();
    } catch {
      setError('Aucun champ actif trouvé sur cette page.');
    }
  }

  return (
    <div className="popup">
      <header className="popup__head">
        <h1>Better Grammalecte</h1>
      </header>

      <label className="popup__row">
        <span>Correction activée</span>
        <input type="checkbox" checked={settings.globalEnabled === true} onChange={() => void toggleMaster()} />
      </label>

      <label className={`popup__row${isOnPage ? '' : ' popup__row--disabled'}`}>
        <span>{isOnPage ? `Sur ${site.domain}` : 'Inactive sur cette page'}</span>
        <input
          type="checkbox"
          disabled={!isOnPage || settings.globalEnabled !== true}
          checked={site.effectiveEnabled}
          onChange={() => void toggleSite()}
        />
      </label>

      <p className="popup__count">
        {count === 0 ? 'Aucune remarque dans le champ courant' : `${count} remarque${count > 1 ? 's' : ''} dans le champ courant`}
      </p>

      <button type="button" className="popup__action" onClick={() => void openPanel()}>
        Ouvrir le panneau de relecture
      </button>

      <button
        type="button"
        className="popup__action popup__action--secondary"
        onClick={() => void browser.runtime.openOptionsPage()}
      >
        Paramètres
      </button>
    </div>
  );
}
