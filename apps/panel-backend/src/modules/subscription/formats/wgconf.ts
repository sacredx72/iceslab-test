import { buildAmneziawgClientConfig } from '../../../core-adapters/amneziawg/index.js';
import type { SubscriptionEndpoint } from '../subscription.formats.js';

/**
 * wg-quick / awg-quick `.conf` subscription formatter (AmneziaWG-only).
 *
 * Targets the AmneziaVPN-app, the AmneziaWG mobile clients, and stock
 * `wg-quick` for users on AmneziaWG-aware kernels. Output is the textual
 * `[Interface]` + `[Peer]` blob produced by `buildAmneziawgClientConfig`.
 *
 * Limitations:
 *   - **Single node only.** wg-quick is one [Interface] per file; multi-node
 *     clients can't merge several AmneziaWG tunnels into one config. We emit
 *     the first AmneziaWG endpoint and rely on Subscription Response Rules
 *     (slice 22) or per-node subscription URLs to route a client to its
 *     intended node.
 *   - **AmneziaWG-only.** hysteria/xray/naive endpoints are skipped silently.
 *     The client picked this format because their app speaks wg-quick; other
 *     protocols don't translate to it.
 *
 * Returns an empty string when no AmneziaWG endpoint is available — the
 * route handler turns that into a 204-style empty body, telling the client
 * "no AmneziaWG inbound configured for you".
 */
export function buildWgQuickConf(endpoints: SubscriptionEndpoint[]): string {
  const awg = endpoints.find((e) => e.protocol === 'amneziawg');
  if (!awg || awg.protocol !== 'amneziawg') return '';

  return buildAmneziawgClientConfig({
    privateKey: awg.privateKey,
    allowedIp: awg.allowedIp,
    serverPublicKey: awg.serverPublicKey,
    host: awg.host,
    port: awg.port,
    jc: awg.jc,
    jmin: awg.jmin,
    jmax: awg.jmax,
    s1: awg.s1,
    s2: awg.s2,
    s3: awg.s3,
    s4: awg.s4,
    h1: awg.h1,
    h2: awg.h2,
    h3: awg.h3,
    h4: awg.h4,
    i1: awg.i1,
    i2: awg.i2,
    i3: awg.i3,
    i4: awg.i4,
    i5: awg.i5,
  });
}
