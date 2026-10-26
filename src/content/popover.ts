/**
 * Suggestion popover (inline, anchored on an underline box) and the compact
 * review panel (fallback listing every lint of the field, for editors that
 * resist inline underlines). Both live in the overlay layer.
 */

import type { LintDto } from '../lib/messages';
import type { HitBox } from './overlay-types';

const POPOVER_CSS = `
.bg-popover {
  position: fixed;
  min-width: 220px;
  max-width: 360px;
  background: #ffffff;
  color: #1f2933;
  border: 1px solid #dee2e6;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
  pointer-events: auto;
}
.bg-popover--panel {
  max-width: 320px;
  top: 72px !important;
  bottom: 24px !important;
  left: auto !important;
  right: 16px !important;
  overflow-y: auto;
}
.bg-popover__strength {
  display: block;
  padding: 8px 12px 4px;
  font-weight: 600;
}
.bg-popover__message {
  display: block;
  padding: 2px 12px 6px;
  color: #52606d;
  word-break: break-word;
}
.bg-popover__list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.bg-popover__row {
  padding: 7px 12px;
  cursor: pointer;
  white-space: normal;
  word-break: break-word;
}
.bg-popover__row:hover {
  background: #f0f4f8;
}
.bg-popover__foot {
  display: flex;
  gap: 8px;
  padding: 6px 10px 10px;
}
.bg-popover__util {
  border: 0;
  background: transparent;
  color: #52606d;
  font: inherit;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.bg-popover__util:hover {
  background: #f0f4f8;
}
.bg-popover__none {
  padding: 4px 12px 10px;
  color: #52606d;
}
.bg-panel__item {
  display: block;
  padding: 8px 12px;
  border-bottom: 1px solid #edf2f7;
}
.bg-panel__item:last-of-type {
  border-bottom: 0;
}
.bg-panel__value {
  display: block;
  font-weight: 600;
}
.bg-panel__note {
  display: block;
  margin-top: 1px;
  color: #52606d;
  font-size: 12px;
}
.bg-panel__apply {
  display: inline-block;
  margin-top: 5px;
  font: inherit;
  font-size: 12px;
  border: 1px solid #cbd2d9;
  background: #fff;
  color: #1f2933;
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bg-panel__apply:hover:not(:disabled) {
  background: #f0f4f8;
}
.bg-panel__apply:disabled {
  opacity: 0.55;
  cursor: default;
}
.bg-panel__close {
  margin: 8px 12px 10px;
}
`;


export interface PopoverActions {
  apply(lint: LintDto, replacement: string): void;
  ignore(lint: LintDto): void;
  /** Optionally fetch suggestions for spelling lints on demand. */
  loadSuggestions?: (lint: LintDto) => Promise<string[]>;
  onClose(): void;
}

export class PopoverLayer {
  private root: HTMLElement | undefined;
  private panelOpen = false;
  private currentLint: LintDto | undefined;

  constructor(
    private mount: ShadowRoot,
    private actions: PopoverActions,
  ) {
    // The popover styles live in the overlay's shadow root; inject them once.
    if (mount.querySelector('style[data-bg="popover"]') === null) {
      const style = document.createElement('style');
      style.dataset.bg = 'popover';
      style.textContent = POPOVER_CSS;
      mount.append(style);
    }
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  get isPanelOpen(): boolean {
    return this.panelOpen;
  }

  close(): void {
    this.root?.remove();
    this.root = undefined;
    this.currentLint = undefined;
    if (this.panelOpen) this.actions.onClose();
    this.panelOpen = false;
  }

  /** Show the inline popover for one lint, anchored under/over its box. */
  open(box: HitBox, suggestionsHint: string[]): void {
    this.closeInternal();
    const popover = this.build(box.lint, suggestionsHint);
    this.position(popover, box.rect);
    this.root = popover;
    this.panelOpen = false;
    this.mount.append(popover);
  }

  private closeInternal(): void {
    if (this.root && this.panelOpen) this.actions.onClose();
    this.root?.remove();
    this.root = undefined;
  }

  private build(lint: LintDto, suggestions: string[]): HTMLElement {
    const card = document.createElement('div');
    card.className = 'bg-popover';

    const kindLabel = lint.kind === 'spelling' ? 'Orthographe' : 'Grammaire';
    const title = document.createElement('span');
    title.className = 'bg-popover__strength';
    title.textContent = kindLabel;
    card.append(title);

    if (lint.message !== '') {
      const message = document.createElement('span');
      message.className = 'bg-popover__message';
      message.textContent = lint.message;
      card.append(message);
    }

    const list = document.createElement('ul');
    list.className = 'bg-popover__list';
    card.append(list);

    const addSuggestions = (options: string[]): void => {
      list.replaceChildren();
      if (options.length === 0) {
        const none = document.createElement('li');
        none.className = 'bg-popover__none';
        none.textContent = 'Aucune suggestion.';
        list.append(none);
        return;
      }
      for (const option of options.slice(0, 6)) {
        const row = document.createElement('li');
        row.className = 'bg-popover__row';
        row.textContent = option;
        row.addEventListener('click', () => {
          this.actions.apply(lint, option);
          this.close();
        });
        list.append(row);
      }
    };
    addSuggestions(suggestions);

    if (lint.kind === 'spelling' && suggestions.length === 0 && this.actions.loadSuggestions) {
      const none = document.createElement('li');
      none.className = 'bg-popover__none';
      none.textContent = 'Chargement…';
      list.append(none);
      // Register the card before any async update; the stale-guard in the
      // callbacks tests whether the popover still tracks this same card.
      this.root = card;
      this.currentLint = lint;
      void this.actions
        .loadSuggestions(lint)
        .then(options => {
          if (this.root !== card) return;
          addSuggestions(options);
        })
        .catch(() => {
          if (this.root !== card) return;
          none.textContent = 'Suggestions indisponibles.';
        });
    }

    const foot = document.createElement('div');
    foot.className = 'bg-popover__foot';
    const ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.className = 'bg-popover__util';
    ignore.textContent = lint.kind === 'spelling' ? 'Ignorer ce mot' : 'Ignorer cette règle';
    ignore.addEventListener('click', () => {
      this.actions.ignore(lint);
      this.close();
    });
    foot.append(ignore);
    card.append(foot);

    return card;
  }

  private position(card: HTMLElement, rect: DOMRect): void {
    // Measure while detached from the anchor row: the card is placed at 0/0
    // behind visibility:hidden so its rendered size is known, then clamped
    // inside the window on both axes before it is shown.
    card.style.visibility = 'hidden';
    card.style.left = '0px';
    card.style.top = '0px';
    this.mount.append(card);
    const box = card.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - box.width - margin);
    card.style.left = `${Math.min(Math.max(margin, Math.round(rect.left)), maxLeft)}px`;
    const below = rect.bottom + 6;
    const flip = below + box.height > window.innerHeight - margin;
    card.style.top = flip ? `${Math.max(margin, Math.round(rect.top - 6 - box.height))}px` : `${Math.round(below)}px`;
    card.style.visibility = '';
    card.remove();
  }

  /* ------------------------------- Panel ------------------------------- */

  openPanel(lints: LintDto[], fieldLabel: string): void {
    this.closeInternal();
    const card = document.createElement('div');
    card.className = 'bg-popover bg-popover--panel';

    const intro = document.createElement('span');
    intro.className = 'bg-popover__strength';
    intro.textContent =
      lints.length === 0
        ? `Aucune remarque — ${fieldLabel}`
        : `${lints.length} remarque${lints.length > 1 ? 's' : ''} — ${fieldLabel}`;
    card.append(intro);

    if (lints.length === 0) {
      const none = document.createElement('span');
      none.className = 'bg-popover__none';
      none.textContent = 'Le texte est correct.';
      card.append(none);
    }

    for (const lint of lints.slice(0, 80)) {
      const group = document.createElement('div');
      group.className = 'bg-panel__item';
      const value = document.createElement('span');
      value.className = 'bg-panel__value';
      value.textContent = lint.value;
      group.append(value);
      if (lint.message !== '') {
        const note = document.createElement('span');
        note.className = 'bg-panel__note';
        note.textContent = lint.message;
        group.append(note);
      }
      const firstSuggestion = lint.suggestions[0];
      if (firstSuggestion !== undefined) {
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'bg-panel__apply';
        apply.textContent = `Remplacer par : ${String(firstSuggestion)}`;
        apply.addEventListener('click', () => {
          this.actions.apply(lint, String(firstSuggestion));
        });
        group.append(apply);
      } else if (lint.kind === 'spelling') {
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'bg-panel__apply';
        apply.disabled = true;
        apply.textContent = 'Recherche…';
        void this.actions
          .loadSuggestions?.(lint)
          .then(options => {
            if (options.length === 0) {
              apply.textContent = 'Aucune suggestion';
              return;
            }
            apply.disabled = false;
            apply.textContent = `Remplacer par : ${String(options[0])}`;
            apply.addEventListener('click', () => {
              this.actions.apply(lint, String(options[0]));
            });
          })
          .catch(() => {
            apply.textContent = 'Suggestions indisponibles';
          });
        group.append(apply);
      }
      card.append(group);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bg-popover__util bg-panel__close';
    close.textContent = 'Fermer';
    close.addEventListener('click', () => {
      this.close();
    });
    card.append(close);

    this.root = card;
    this.panelOpen = true;
    this.mount.append(card);
  }
}
