import { describe, expect, it } from 'vitest';
import { intToIp, ipToInt, parseSubnet } from './amneziawg.subnet.js';

describe('ipToInt / intToIp', () => {
  it('round-trips boundary values', () => {
    for (const ip of ['0.0.0.0', '10.0.0.1', '172.16.5.10', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });

  it('rejects malformed addresses', () => {
    expect(() => ipToInt('10.0.0')).toThrow();
    expect(() => ipToInt('10.0.0.256')).toThrow();
    expect(() => ipToInt('10.0.0.x')).toThrow();
    expect(() => ipToInt('10..0.1')).toThrow();
  });
});

describe('parseSubnet', () => {
  it('produces the right usable range for 10.0.0.0/24', () => {
    const r = parseSubnet('10.0.0.0/24');
    expect(intToIp(r.base)).toBe('10.0.0.0');
    expect(intToIp(r.serverIp)).toBe('10.0.0.1');
    expect(intToIp(r.firstUsable)).toBe('10.0.0.2');
    expect(intToIp(r.lastUsable)).toBe('10.0.0.254');
    expect(r.lastUsable - r.firstUsable + 1).toBe(253);
  });

  it('aligns ip to network boundary', () => {
    const r = parseSubnet('10.0.0.55/24');
    expect(intToIp(r.base)).toBe('10.0.0.0');
  });

  it('handles /23', () => {
    const r = parseSubnet('10.0.0.0/23');
    expect(intToIp(r.firstUsable)).toBe('10.0.0.2');
    expect(intToIp(r.lastUsable)).toBe('10.0.1.254');
  });

  it('rejects too-small or invalid prefixes', () => {
    expect(() => parseSubnet('10.0.0.0/31')).toThrow();
    expect(() => parseSubnet('10.0.0.0/7')).toThrow();
    expect(() => parseSubnet('10.0.0.0')).toThrow();
    expect(() => parseSubnet('not-a-cidr')).toThrow();
  });
});
