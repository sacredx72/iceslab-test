import { describe, expect, it } from 'vitest';
import { validateCascadeHops, CascadeValidationError } from './cascade.validation.js';
import type { CascadeHopInput } from './cascade.schemas.js';

const N1 = '11111111-1111-1111-1111-111111111111';
const N2 = '22222222-2222-2222-2222-222222222222';
const N3 = '33333333-3333-3333-3333-333333333333';

// A valid 2-hop cascade: RU entry (xray) -> EU exit (direct).
function valid2(): CascadeHopInput[] {
  return [
    { nodeId: N1, position: 0, entryProtocol: 'xray', linkProtocol: 'xray' },
    { nodeId: N2, position: 1 },
  ];
}

describe('validateCascadeHops', () => {
  it('accepts a valid 2-hop entry->exit cascade and returns it sorted', () => {
    const out = validateCascadeHops([valid2()[1]!, valid2()[0]!]); // reversed input
    expect(out.map((h) => h.position)).toEqual([0, 1]);
    expect(out[0]!.nodeId).toBe(N1);
  });

  it('accepts a 3-hop entry->transit->exit chain', () => {
    const hops: CascadeHopInput[] = [
      { nodeId: N1, position: 0, entryProtocol: 'xray', linkProtocol: 'xray' },
      { nodeId: N2, position: 1, linkProtocol: 'shadowsocks' },
      { nodeId: N3, position: 2 },
    ];
    expect(() => validateCascadeHops(hops)).not.toThrow();
  });

  it('rejects fewer than 2 hops', () => {
    expect(() => validateCascadeHops([valid2()[0]!])).toThrow(CascadeValidationError);
  });

  it('rejects non-contiguous positions', () => {
    const hops = valid2();
    hops[1]!.position = 2;
    expect(() => validateCascadeHops(hops)).toThrow(/contiguous/);
  });

  it('requires an entryProtocol on the entry hop', () => {
    const hops = valid2();
    delete hops[0]!.entryProtocol;
    expect(() => validateCascadeHops(hops)).toThrow(/entry hop/);
  });

  it('rejects entryProtocol on a non-entry hop', () => {
    const hops = valid2();
    hops[1]!.entryProtocol = 'xray';
    expect(() => validateCascadeHops(hops)).toThrow(/only valid on the entry hop/);
  });

  it('requires linkProtocol on a non-exit hop', () => {
    const hops = valid2();
    delete hops[0]!.linkProtocol;
    expect(() => validateCascadeHops(hops)).toThrow(/needs a linkProtocol/);
  });

  it('rejects linkProtocol on the exit hop', () => {
    const hops = valid2();
    hops[1]!.linkProtocol = 'xray';
    expect(() => validateCascadeHops(hops)).toThrow(/exit hop egresses direct/);
  });

  it('rejects a node appearing twice', () => {
    const hops = valid2();
    hops[1]!.nodeId = N1;
    expect(() => validateCascadeHops(hops)).toThrow(/more than once/);
  });
});
