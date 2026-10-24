import { describe, expect, it } from 'vitest';
import { domainFromUrl, isSubdomainOf, normalizeDomain } from './sites';

describe('domain normalization', () => {
  it('strips scheme, path and www', () => {
    expect(normalizeDomain('  WWW.Example.FR ')).toBe('example.fr');
    expect(domainFromUrl('https://www.example.fr/a/b?q=1')).toBe('example.fr');
    expect(domainFromUrl('http://example.fr')).toBe('example.fr');
  });

  it('rejects non-web URLs', () => {
    expect(domainFromUrl('file:///tmp/test.html')).toBe('');
    expect(domainFromUrl('not a url')).toBe('');
  });
});

describe('disabled-site matching', () => {
  it('matches the entry and its subdomains only', () => {
    expect(isSubdomainOf('example.fr', 'example.fr')).toBe(true);
    expect(isSubdomainOf('mail.example.fr', 'example.fr')).toBe(true);
    expect(isSubdomainOf('deep.mail.example.fr', 'example.fr')).toBe(true);
    expect(isSubdomainOf('notexample.fr', 'example.fr')).toBe(false);
    expect(isSubdomainOf('example.fr.eu.org', 'example.fr')).toBe(false);
  });
});
