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
  /** The exact text this.lints was computed against; offsets are only
   * trusted while the live field content still matches it exactly. */
  private analyzedText: string | undefined;
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
    this.overlay.setCircleClickHandler(() => this.openReviewPanel());
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
    this.analyzedText = undefined;
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
    this.analyzedText = undefined;
    this.popover.close();
    this.overlay.clearBoxes();
    this.overlay.hideCircle();
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
      this.analyzedText = text;
      this.renderBoxes();
      this.overlay.setCircle(0);
      void callBackground({ type: 'reportLintCount', count: 0 }).catch(() => {});
      return;
    }

    const token = (this.lintToken += 1);
    this.overlay.setCircleAnchor(adapter.host.getBoundingClientRect());
    this.overlay.setCircleBusy();
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
      this.analyzedText = text;
      this.renderBoxes();
      this.overlay.setCircle(batch.lints.length);
      this.refreshPanelIfOpen();
      void callBackground({ type: 'reportLintCount', count: batch.lints.length }).catch(() => {});
    } catch (error) {
      console.debug('Coquille: lint request failed', error);
      this.overlay.restoreCircle();
    }
  }

  /** Keep the review panel in sync while it is open. */
  private refreshPanelIfOpen(): void {
    if (!this.popover.isPanelOpen || this.adapter === undefined) return;
    this.popover.openPanel(this.lints, this.fieldLabel());
  }

  private fieldLabel(): string {
    switch (this.adapter?.type) {
      case 'input':
        return 'un champ texte';
      case 'textarea':
        return 'une zone de texte';
      default:
        return 'le texte en cours';
    }
  }

  /* ------------------------------ Rendering ---------------------------- */

  private renderBoxes(): void {
    const adapter = this.adapter;
    if (adapter === undefined || this.lints.length === 0) {
      this.overlay.clearBoxes();
      if (adapter !== undefined) {
        // Nothing to draw, but the circle still needs its dock — its anchor
        // must follow the field even around here (scroll, resize, empty
        // field), otherwise it falls back to the viewport's top-left.
        this.overlay.setCircleAnchor(adapter.host.getBoundingClientRect());
      }
      return;
    }
    this.overlay.setCircleAnchor(adapter.host.getBoundingClientRect());
    const boxes: HitBox[] = [];
    const rangedSeen = new Set<string>();
    for (const lint of this.lints) {
      // The engine can flag the same span twice (a spelling miss and a rule
      // over it); one underline is the honest rendering, further ones only
      // double-paint the wavy line.
      const rangeKey = `${lint.start}:${lint.end}`;
      if (rangedSeen.has(rangeKey)) continue;
      rangedSeen.add(rangeKey);
      const rects = adapter.rects(lint.start, lint.end);
      for (const rect of rects.slice(0, MAX_RECTS_PER_LINT)) {
        if (!this.fieldVisibleAt(rect)) continue;
        boxes.push({
          // Thin underline strip for rendering; the full line box is kept for
          // pointer hit-testing (Harper hit-tests the whole box).
          rect: new DOMRect(
            Math.round(rect.left),
            Math.round(Math.max(rect.bottom - 6, rect.top)),
            Math.round(rect.width),
            6,
          ),
          hitRect: rect,
          lint,
        });
      }
    }
    this.overlay.setBoxes(boxes);
  }

  /** A rect is drawable only where the field itself is topmost: custom caret
   * layers, message bars and other page furniture regularly float above the
   * field, and painting underlines over them looks broken. The overlay's own
   * host is allowed because the popover legitimately floats above a box. */
  private fieldVisibleAt(rect: DOMRect): boolean {
    const top = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    if (top === null) return true;
    const host = this.adapter?.host;
    if (host === undefined) return false;
    return top === host || host.contains(top) || top === this.overlay.host;
  }

  /* ------------------------------ Actions ------------------------------ */

  private applyReplacement(lint: LintDto, replacement: string): void {
    const adapter = this.adapter;
    if (adapter === undefined) return;
    if (!this.snapshotIsCurrent()) {
      // The field changed since the analysis (typing, framework rewrite):
      // writing at the lints' offsets could hit the wrong words, so refuse
      // and let the fresh analysis re-anchor everything.
      this.popover.close();
      this.overlay.setCircleAnchor(adapter.host.getBoundingClientRect());
      this.overlay.setCircleBusy();
      this.scheduleLint();
      return;
    }
    // Grammalecte-style optimistic update: its panel re-analyzes only the
    // edited paragraph and keeps the other paragraphs' results on screen in
    // the meantime. Mirror that here — drop the applied lint, shift the ones
    // after it by the replacement length delta, and leave everything else
    // clickable while the debounced re-analysis runs. The tracked snapshot
    // moves along, so successive applies stay offset-safe.
    const delta = replacement.length - (lint.end - lint.start);
    this.lints = this.lints.flatMap(other => {
      if (other.end > lint.start && other.start < lint.end) return []; // overlapping
      if (other.start >= lint.end) {
        return [{ ...other, start: other.start + delta, end: other.end + delta }];
      }
      return [other];
    });
    const snapshot = this.analyzedText as string;
    this.analyzedText = snapshot.slice(0, lint.start) + replacement + snapshot.slice(lint.end);
    this.renderBoxes();
    // Firefox blurs the field when the pointer presses the non-focusable
    // popover; refocusing (before the write, so the caret lands visibly on
    // the inserted text) keeps the blur-timer detach, which would clear the
    // overlays, from ever triggering during an apply.
    this.focusField();
    adapter.replace(lint, replacement);
    // The input event dispatched by replace() lands in our own listener,
    // which schedules the next (authoritative) lint.
  }

  /** The lints' offsets are only trustworthy while the field still holds the
   * exact text they were computed against. */
  private snapshotIsCurrent(): boolean {
    return this.adapter !== undefined && this.analyzedText === this.adapter.text();
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
        this.focusField();
        this.scheduleLint();
      })
      .catch(() => {});
  }

  /** Keep working where the user is: focus the active field, no scrolling. */
  private focusField(): void {
    const host = this.adapter?.host;
    if (host instanceof HTMLElement) host.focus({ preventScroll: true });
  }

  /** Open the compact review panel for the active field (popup entry point). */
  openReviewPanel(): void {
    if (this.adapter === undefined) return;
    this.popover.openPanel(this.lints, this.fieldLabel());
  }

  /** Attach the already-focused field, for pages loaded with focus inside. */
  attachActiveField(): void {
    void this.attachField(document.activeElement);
  }

  /* ------------------------------ Keys/pointers -------------------------- */

  private handlePointerDown(event: PointerEvent): void {
    // Events from inside the closed shadow root reach this document listener
    // retargeted to the overlay host; anything else is a genuine outside
    // click and dismisses the popover before its rows can react to it.
    if (this.popover.isOpen && event.target !== this.overlay.host) {
      this.popover.close();
    }
    // Any press inside our own UI keeps the field focused: Firefox blurs the
    // field when the pointer presses a non-focusable element (popover, panel),
    // and a stray blur would detach the field and clear the overlays.
    if (event.target === this.overlay.host) this.focusField();
    const adapter = this.adapter;
    if (adapter === undefined || !this.siteEnabled) return;
    // Only react to presses that actually landed on the field (Harper checks
    // the composed path contains the source element).
    if (!event.composedPath().includes(adapter.host)) return;
    // Stale offsets: the underlines describe text that no longer matches the
    // field, so a hit could open the popover on the wrong word. Recompute
    // instead (same as the apply-time guard, without risking broken text).
    if (!this.snapshotIsCurrent()) {
      this.scheduleLint();
      return;
    }
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
