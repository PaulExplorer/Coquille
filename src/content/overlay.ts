/**
 * Viewport overlay layer: underline boxes for the current field plus the
 * floating suggestion popover, both rendered in a closed shadow root attached
 * to the document root so page scripts cannot see or restyle them.
 */

import type { LintDto } from '../lib/messages';
import type { HitBox } from './overlay-types';

const OVERLAY_ID = 'coquille-overlay';
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
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' stroke='%23d4a017' stroke-width='1' fill='none'/%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-position: bottom left;
}
.bg-box.style {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' stroke='%231971c2' stroke-width='1' fill='none'/%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-position: bottom left;
}
.bg-circle {
  position: fixed;
  width: 30px;
  height: 30px;
  border-radius: 99px;
  display: none;
  align-items: center;
  justify-content: center;
  font: bold 12px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #ffffff;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 5px rgba(15, 23, 42, 0.3);
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}
.bg-circle.check {
  background: #2f9e44;
}
.bg-circle.count {
  background: #e03131;
}
.bg-circle.busy {
  background: #52606d;
}
`;

export class OverlayLayer {
  readonly shadow: ShadowRoot;
  /** Retargeted event.target for any pointer event inside the shadow layer. */
  readonly host: HTMLElement;
  private boxLayer: HTMLDivElement;
  private circle: HTMLDivElement;
  private circleAnchor: DOMRect | undefined;
  private circleCount = 0;
  private circleBusyFlag = false;
  private circleHidden = true;
  private circleClickHandler: (() => void) | undefined;
  private currentBoxes: HitBox[];

  constructor() {
    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    this.host = host;
    this.shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.boxLayer = document.createElement('div');
    this.circle = document.createElement('div');
    this.circle.className = 'bg-circle';
    this.circle.setAttribute('aria-hidden', 'false');
    this.circle.title = 'Voir toutes les remarques';
    this.circle.addEventListener('click', () => this.circleClickHandler?.());
    this.shadow.append(style, this.boxLayer, this.circle);
    document.documentElement.append(host);
    this.currentBoxes = [];
  }

  /** Wire the click on the summary circle (LanguageTool-style recap entry). */
  setCircleClickHandler(handler: () => void): void {
    this.circleClickHandler = handler;
  }

  /** Anchor for the circle positioning; call before any circle update. */
  setCircleAnchor(rect: DOMRect): void {
    this.circleAnchor = rect;
    this.applyCirclePosition();
  }

  /** Recompute position from the last anchor (scroll, resize).
   *
   * The dock sits above the field, but a long field scrolled deep into its
   * content pushes its top edge out of the viewport; a raw anchor would put
   * the circle at a negative top and out of sight. The dock is clamped into
   * the visible area instead, so the summary stays reachable while reading
   * the lower part of the text. */
  private applyCirclePosition(): void {
    const anchor = this.circleAnchor;
    if (anchor === undefined) return;
    this.circle.style.right = `${Math.max(12, Math.round(window.innerWidth - anchor.right))}px`;
    const fieldTop = Math.round(anchor.top);
    const above = fieldTop - 30 - 6;
    const top =
      above >= 8
        ? Math.min(above, Math.round(window.innerHeight) - 40)
        : Math.max(fieldTop, 0) + 6;
    this.circle.style.top = `${Math.max(6, top)}px`;
  }

  /** Count from the last completed analysis: green check or red number. */
  setCircle(count: number): void {
    this.circleCount = Math.max(0, count);
    this.circleBusyFlag = false;
    this.circleHidden = false;
    this.applyCirclePosition();
    this.renderCircle();
  }

  /** Transient spinner state while an analysis runs. */
  setCircleBusy(): void {
    this.circleBusyFlag = true;
    this.circleHidden = false;
    this.applyCirclePosition();
    this.renderCircle();
  }

  /** A failed analysis falls back to the last known count. */
  restoreCircle(): void {
    this.circleBusyFlag = false;
    this.renderCircle();
  }

  hideCircle(): void {
    this.circleHidden = true;
    this.renderCircle();
  }

  private renderCircle(): void {
    this.circle.className = `bg-circle ${this.circleHidden
      ? ''
      : this.circleBusyFlag
        ? 'busy'
        : this.circleCount > 0
          ? 'count'
          : 'check'}`;
    this.circle.style.display = this.circleHidden ? 'none' : 'flex';
    this.circle.textContent = this.circleHidden
      ? ''
      : this.circleBusyFlag
        ? '…'
        : this.circleCount > 0
          ? (this.circleCount > 99 ? '99+' : String(this.circleCount))
          : '✓';
  }

  setBoxes(boxes: HitBox[]): void {
    this.currentBoxes = boxes;
    this.boxLayer.replaceChildren(...boxes.map(box => this.renderBox(box)));
  }

  clearBoxes(): void {
    this.setBoxes([]);
  }

  hitAt(point: { x: number; y: number }): HitBox | undefined {
    // Several lints can overlap one point (a long-range rule covering a short
    // misspelled word, say). Prefer the most specific — smallest — hit box,
    // otherwise a wide lint would swallow the clicks of the word inside it.
    let best: HitBox | undefined;
    for (const box of this.currentBoxes) {
      const hit = box.hitRect;
      if (
        point.x >= hit.left - 2 &&
        point.x <= hit.right + 2 &&
        point.y >= hit.top - 3 &&
        point.y <= hit.bottom + 3
      ) {
        if (
          best === undefined ||
          hit.width * hit.height < best.hitRect.width * best.hitRect.height
        ) {
          best = box;
        }
      }
    }
    return best;
  }

  allBoxes(): HitBox[] {
    return [...this.currentBoxes];
  }

  private renderBox(box: HitBox): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `bg-box ${box.lint.kind}`;
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
