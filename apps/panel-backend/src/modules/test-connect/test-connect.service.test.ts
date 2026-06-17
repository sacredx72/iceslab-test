import { describe, expect, it } from 'vitest';
import { parseRealityDestTarget, realityDestNote } from './test-connect.service.js';

describe('parseRealityDestTarget (K10)', () => {
  it('splits host:port and uses serverNames[0] as the SNI', () => {
    expect(
      parseRealityDestTarget('avatars.mds.yandex.net:443', ['avatars.mds.yandex.net']),
    ).toEqual({ host: 'avatars.mds.yandex.net', port: 443, sni: 'avatars.mds.yandex.net' });
  });

  it('defaults port to 443 when absent', () => {
    expect(parseRealityDestTarget('www.samsung.com', ['www.samsung.com'])).toEqual({
      host: 'www.samsung.com',
      port: 443,
      sni: 'www.samsung.com',
    });
  });

  it('honours a non-443 dest port', () => {
    expect(parseRealityDestTarget('127.0.0.1:8443', ['icecompany.tech'])).toEqual({
      host: '127.0.0.1',
      port: 8443,
      sni: 'icecompany.tech',
    });
  });

  it('falls back to the dest host as SNI when serverNames is empty', () => {
    expect(parseRealityDestTarget('dl.google.com:443', [])).toEqual({
      host: 'dl.google.com',
      port: 443,
      sni: 'dl.google.com',
    });
    expect(parseRealityDestTarget('dl.google.com:443', undefined)).toEqual({
      host: 'dl.google.com',
      port: 443,
      sni: 'dl.google.com',
    });
  });

  it('treats a non-numeric port as 443 (defensive)', () => {
    expect(parseRealityDestTarget('host.example:abc', ['host.example']).port).toBe(443);
  });

  it('returns null for an empty dest', () => {
    expect(parseRealityDestTarget('', ['x'])).toBeNull();
  });
});

describe('realityDestNote (H1)', () => {
  it('returns undefined for a CDN-grade dest (TLS 1.3 + h2)', () => {
    expect(realityDestNote('TLSv1.3', 'h2')).toBeUndefined();
  });
  it('flags a dest that only speaks TLS 1.2 (no h2 clause when ALPN is h2)', () => {
    const note = realityDestNote('TLSv1.2', 'h2');
    expect(note).toContain('TLS 1.3');
    // The h2-specific clause names "ALPN"; the closing recommendation still
    // mentions HTTP/2, so assert on the clause marker, not the substring HTTP/2.
    expect(note).not.toContain('ALPN');
  });
  it('flags a dest that does not negotiate HTTP/2', () => {
    const note = realityDestNote('TLSv1.3', 'http/1.1');
    expect(note).toContain('HTTP/2');
    expect(note).toContain('http/1.1');
  });
  it('flags a dest with no ALPN at all', () => {
    expect(realityDestNote('TLSv1.3', '')).toContain('absent');
  });
  it('reports both problems when the dest fails TLS 1.3 and h2', () => {
    const note = realityDestNote('TLSv1.2', '');
    expect(note).toContain('TLS 1.3');
    expect(note).toContain('HTTP/2');
  });
  it('skips the h2 check when ALPN was not probed (alpn undefined)', () => {
    expect(realityDestNote('TLSv1.3', undefined)).toBeUndefined();
    expect(realityDestNote('TLSv1.2', undefined)).toContain('TLS 1.3');
  });
});
