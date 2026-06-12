import { describe, expect, it } from 'vitest';
import {
  generateLinkCreds,
  buildCascadeConfigs,
  LINK_PORT_BASE,
  type CascadeConfigHopInput,
  type LinkCred,
} from './cascade.config.js';

describe('generateLinkCreds', () => {
  it('makes N-1 creds for an N-hop cascade, sequential ports, unique uuids', () => {
    const creds = generateLinkCreds(3);
    expect(creds).toHaveLength(2);
    expect(creds[0]!.port).toBe(LINK_PORT_BASE);
    expect(creds[1]!.port).toBe(LINK_PORT_BASE + 1);
    expect(creds[0]!.uuid).not.toBe(creds[1]!.uuid);
  });
  it('a 2-hop cascade has exactly one link', () => {
    expect(generateLinkCreds(2)).toHaveLength(1);
  });
});

describe('buildCascadeConfigs (vless->vless)', () => {
  const hops: CascadeConfigHopInput[] = [
    { nodeId: 'n0', position: 0, nodeHost: 'ru.example.com' },
    { nodeId: 'n1', position: 1, nodeHost: 'transit.example.com' },
    { nodeId: 'n2', position: 2, nodeHost: 'eu.example.com' },
  ];
  const creds: LinkCred[] = [
    { uuid: 'uuid-0', port: 24000 },
    { uuid: 'uuid-1', port: 24001 },
  ];

  it('entry has a link-out to the next hop + freedom, routes user traffic out', () => {
    const cfg = buildCascadeConfigs(hops, creds)[0]!;
    expect(cfg.role).toBe('entry');
    expect(cfg.inbounds).toEqual([]); // user inbound deployed via profile, not here
    const out = cfg.outbounds.find((o) => o.tag === 'cascade-link-out') as any;
    expect(out.settings.vnext[0].address).toBe('transit.example.com');
    expect(out.settings.vnext[0].port).toBe(24000);
    expect(out.settings.vnext[0].users[0].id).toBe('uuid-0');
    expect(cfg.outbounds.some((o) => o.protocol === 'freedom')).toBe(true);
    expect(cfg.routingRules[0]!.outboundTag).toBe('cascade-link-out');
  });

  it('transit has link-in (from prev) + link-out (to next), routed through', () => {
    const cfg = buildCascadeConfigs(hops, creds)[1]!;
    expect(cfg.role).toBe('transit');
    const inb = cfg.inbounds[0] as any;
    expect(inb.port).toBe(24000); // listens on the link FROM the entry
    expect(inb.settings.clients[0].id).toBe('uuid-0');
    const out = cfg.outbounds.find((o) => o.tag === 'cascade-link-out') as any;
    expect(out.settings.vnext[0].address).toBe('eu.example.com');
    expect(out.settings.vnext[0].port).toBe(24001);
    expect(out.settings.vnext[0].users[0].id).toBe('uuid-1');
    expect(cfg.routingRules[0]).toMatchObject({ inboundTag: ['cascade-link-in'], outboundTag: 'cascade-link-out' });
  });

  it('exit has link-in + freedom only, routes link-in -> direct', () => {
    const cfg = buildCascadeConfigs(hops, creds)[2]!;
    expect(cfg.role).toBe('exit');
    const inb = cfg.inbounds[0] as any;
    expect(inb.port).toBe(24001); // listens on the link FROM the transit
    expect(inb.settings.clients[0].id).toBe('uuid-1');
    expect(cfg.outbounds.every((o) => o.tag !== 'cascade-link-out')).toBe(true);
    expect(cfg.outbounds.some((o) => o.protocol === 'freedom')).toBe(true);
    expect(cfg.routingRules[0]).toMatchObject({ inboundTag: ['cascade-link-in'], outboundTag: 'direct' });
  });

  it('a 2-hop cascade is entry -> exit with one link', () => {
    const two = buildCascadeConfigs(hops.slice(0, 2), creds.slice(0, 1));
    expect(two.map((h) => h.role)).toEqual(['entry', 'exit']);
    expect((two[1]!.inbounds[0] as any).port).toBe(24000);
  });
});
