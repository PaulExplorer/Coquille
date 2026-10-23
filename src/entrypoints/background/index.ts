import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { engineHost } from './engine-host';
import { serveRequests } from './server';

export default defineBackground(() => {
  const forgetTab = serveRequests(engineHost);
  void engineHost.get().catch(error => {
    // Initialization happens lazily again on the first lint request if it
    // fails here (for instance because the service worker was stopped).
    console.error('Better Grammalecte: engine warm-up failed', error);
  });
});
