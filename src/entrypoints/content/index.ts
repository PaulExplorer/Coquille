/**
 * Content script entry point: builds the content session so every supported
 * editable field gets in-place underlines and suggestions, and exposes the
 * review panel opening hook used by the extension popup.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { ContentSession } from '../../content/session';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // Reach text fields inside iframes (embeddable editors, Sandpack-style
  // playgrounds, forum composers): each frame runs the same lazy,
  // focus-driven session, so the cost is a handful of listeners per frame
  // until a field has the focus.
  allFrames: true,
  main(ctx) {
    const session = new ContentSession();
    session.attachActiveField();

    // Popup entry point: open the fallback review panel for this page.
    const onMessage = (
      raw: unknown,
      _sender: unknown,
      respond: (response: { ok: boolean }) => void,
    ): boolean | undefined => {
      const message = raw as { type?: string } | null;
      if (message?.type !== 'openReviewPanel') return undefined;
      session.openReviewPanel();
      respond({ ok: true });
      return false;
    };
    browser.runtime.onMessage.addListener(onMessage as never);

    ctx.onInvalidated(() => {
      try {
        browser.runtime.onMessage.removeListener(onMessage as never);
      } finally {
        session.destroy();
      }
    });
  },
});
