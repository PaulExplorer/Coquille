import type { LintDto } from '../lib/messages';

/**
 * Click target sizes for one lint fragment, used for pointer hit-testing of
 * underline boxes (popover opening).
 */
export interface HitBox {
  rect: DOMRect;
  lint: LintDto;
}
