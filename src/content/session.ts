/**
 * Content session: one live field at a time is linted and underlined.
 *
 * Flow: focus a supported field -> per-site check -> immediate lint (then
 * debounced on input) -> engine lints rendered as underline boxes in a
 * viewport shadow layer -> click a box to open the suggestion popover ->
 * applying a suggestion rewrites the field through the native editing
 * pipeline, which retriggers a lint.
 *
 * Rendering follows the approach of Harper's lint framework: viewport-rect
 * boxes in a shadow-rooted fixed layer (mirror measurement for form fields,
 * DOM ranges for contenteditable hosts).
 */

import { callBackground } from '../lib/messaging';
import type { BackgroundSettings, LintDto } from '../lib/messages';
import { domainFromUrl } from '../lib/sites';
import { watchSettings } from '../lib/storage';
import { asFieldAdapter, type FieldAdapter } from './fields';
import { OverlayLayer } from './overlay';
import type { HitBox } from './overlay-types';
import { PopoverLayer } from './popover';

const DEFAULT_DEBOUNCE = 300;
const MAX_RECTS_PER_LINT = 8;

export class ContentSession {
  private readonly overlay: OverlayLayer;
  private readonly popover: PopoverLayer;
  private adapter: FieldAdapter | undefined;
  private lints: LintDto[] = [];
  private settings: BackgroundSettings | undefined;
  private lintToken = 0;
  private debounceTimer: number | undefined;
  private blurTimer: number | undefined;
  private composing = false;
  private siteEnabled = true;
  private stopped = false;
  private readonly cleanups: Array<() => void> = [];

  constructor() {
    this.overlay = new OverlayLayer();
    this.popover = new PopoverLayer(this.overlay.shadow, {
      apply: (lint, replacement) => this.applyReplacement(lint, replacement),
      ignore: lint => this.ignoreLint(lint),
      loadSuggestions: async lint =>
        callBackground<string[]>({ type: 'spellingSuggestions', word: lint.ruleId }).catch(() => []),
      onClose: () => {},
    });
    this.wireListeners();
    void this.evaluateSiteStatus();
  }

  /* ------------------------------- Wiring ------------------------------ */

  private wireListeners(): void {
    const add = <T extends Event>(
      target: EventTarget,
      type: string,
      listener: (event: T) => void,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, listener as EventListener, options);
      this.cleanups.push(() => target.removeEventListener(type, listener as EventListener, options));
    };
    add<FocusEvent>(document, 'focusin', event => this.attachField(event.target));
    add(document, 'focusout', () => this.considerBlur());
    add(document, 'input', () => this.scheduleLint());
    add(document, 'compositionstart', () => {
      this.composing = true;
    });
    add(document, 'compositionend', () => {
      this.composing = false;
      this.scheduleLint();
    });
    add<PointerEvent>(document, 'pointerdown', event => this.handlePointerDown(event), { capture: true });
    add<KeyboardEvent>(document, 'keydown', event => this.handleKeyDown(event), { capture: true });
    add(window, 'scroll', () => this.renderBoxes(), { capture: true });
    add(window, 'resize', () => this.renderBoxes());
    this.cleanups.push(
      watchSettings(settings => {
        this.settings = settings;
        void this.evaluateSiteStatus();
      }),
    );
  }

  /* -------------------------------- Field ------------------------------ */

  /** Attach or switch the active field; re-checks the per-site status. */
  private async attachField(target: EventTarget | null): Promise<void> {
    if (this.stopped) return;
    const adapter = asFieldAdapter(target);
    if (adapter === undefined) return;
    if (this.adapter?.host === adapter.host) return;

    this.adapter = adapter;
    this.lints = [];
    this.popover.close();
    const enabled = await this.evaluateSiteStatus();
    if (!enabled || this.adapter?.host !== adapter.host) return;
    void this.lintNow();
  }

  /** Drop the active field when focus moved somewhere else. */
  private considerBlur(): void {
    window.clearTimeout(this.blurTimer);
    this.blurTimer = window.setTimeout(() => {
      if (this.stopped) return;
      const active = document.activeElement;
      if (this.adapter !== undefined && active === this.adapter.host) return;
      // Keep the popover when focus jumped into our own UI.
      if (this.popover.isOpen) return;
      this.detachField();
    }, 200);
  }

  private detachField(): void {
    this.adapter = undefined;
    this.lints = [];
    this.popover.close();
    this.overlay.clearBoxes();
    this.lintToken += 1;
  }

  /* ------------------------------- Status ------------------------------ */

  private async evaluateSiteStatus(): Promise<boolean> {
    try {
      const status = await callBackground<{ effectiveEnabled: boolean }>({
        type: 'getSiteStatus',
        domain: domainFromUrl(location.href),
      });
      this.siteEnabled = status.effectiveEnabled;
    } catch {
      // Without the background engine there is nothing safe to render.
      this.siteEnabled = false;
    }
    if (!this.siteEnabled) this.detachField();
    return this.siteEnabled;
  }

  /* ------------------------------- Linting ----------------------------- */

  private scheduleLint(): void {
    if (this.adapter === undefined || !this.siteEnabled) return;
    window.clearTimeout(this.debounceTimer);
    const delay = this.composing ? 800 : (this.settings?.debounceMs ?? DEFAULT_DEBOUNCE);
    this.debounceTimer = window.setTimeout(() => void this.lintNow(), delay);
  }

  private async lintNow(): Promise<void> {
    const adapter = this.adapter;
    if (adapter === undefined || !this.siteEnabled) return;
    const text = adapter.text();
    if (text.trim() === '') {
      this.lints = [];
      this.renderBoxes();
      void callBackground({ type: 'reportLintCount', count: 0 }).catch(() => {});
      return;
    }

    const token = (this.lintToken += 1);
    try {
      const batch = await callBackground<{ lints: LintDto[]; truncated: boolean }>({
        type: 'lintText',
        text,
      });
      if (this.stopped || this.adapter !== adapter || token !== this.lintToken) return;
      // The user may have typed while the engine was running: restart if the
      // analyzed snapshot is no longer the field content.
      if (adapter.text() !== text) {
        this.scheduleLint();
        return;
      }
      this.lints = batch.lints;
      this.renderBoxes();
      void callBackground({ type: 'reportLintCount', count: batch.lints.length }).catch(() => {});
    } catch (error) {
      console.debug('Better Grammalecte: lint request failed', error);
    }
  }

  /* ------------------------------ Rendering ---------------------------- */

  private renderBoxes(): void {
    const adapter = this.adapter;
    if (adapter === undefined || this.lints.length === 0) {
      this.overlay.clearBoxes();
      return;
    }
    const boxes: HitBox[] = [];
    for (const lint of this.lints) {
      const rects = adapter.rects(lint.start, lint.end);
      for (const rect of rects.slice(0, MAX_RECTS_PER_LINT)) {
        boxes.push({
          rect: new DOMRect(
            Math.round(rect.left),
            Math.round(Math.max(rect.bottom - 6, rect.top)),
            Math.round(rect.width),
            6,
          ),
          lint,
        });
      }
    }
    this.overlay.setBoxes(boxes);
  }

  /* ------------------------------ Actions ------------------------------ */

  private applyReplacement(lint: LintDto, replacement: string): void {
    const adapter = this.adapter;
    if (adapter === undefined) return;
    this.overlay.clearBoxes();
    adapter.replace(lint, replacement);
    // Replace events bubble to our own input listener, which schedules the
    // next lint; nothing more to do here.
  }

  private ignoreLint(lint: LintDto): void {
    const request =
      lint.kind === 'spelling'
        ? { type: 'ignoreWord' as const, word: lint.ruleId }
        : { type: 'ignoreRule' as const, ruleId: lint.ruleId };
    void callBackground(request)
      .then(() => {
        this.lints = this.lints.filter(other => other.start !== lint.start || other.end !== lint.end);
        this.renderBoxes();
        this.scheduleLint();
      })
      .catch(() => {});
  }

  /** Open the compact review panel for the active field (popup entry point). */
  openReviewPanel(): void {
    if (this.adapter === undefined) return;
    const label =
      this.adapter.type === 'input'
        ? 'un champ texte'
        : this.adapter.type === 'textarea'
          ? 'une zone de texte'
          : 'le texte en cours';
    this.popover.openPanel(this.lints, label);
  }

  /* ------------------------------ Keys/pointers -------------------------- */

  private handlePointerDown(event: PointerEvent): void {
    if (this.popover.isOpen && !this.popover.contains(event.target)) {
      this.popover.close();
    }
    if (this.adapter === undefined || !this.siteEnabled) return;
    const hit = this.overlay.hitAt(event);
    if (hit !== undefined) {
      this.popover.open(hit, hit.lint.suggestions);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.popover.isOpen) {
      this.popover.close();
      event.stopPropagation();
    }
  }

  /** Full teardown (extension reload, page scripts, invalidation). */
  destroy(): void {
    this.stopped = true;
    window.clearTimeout(this.debounceTimer);
    window.clearTimeout(this.blurTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.popover.close();
    this.overlay.clearBoxes();
    this.detachField();
  }
}
