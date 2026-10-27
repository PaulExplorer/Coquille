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

// Only fields that carry normal prose. Identity-style inputs (email, url,
// tel, number) are corrected by nothing: grammar and style rules have no
// meaning there and likely only produce noise.
const TEXT_INPUT_TYPES = new Set<HTMLInputElement['type']>(['text', 'search']);

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

/* --------------------------- Native spellcheck --------------------------- */

/**
 * Reversible native spellcheck suppression: when Coquille analyses a field,
 * the browser's own red squiggles only duplicate our underlines. The host's
 * original `spellcheck` state is remembered and put back on release, so
 * disabling the extension per site (or globally) restores exactly what the
 * page had.
 */
const nativeSpellcheckStates = new WeakMap<Element, string | null>();

export function setSuppressNativeSpellcheck(host: Element, suppress: boolean): void {
  if (suppress) {
    if (!nativeSpellcheckStates.has(host)) {
      nativeSpellcheckStates.set(host, host.getAttribute('spellcheck'));
    }
    host.setAttribute('spellcheck', 'false');
  } else {
    const previous = nativeSpellcheckStates.get(host);
    if (previous === undefined) return;
    if (previous === null) host.removeAttribute('spellcheck');
    else host.setAttribute('spellcheck', previous);
    nativeSpellcheckStates.delete(host);
  }
}

/**
 * The page's own spellcheck decision for this host, exactly as it was before
 * any interference from us — mandatory here because our suppression rewrites
 * the attribute to "false" and would otherwise read back our own change and
 * neutralize the correction. The resolution mirrors the browser: the nearest
 * spellcheck attribute on the host or an ancestor wins; without any, prose
 * holders (textarea, contenteditable) default to on and single-line inputs
 * to off.
 */
export function pageSpellcheckState(host: HTMLElement): boolean {
  const remembered = nativeSpellcheckStates.get(host);
  if (remembered !== undefined && remembered !== null) {
    return remembered === 'true' || remembered === '';
  }
  // The snapshot only covers the host's own attribute; when the host had
  // none (absent in the snapshot), an ancestor may still declare one, and
  // the ancestors' subtree is untouched by our writes.
  for (
    let element: Element | null = remembered !== undefined ? host.parentElement : host;
    element !== null;
    element = element.parentElement
  ) {
    const value = element.getAttribute('spellcheck');
    if (value !== null) return value === 'true' || value === '';
  }
  // No declaration anywhere: prose holders default to checked (and Coquille
  // corrects single-line inputs by design anyway).
  return true;
}

/* -------------------------------- Mirror -------------------------------- */

/**
 * Viewport rects for a slice of a form field's value, measured through a
 * hidden mirror element styled like the field.
 *
 * Mirrors Harper's TextFieldRange: one persistent mirror per field (weakly
 * held "arena"), every text-affecting longhand copied (font longhands and
 * border widths, not the `font` shorthand — Firefox computes it empty),
 * textarea scroll synchronized, mirror laid out at the field's own size.
 */
interface MirrorArena {
  mirror: HTMLDivElement;
  before: HTMLSpanElement;
  marked: HTMLSpanElement;
  after: HTMLSpanElement;
  field: HTMLTextAreaElement | HTMLInputElement;
}

/** Text-affecting longhands worth copying (Harper's list), as IDL names —
 * Firefox returns "" for camelCase names passed to getPropertyValue, so the
 * copy MUST go through the IDL accessors. */
const MIRROR_STYLE_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'direction',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

const mirrorArenas = new WeakMap<HTMLTextAreaElement | HTMLInputElement, MirrorArena>();

function ensureMirrorArena(
  field: HTMLTextAreaElement | HTMLInputElement,
): MirrorArena {
  const existing = mirrorArenas.get(field);
  if (existing !== undefined && existing.mirror.isConnected) return existing;
  if (existing !== undefined) {
    existing.mirror.remove();
    mirrorArenas.delete(field);
  }

  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  const styles = window.getComputedStyle(field);
  const stylesByIdl = styles as unknown as Record<string, unknown>;
  const mirrorStyle = mirror.style as unknown as Record<string, unknown>;
  for (const property of MIRROR_STYLE_PROPERTIES) {
    mirrorStyle[property] = stylesByIdl[property] ?? '';
  }
  mirrorStyle.boxSizing = styles.boxSizing;
  // A copied border-width only takes layout space with a visible border style;
  // draw it transparent so the mirror's border-box matches the field's.
  Object.assign(mirror.style, {
    boxSizing: styles.boxSizing,
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    // Copy the field's computed wrapping for textareas — the browser already
    // knows the right answer, including `white-space: pre` for wrap="off" and
    // site-imposed `nowrap`. Inputs get `pre` because their computed value is
    // `normal`, which would collapse runs of spaces and shift offsets.
    whiteSpace: field instanceof HTMLTextAreaElement ? styles.whiteSpace : 'pre',
    overflowWrap: field instanceof HTMLTextAreaElement ? styles.overflowWrap : 'normal',
    overflowX: 'auto',
    overflowY: 'auto',
    visibility: 'hidden',
    position: 'absolute',
    pointerEvents: 'none',
    margin: '0',
  });

  const before = document.createElement('span');
  const marked = document.createElement('span');
  const after = document.createElement('span');
  mirror.append(before, marked, after);
  document.body.append(mirror);

  const arena: MirrorArena = { mirror, before, marked, after, field };
  mirrorArenas.set(field, arena);
  return arena;
}

/** Re-position and re-flow the mirror for the requested slice. */
function syncMirror(arena: MirrorArena, value: string, start: number, end: number): void {
  arena.before.textContent = value.slice(0, start);
  arena.marked.textContent = value.slice(start, end);
  arena.after.textContent = value.slice(end);
  arena.mirror.scrollTop = arena.field.scrollTop;
  arena.mirror.scrollLeft = arena.field.scrollLeft;

  const styles = window.getComputedStyle(arena.field);
  const fieldBox = arena.field.getBoundingClientRect();
  const toPx = (value: string): number => Number.parseFloat(value) || 0;
  // For content-box fields the CSS width excludes padding and borders, which
  // are part of the on-screen box; restore the layout size the field shows.
  // The constrained height also keeps the mirror from extending the page (a
  // long unwrapped value would otherwise grow the body scroll area) and makes
  // the scrollTop/scrollLeft sync above actually scroll.
  let width = fieldBox.width;
  let height = fieldBox.height;
  if (styles.boxSizing !== 'border-box') {
    width =
      fieldBox.width -
      toPx(styles.paddingLeft) - toPx(styles.paddingRight) -
      toPx(styles.borderLeftWidth) - toPx(styles.borderRightWidth);
    height =
      fieldBox.height -
      toPx(styles.paddingTop) - toPx(styles.paddingBottom) -
      toPx(styles.borderTopWidth) - toPx(styles.borderBottomWidth);
  }
  arena.mirror.style.top = `${fieldBox.top + window.scrollY}px`;
  arena.mirror.style.left = `${fieldBox.left + window.scrollX}px`;
  arena.mirror.style.width = `${width}px`;
  arena.mirror.style.height = `${height}px`;
}

function mirrorRects(
  field: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
): DOMRect[] {
  if (start < 0 || start >= end || end > field.value.length) return [];
  const arena = ensureMirrorArena(field);
  syncMirror(arena, field.value, start, end);

  const fieldBox = field.getBoundingClientRect();
  const rects: DOMRect[] = [];
  for (const rect of arena.marked.getClientRects()) {
    if (intersects(rect, fieldBox)) rects.push(rect);
  }
  return rects;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  if (a.width <= 0 || a.height <= 0) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
