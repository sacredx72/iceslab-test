import type { SubscriptionEndpoint } from '../subscription.formats.js';

/**
 * Xray-core client JSON subscription formatter.
 *
 * Targets v2rayN, NekoRay/NekoBox in Xray mode, and any client that imports
 * "Xray JSON" subscription URLs (i.e. apps that run xray-core under the hood).
 *
 * Scope: VLESS+REALITY+Vision endpoints only. Hysteria2 is reachable from
 * Xray (via the `hysteria2` outbound) but most Xray-native clients still
 * default to vmess/vless — users who want Hysteria pick the Sing-box format
 * or the plain hysteria2:// URI directly. Keeping this format VLESS-only
 * dodges the cross-protocol matrix and avoids subtle xray-version-coupled
 * outbound shape drift.
 *
 * Output shape:
 *   - `log`: warning-level
 *   - `inbounds`: a single SOCKS5 inbound on 127.0.0.1:10808 (UDP enabled)
 *     so local apps can dial through the tunnel
 *   - `outbounds`: one vless+REALITY entry per endpoint, plus `freedom`
 *     (`direct`) and `blackhole` (`block`) for routing rules
 *   - `routing`: catch-all → first proxy. The client UI lets the user pick
 *     a different outbound by tag.
 */
/**
 * Slice 29 follow-up — Xray `observatory + balancer` for auto-failover.
 * When `bundle === 'balancer'`, we emit an `observatory` block that periodically
 * probes every proxy outbound, and route through a balancer-tagged tag that
 * picks the lowest-latency one. Default ('flat') keeps the legacy "first
 * outbound wins" routing rule for back-compat.
 */
export interface XrayJsonBuildOpts {
  bundle?: 'flat' | 'balancer';
  probeUrl?: string;
  probeIntervalSec?: number;
}

export function buildXrayJson(
  endpoints: SubscriptionEndpoint[],
  opts: XrayJsonBuildOpts = {},
): string {
  const xrayEps = endpoints.filter((e) => e.protocol === 'xray');
  const proxyTags: string[] = [];
  const bundle = opts.bundle ?? 'flat';

  const proxyOutbounds = xrayEps.map((e) => {
    if (e.protocol !== 'xray') throw new Error('unreachable'); // narrowing
    const tag = `${e.nodeName}-xray`;
    proxyTags.push(tag);
    return {
      tag,
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address: e.host,
            port: e.port,
            users: [
              {
                id: e.uuid,
                encryption: 'none',
                flow: e.flow,
              },
            ],
          },
        ],
      },
      streamSettings: {
        network: 'raw',
        security: 'reality',
        realitySettings: {
          publicKey: e.publicKey,
          shortId: e.shortId,
          serverName: e.sni,
          fingerprint: e.fingerprint,
          show: false,
          spiderX: '',
        },
      },
    };
  });

  // Slice 29 follow-up — when balancer is on AND we have ≥2 proxies, wrap
  // the proxy tags in an `observatory` probe + `balancer` selector. With
  // <2 proxies it's pointless (and the balancer block would still work but
  // probe one outbound, wasting bandwidth) so we fall through to flat mode.
  const balancerActive = bundle === 'balancer' && proxyTags.length >= 2;
  const observatory = balancerActive
    ? {
        subjectSelector: proxyTags,
        probeURL: opts.probeUrl ?? 'https://www.gstatic.com/generate_204',
        probeInterval: `${opts.probeIntervalSec ?? 300}s`,
      }
    : undefined;
  const balancers = balancerActive
    ? [{ tag: 'balancer-auto', selector: proxyTags, strategy: { type: 'leastPing' } }]
    : undefined;

  const config: Record<string, unknown> = {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        tag: 'socks-in',
        port: 10808,
        listen: '127.0.0.1',
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true },
      },
    ],
    outbounds: [
      ...proxyOutbounds,
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: {
      domainStrategy: 'AsIs',
      ...(balancers ? { balancers } : {}),
      rules: [
        balancerActive
          ? { type: 'field', network: 'tcp,udp', balancerTag: 'balancer-auto' }
          : proxyTags.length > 0
          ? { type: 'field', network: 'tcp,udp', outboundTag: proxyTags[0] }
          : { type: 'field', network: 'tcp,udp', outboundTag: 'direct' },
      ],
    },
  };
  if (observatory) config.observatory = observatory;
  return JSON.stringify(config, null, 2) + '\n';
}
