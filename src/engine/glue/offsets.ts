/**
 * Offset mapping between the raw text typed by the user and the normalized
 * text analyzed by the engine.
 *
 * The engine normalizes its input before analyzing (it strips soft hyphens
 * and applies Unicode NFC). Error offsets returned by the engine are relative
 * to the normalized text, but we need to underline the raw text of the page
 * field, so every offset has to be mapped back.
 */

const SOFT_HYPHEN = "\u00AD";

export interface OffsetMapper {
  /** Map an offset in normalized text to the closest raw-text offset. */
  rawOffset(normalizedOffset: number): number;
}

/** Build a per-character mapping during whole-string normalization. */
export function createOffsetMapper(rawParagraph: string, normalizedParagraph: string): OffsetMapper {
  if (rawParagraph === normalizedParagraph) {
    return { rawOffset: (offset) => offset };
  }

  const perCharNormalized: string[] = [];
  const rawStart: number[] = [];
  const rawEnd: number[] = [];
  let cursor = 0;
  while (cursor < rawParagraph.length) {
    const char = rawParagraph[cursor] as string;
    const codePoint = char.codePointAt(0) ?? 0;
    const size = codePoint > 0xffff ? 2 : 1;
    const piece = rawParagraph.slice(cursor, cursor + size);
    if (piece === SOFT_HYPHEN) {
      cursor += size;
      continue;
    }
    const normalizedPiece = piece.normalize("NFC");
    for (let i = 0; i < normalizedPiece.length; i += 1) {
      perCharNormalized.push(normalizedPiece[i] as string);
      rawStart.push(cursor);
      rawEnd.push(cursor + size);
    }
    cursor += size;
  }

  if (perCharNormalized.join("") === normalizedParagraph) {
    // Exact mapping available: reproduce offsets precisely, including
    // positions in the middle of a multi-character normalization.
    return {
      rawOffset: (offset) => {
        if (offset <= 0) return 0;
        if (offset >= normalizedParagraph.length) return rawParagraph.length;
        const previous = offset > 0 ? (rawEnd[offset - 1] ?? rawParagraph.length) : 0;
        return previous;
      },
    };
  }

  // Rare case: whole-string NFC differs from per-character NFC (for instance a
  // combining mark placed after a base character). Fall back to a linear
  // position estimate, clamped to the string bounds.
  const ratio = rawParagraph.length / Math.max(normalizedParagraph.length, 1);
  return {
    rawOffset: (offset) => Math.min(Math.round(offset * ratio), rawParagraph.length),
  };
}
