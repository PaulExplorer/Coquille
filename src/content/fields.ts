/**
 * Editable field detection and the per-field adapter contract used by the
 * rest of the content layer.
 *
 * The field-type support follows the approach of the Harper lint framework
 * (textarea, single-line inputs, contenteditable hosts), reduced to what the
 * Grammalecte engine needs for French.
 */

import type { LintDto } from '../lib/messages';
import { replaceContentEditableText, replaceFormFieldText } from './replace';

export type FieldType = 'input' | 'textarea' | 'contenteditable';

export interface FieldAdapter {
  type: FieldType;
  host: Element;
  /** Full text content, in sync with the offsets used by the engine. */
  text(): string;
  /** Viewport rectangles covering [start, end), clipped to the field box. */
  rects(start: number, end: number): DOMRect[];
  /** A DOM range covering [start, end) for range-based fields. */
  domRange(start: number, end: number): Range | undefined;
  replace(lint: { start: number; end: number }, replacement: string): void;
}

const TEXT_INPUT_TYPES = new Set<HTMLInputElement['type']>([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'number',
]);

export function asFieldAdapter(candidate: EventTarget | null): FieldAdapter | undefined {
  if (!(candidate instanceof Element)) return undefined;
  if (candidate instanceof HTMLTextAreaElement) {
    if (candidate.disabled || candidate.readOnly) return undefined;
    return formFieldAdapter(candidate, 'textarea');
  }
  if (candidate instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(candidate.type)) {
    if (candidate.disabled || candidate.readOnly) return undefined;
    return formFieldAdapter(candidate, 'input');
  }
  if (candidate instanceof HTMLElement && candidate.isContentEditable) {
    // An Element casting to HTMLElement is the norm outside SVG; skip the
    // rare non-HTMLElement contenteditable host.
    return new ContentEditableAdapter(candidate);
  }
  return undefined;
}

/* ------------------------------ Form fields ----------------------------- */

function formFieldAdapter(
  field: HTMLTextAreaElement | HTMLInputElement,
  type: 'input' | 'textarea',
): FieldAdapter {
  return {
    type,
    host: field,
    text: () => field.value,
    rects: (start, end) => mirrorRects(field, start, end),
    domRange: () => undefined,
    replace: (lint, replacement) => {
      replaceFormFieldText(field, lint.start, lint.end, replacement);
    },
  };
}

/* --------------------------- Content editables -------------------------- */

interface TextNodeSpan {
  node: Node;
  start: number;
  end: number;
}

export class ContentEditableAdapter implements FieldAdapter {
  type: FieldType = 'contenteditable';
  host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  text(): string {
    return this.host.textContent ?? '';
  }

  private nodeSpans(): TextNodeSpan[] {
    const spans: TextNodeSpan[] = [];
    const walker = document.createTreeWalker(this.host, NodeFilter.SHOW_TEXT);
    let cursor = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      spans.push({ node, start: cursor, end: cursor + text.length });
      cursor += text.length;
    }
    return spans;
  }

  private locate(spans: TextNodeSpan[], offset: number): [Node, number] | undefined {
    for (const span of spans) {
      if (offset >= span.start && offset <= span.end) {
        return [span.node, offset - span.start];
      }
    }
    return undefined;
  }

  domRange(start: number, end: number): Range | undefined {
    const spans = this.nodeSpans();
    const from = this.locate(spans, start);
    const to = this.locate(spans, end);
    if (from === undefined || to === undefined) return undefined;
    const range = document.createRange();
    try {
      range.setStart(from[0] as unknown as Node, from[1]);
      range.setEnd(to[0] as unknown as Node, to[1]);
    } catch {
      return undefined;
    }
    return range;
  }

  rects(start: number, end: number): DOMRect[] {
    const range = this.domRange(start, end);
    if (range === undefined) return [];
    return [...range.getClientRects()];
  }

  replace(lint: { start: number; end: number }, replacement: string): void {
    const range = this.domRange(lint.start, lint.end);
    if (range !== undefined) replaceContentEditableText(range, replacement);
  }
}

/* -------------------------------- Mirror -------------------------------- */

/**
 * Viewport rects for a slice of a form field's value, measured through a
 * hidden mirror element styled like the field (mirroring technique, also
 * used by Harper's TextFieldRange and textchecker's mirror divs).
 */
function mirrorRects(
  field: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
): DOMRect[] {
  if (start < 0 || start >= end || end > field.value.length) return [];

  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  const before = document.createElement('span');
  before.textContent = field.value.slice(0, start);
  const marked = document.createElement('span');
  marked.textContent = field.value.slice(start, end);
  const after = document.createElement('span');
  after.textContent = field.value.slice(end);
  mirror.append(before, marked, after);

  const fieldBox = field.getBoundingClientRect();
  const styles = window.getComputedStyle(field);
  const isMultiline = field instanceof HTMLTextAreaElement;
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = isMultiline ? 'pre-wrap' : 'pre';
  mirror.style.overflowWrap = isMultiline ? styles.overflowWrap : 'normal';
  mirror.style.margin = '0';
  mirror.style.border = 'none';
  mirror.style.boxSizing = styles.boxSizing;
  mirror.style.paddingTop = styles.paddingTop;
  mirror.style.paddingRight = isMultiline ? styles.paddingRight : '0px';
  mirror.style.paddingBottom = styles.paddingBottom;
  mirror.style.paddingLeft = isMultiline ? styles.paddingLeft : '0px';
  mirror.style.font = styles.font;
  mirror.style.fontFamily = styles.fontFamily;
  mirror.style.fontSize = styles.fontSize;
  mirror.style.fontWeight = styles.fontWeight;
  mirror.style.letterSpacing = styles.letterSpacing;
  mirror.style.lineHeight = styles.lineHeight;
  mirror.style.textTransform = styles.textTransform;
  mirror.style.width = isMultiline
    ? `${fieldBox.width - paddingOf(styles) * 2}px`
    : 'max-content';
  mirror.style.left = fieldBox.left + 'px';
  mirror.style.top = fieldBox.top + 'px';

  document.body.appendChild(mirror);
  try {
    // The spans give viewport coordinates directly (same document, above the
    // page), so only clipping to the field box remains.
    const rects: DOMRect[] = [];
    for (const rect of marked.getClientRects()) {
      if (intersects(rect, fieldBox)) rects.push(rect);
    }
    return rects;
  } finally {
    mirror.remove();
  }
}

function paddingOf(styles: CSSStyleDeclaration): number {
  const left = Number.parseFloat(styles.paddingLeft) || 0;
  return left;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  if (a.width <= 0 || a.height <= 0) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
