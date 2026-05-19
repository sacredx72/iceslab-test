import { describe, expect, it } from 'vitest';
import { buildXrayJson } from './xrayjson.js';
import type { SubscriptionEndpoint } from '../subscription.formats.js';

const xrayEp: SubscriptionEndpoint = {
  protocol: 'xray',
  nodeName: 'eu-1',
  host: 'n1.example.com',
  port: 443,
  uuid: '11111111-2222-3333-4444-555555555555',
  publicKey: 'pubkey-base64url',
  shortId: 'abc123',
  sni: 'www.cloudflare.com',
  flow: 'xtls-rprx-vision',
  fingerprint: 'chrome',
  uri: 'vless://...',
};

const hysteriaEp: SubscriptionEndpoint = {
  protocol: 'hysteria',
  nodeName: 'eu-1',
  host: 'n1.example.com',
  port: 443,
  password: 'hy',
  uri: 'hysteria2://...',
};

function parse(out: string) {
  return JSON.parse(out);
}

describe('buildXrayJson', () => {
  it('produces valid JSON with trailing newline', () => {
    const out = buildXrayJson([xrayEp]);
    expect(out.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('emits a SOCKS5 inbound on 127.0.0.1:10808 with udp enabled', () => {
    const cfg = parse(buildXrayJson([xrayEp]));
    expect(cfg.inbounds).toHaveLength(1);
    expect(cfg.inbounds[0].protocol).toBe('socks');
    expect(cfg.inbounds[0].port).toBe(10808);
    expect(cfg.inbounds[0].listen).toBe('127.0.0.1');
    expect(cfg.inbounds[0].settings.udp).toBe(true);
  });

  it('emits a vless+REALITY outbound with v24.9.30 raw network', () => {
    const cfg = parse(buildXrayJson([xrayEp]));
    const v = cfg.outbounds.find((o: any) => o.protocol === 'vless');
    expect(v.tag).toBe('eu-1-xray');
    const user = v.settings.vnext[0].users[0];
    expect(user.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(user.flow).toBe('xtls-rprx-vision');
    expect(user.encryption).toBe('none');
    expect(v.streamSettings.network).toBe('raw');
    expect(v.streamSettings.security).toBe('reality');
    expect(v.streamSettings.realitySettings.publicKey).toBe('pubkey-base64url');
    expect(v.streamSettings.realitySettings.shortId).toBe('abc123');
    expect(v.streamSettings.realitySettings.serverName).toBe('www.cloudflare.com');
    expect(v.streamSettings.realitySettings.fingerprint).toBe('chrome');
  });

  it('always includes freedom (direct) and blackhole (block) outbounds', () => {
    const cfg = parse(buildXrayJson([xrayEp]));
    expect(cfg.outbounds.find((o: any) => o.protocol === 'freedom')).toBeDefined();
    expect(cfg.outbounds.find((o: any) => o.protocol === 'blackhole')).toBeDefined();
  });

  it('sets a catch-all route to the first proxy when xray endpoints exist', () => {
    const second: SubscriptionEndpoint = { ...xrayEp, nodeName: 'us-1' };
    const cfg = parse(buildXrayJson([xrayEp, second]));
    expect(cfg.routing.rules[0].outboundTag).toBe('eu-1-xray');
    expect(cfg.routing.rules[0].network).toBe('tcp,udp');
  });

  it('falls back to routing through direct when no xray endpoint is present', () => {
    const cfg = parse(buildXrayJson([hysteriaEp]));
    expect(cfg.routing.rules[0].outboundTag).toBe('direct');
    // No vless outbound emitted.
    expect(cfg.outbounds.find((o: any) => o.protocol === 'vless')).toBeUndefined();
  });

  it('skips non-xray endpoints silently', () => {
    const out = buildXrayJson([hysteriaEp, xrayEp]);
    expect(out).not.toContain('hy-secret');
    expect(out).not.toContain('hysteria2');
    expect(out).toContain('eu-1-xray');
  });

  it('output is byte-deterministic for the same input', () => {
    expect(buildXrayJson([xrayEp])).toBe(buildXrayJson([xrayEp]));
  });
});
