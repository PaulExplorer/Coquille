import { describe, expect, it } from 'vitest';
import { createOffsetMapper } from './offsets';

describe('offset mapping', () => {
  it('is the identity when no normalization happens', () => {
    const text = 'une phrase normale';
    const mapper = createOffsetMapper(text, text);
    expect(mapper.rawOffset(4)).toBe(4);
  });

  it('shifts offsets when soft hyphens are stripped', () => {
    const raw = 'mot\u00ADsuivant fin';
    const normalized = raw.replace(new RegExp('\u00AD', 'g'), '');
    const mapper = createOffsetMapper(raw, normalized);
    // "suivant" starts right after the removed soft hyphen.
    expect(mapper.rawOffset(3)).toBe(3);
    expect(mapper.rawOffset(4)).toBe(4 + 1);
    expect(mapper.rawOffset(normalized.length)).toBe(raw.length);
  });

  it('clamps at the paragraph bounds', () => {
    const raw = 'ab\u00ADc';
    const normalized = 'abc';
    const mapper = createOffsetMapper(raw, normalized);
    expect(mapper.rawOffset(0)).toBe(0);
    expect(mapper.rawOffset(3)).toBe(4);
    expect(mapper.rawOffset(10)).toBe(4);
  });
});
