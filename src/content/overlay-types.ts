import type { LintDto } from '../lib/messages';

/**
 * One rendered lint fragment: `rect` is the thin visible underline strip,
 * `hitRect` is the full text-line box used for pointer hit-testing (Harper
 * hit-tests the whole box, not the strip).
 */
export interface HitBox {
  rect: DOMRect;
  hitRect: DOMRect;
  lint: LintDto;
}
