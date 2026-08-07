import { describe, it, expect } from 'vitest';
import { safeNext, authRedirectTo } from './nextPath';

describe('safeNext', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeNext('/opportunities/abc-123')).toBe('/opportunities/abc-123');
    expect(safeNext('/support?status=open')).toBe('/support?status=open');
  });

  it('rejects anything that could leave the origin', () => {
    // Open-redirect vectors: an attacker-supplied `next` must never send a
    // freshly-authenticated user off-site.
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext('')).toBeNull();
  });
});

describe('authRedirectTo', () => {
  it('preserves a deep link so it survives sign-in', () => {
    expect(authRedirectTo('/opportunities/abc-123')).toBe(
      '/auth?next=%2Fopportunities%2Fabc-123',
    );
  });

  it('keeps the query string', () => {
    expect(authRedirectTo('/support', '?status=open')).toBe(
      '/auth?next=%2Fsupport%3Fstatus%3Dopen',
    );
  });

  it('does not add a pointless next for the root or the auth screen', () => {
    expect(authRedirectTo('/')).toBe('/auth');
    expect(authRedirectTo('/auth')).toBe('/auth');
  });
});
