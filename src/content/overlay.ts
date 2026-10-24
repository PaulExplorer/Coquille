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
`;

export class OverlayLayer {
  readonly shadow: ShadowRoot;
  /** Retargeted event.target for any pointer event inside the shadow layer. */
  readonly host: HTMLElement;
  private boxLayer: HTMLDivElement;
  private currentBoxes: HitBox[];

  constructor() {
    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    this.host = host;
    this.shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.boxLayer = document.createElement('div');
    this.shadow.append(style, this.boxLayer);
    document.documentElement.append(host);
    this.currentBoxes = [];
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
      if (
        point.x >= box.rect.left - 2 &&
        point.x <= box.rect.right + 2 &&
        point.y >= box.rect.top - 4 &&
        point.y <= box.rect.bottom + 1
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
