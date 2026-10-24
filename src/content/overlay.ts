/**
 * Viewport overlay layer: underline boxes for the current field plus the
 * floating suggestion popover, both rendered in a closed shadow root attached
 * to the document root so page scripts cannot see or restyle them.
 */

import type { LintDto } from '../lib/messages';
import type { HitBox } from './overlay-types';

const OVERLAY_ID = 'better-grammalecte-overlay';
const OVERLAY_Z = 2147483646;

const STYLE = `
:host {
  position: fixed;
  inset: 0;
  z-index: ${OVERLAY_Z};
  pointer-events: none;
}
.bg-box {
  position: fixed;
  pointer-events: none;
  box-sizing: border-box;
}
.bg-box.spelling {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' stroke='%23e03131' stroke-width='1' fill='none'/%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-position: bottom left;
}
.bg-box.grammar {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' stroke='%231971c2' stroke-width='1' fill='none'/%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-position: bottom left;
}
.bg-box.tinted {
  border-bottom: 2px solid var(--bg-color);
}
.bg-badge {
  position: fixed;
  font: 11px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #f8fafc;
  background: rgba(31, 41, 51, 0.92);
  padding: 3px 9px;
  border-radius: 99px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
  white-space: nowrap;
}
`;

export class OverlayLayer {
  readonly shadow: ShadowRoot;
  /** Retargeted event.target for any pointer event inside the shadow layer. */
  readonly host: HTMLElement;
  private boxLayer: HTMLDivElement;
  private badge: HTMLDivElement;
  private badgeAnchor: DOMRect | undefined;
  private currentBoxes: HitBox[];

  constructor() {
    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    this.host = host;
    this.shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.boxLayer = document.createElement('div');
    this.badge = document.createElement('div');
    this.badge.className = 'bg-badge';
    this.badge.style.display = 'none';
    this.shadow.append(style, this.boxLayer, this.badge);
    document.documentElement.append(host);
    this.currentBoxes = [];
  }

  /** Anchor for badge positioning; call before showBadge. */
  setBadgeAnchor(rect: DOMRect): void {
    this.badgeAnchor = rect;
  }

  /** Show a status pill near the field's top-right corner. */
  showBadge(text: string): void {
    const anchor = this.badgeAnchor;
    this.badge.textContent = text;
    if (anchor !== undefined) {
      this.badge.style.right = `${Math.max(12, Math.round(window.innerWidth - anchor.right))}px`;
      this.badge.style.top = `${Math.max(8, Math.round(anchor.top - 26))}px`;
    } else {
      this.badge.style.right = '16px';
      this.badge.style.top = '12px';
    }
    this.badge.style.display = 'block';
  }

  hideBadge(): void {
    this.badge.style.display = 'none';
  }

  setBoxes(boxes: HitBox[]): void {
    this.currentBoxes = boxes;
    this.boxLayer.replaceChildren(...boxes.map(box => this.renderBox(box)));
  }

  clearBoxes(): void {
    this.setBoxes([]);
  }

  hitAt(point: { x: number; y: number }): HitBox | undefined {
    for (const box of this.currentBoxes) {
      const hit = box.hitRect;
      if (
        point.x >= hit.left - 2 &&
        point.x <= hit.right + 2 &&
        point.y >= hit.top - 3 &&
        point.y <= hit.bottom + 3
      ) {
        return box;
      }
    }
    return undefined;
  }

  allBoxes(): HitBox[] {
    return [...this.currentBoxes];
  }

  private renderBox(box: HitBox): HTMLDivElement {
    const element = document.createElement('div');
    const color = box.lint.color;
    if (color !== undefined && color !== '') {
      element.className = 'bg-box tinted';
      element.style.setProperty('--bg-color', color);
    } else {
      element.className = `bg-box ${box.lint.kind}`;
    }
    element.style.left = `${Math.round(box.rect.left)}px`;
    element.style.top = `${Math.round(box.rect.top)}px`;
    element.style.width = `${Math.max(Math.round(box.rect.width), 3)}px`;
    element.style.height = `${Math.max(Math.round(box.rect.height), 3)}px`;
    return element;
  }
}

export function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}
