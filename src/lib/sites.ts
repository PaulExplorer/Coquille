/**
 * Domain normalization used for per-site enable/disable.
 * Keep the functions dependency-free so they are testable directly.
 */

export const W3_SUBDOMAIN = 'www.';

export function normalizeDomain(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./u, '');
}

/** Best-effort domain extraction from a URL; empty string when not http(s). */
export function domainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return normalizeDomain(parsed.hostname);
  } catch {
    return '';
  }
}

/** True when domain must match or be a subdomain of the disabled entry. */
export function isSubdomainOf(domain: string, entry: string): boolean {
  if (domain === entry) return true;
  return domain.endsWith(`.${entry}`);
}
