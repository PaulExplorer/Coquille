/**
 * Text replacement in fields, framework-proof.
 *
 * Frameworks (React above all) steal the `value` setter of inputs and detect
 * programmatic writes through it, so replacements go through the prototype's
 * native setter before input events are dispatched.
 *
 * For contenteditable hosts, the DOM range is selected and execCommand is
 * used so the native editing pipeline (undo stack, InputEvent, framework
 * listeners) stays coherent; direct DOM surgery is only the fallback.
 */

function nativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement): PropertyDescriptor | undefined {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(prototype, 'value');
}

/** Replace [start, end) by replacement, keeping caret and reactivity intact. */
export function replaceFormFieldText(
  field: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
): void {
  const value = field.value;
  const length = end - start;
  const next = value.slice(0, start) + replacement + value.slice(end);
  const setter = nativeValueSetter(field);
  const caretStart = field.selectionStart;
  const caretEnd = field.selectionEnd;

  if (setter?.set) {
    setter.set.call(field, next);
  } else {
    field.value = next;
  }

  const caretAfter = start + replacement.length;
  const map = (offset: number | null): number | null => {
    if (offset == null) return null;
    if (offset <= start) return offset;
    if (offset >= start + length) return offset - length + replacement.length;
    return caretAfter;
  };
  field.setSelectionRange(map(caretStart) ?? caretAfter, map(caretEnd) ?? caretAfter);

  field.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/**
 * Replace a DOM range for contenteditable fields using the native editing
 * pipeline, falling back to direct DOM surgery.
 */
export function replaceContentEditableText(
  range: Range,
  replacement: string,
): void {
  const selection = document.getSelection();
  if (!selection) return replaceRangeDirectly(range, replacement);
  selection.removeAllRanges();
  selection.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, replacement);
  } catch {
    ok = false;
  }
  if (!ok) replaceRangeDirectly(range, replacement);
}

function replaceRangeDirectly(range: Range, replacement: string): void {
  const text = range.toString();
  range.deleteContents();
  if (replacement.length > 0) {
    range.insertNode(document.createTextNode(replacement));
  }
  if (text.length > 0 || replacement.length > 0) {
    range.startContainer.parentElement?.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  }
}
