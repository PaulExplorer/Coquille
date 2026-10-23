import { browser } from 'wxt/browser';

/**
 * runtime.getURL with a dynamic path. WXT generates a strict union of known
 * public files (PublicPath) which cannot cover the vendored engine data laid
 * out under public/grammalecte/ at arbitrary depth; the extension owns that
 * layout, so the unchecked cast is confined to this one helper.
 */
export function getURLUnchecked(path: string): string {
  return (browser.runtime as { getURL: (path: string) => string }).getURL(path);
}
