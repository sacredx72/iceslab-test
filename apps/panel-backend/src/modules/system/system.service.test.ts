import { describe, expect, it } from 'vitest';
import { isNewer } from './system.service.js';

describe('isNewer', () => {
  it('detects a newer patch / minor / major', () => {
    expect(isNewer('0.1.5', '0.1.4')).toBe(true);
    expect(isNewer('0.2.0', '0.1.4')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
  });

  it('returns false for an equal or older latest', () => {
    expect(isNewer('0.1.4', '0.1.4')).toBe(false);
    expect(isNewer('0.1.3', '0.1.4')).toBe(false);
    expect(isNewer('0.1.4', '0.2.0')).toBe(false);
  });

  it('ignores a leading v and pre-release / build suffixes', () => {
    expect(isNewer('v0.1.5', '0.1.4')).toBe(true);
    expect(isNewer('v0.1.4', 'v0.1.4')).toBe(false);
    expect(isNewer('0.1.5-rc.1', '0.1.4')).toBe(true);
    expect(isNewer('0.1.4+build.9', '0.1.4')).toBe(false);
  });

  it('handles differing component counts', () => {
    expect(isNewer('0.2', '0.1.9')).toBe(true);
    expect(isNewer('0.1', '0.1.0')).toBe(false);
  });
});
