import { describe, expect, it } from 'vitest';
import { resolveSquadHwidLimit } from './hwid.service.js';

// K7 - the per-squad HWID device-limit merge rule (max = most-permissive).
describe('resolveSquadHwidLimit', () => {
  it('returns null when no squad sets a default', () => {
    expect(resolveSquadHwidLimit([null, null])).toBe(null);
    expect(resolveSquadHwidLimit([])).toBe(null);
  });

  it('uses the single squad default', () => {
    expect(resolveSquadHwidLimit([null, 3])).toBe(3);
  });

  it('takes the MAX (most-permissive cohort) across squads', () => {
    expect(resolveSquadHwidLimit([2, 5, null])).toBe(5);
    expect(resolveSquadHwidLimit([5, 2])).toBe(5);
  });

  it('ignores non-positive values', () => {
    expect(resolveSquadHwidLimit([0, -1, 4])).toBe(4);
    expect(resolveSquadHwidLimit([0, -1])).toBe(null);
  });
});
