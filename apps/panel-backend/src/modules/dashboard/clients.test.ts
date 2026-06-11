import { describe, expect, it } from 'vitest';
import { classifyClient } from './clients.js';

describe('classifyClient', () => {
  it('returns Unknown for empty/null UA', () => {
    expect(classifyClient(null)).toBe('Unknown');
    expect(classifyClient(undefined)).toBe('Unknown');
    expect(classifyClient('')).toBe('Unknown');
    expect(classifyClient('   ')).toBe('Unknown');
  });

  it('disambiguates v2rayNG from v2rayN (substring trap)', () => {
    expect(classifyClient('v2rayNG/1.8.5 (Android)')).toBe('v2rayNG');
    expect(classifyClient('v2rayN/6.23')).toBe('v2rayN');
  });

  it('disambiguates Clash.Meta / mihomo from generic Clash', () => {
    expect(classifyClient('ClashMetaForAndroid/2.10')).toBe('Clash.Meta');
    expect(classifyClient('mihomo/1.18.0')).toBe('Clash.Meta');
    expect(classifyClient('clash-verge/1.6.0')).toBe('Clash');
    expect(classifyClient('ClashX/1.118.0')).toBe('Clash');
  });

  it('maps sing-box official apps (SFA/SFI/SFM) and sing-box UA', () => {
    expect(classifyClient('SFA/1.9.0 (io.nekohasekai.sfa)')).toBe('sing-box');
    expect(classifyClient('SFI/1.10.1')).toBe('sing-box');
    expect(classifyClient('sing-box 1.9.3')).toBe('sing-box');
  });

  it('maps common mobile clients', () => {
    expect(classifyClient('Hiddify/2.0.5')).toBe('Hiddify');
    expect(classifyClient('HiddifyNext/0.16.0')).toBe('Hiddify');
    expect(classifyClient('Streisand/1.6.0')).toBe('Streisand');
    expect(classifyClient('Shadowrocket/2.2.43')).toBe('Shadowrocket');
    expect(classifyClient('Happ/1.0')).toBe('Happ');
    expect(classifyClient('NekoBox/1.3.3')).toBe('NekoBox');
  });

  it('buckets browsers and scripted fetches', () => {
    expect(classifyClient('Mozilla/5.0 (Windows NT 10.0; Win64)')).toBe('Browser/Script');
    expect(classifyClient('curl/8.4.0')).toBe('Browser/Script');
    expect(classifyClient('Go-http-client/2.0')).toBe('Browser/Script');
  });

  it('falls back to Other for unrecognised real-looking UAs', () => {
    expect(classifyClient('SomeBrandNewClient/9.9')).toBe('Other');
  });
});
