import { randomUUID } from 'node:crypto';

/**
 * C2 - cascade config generation for the native vless->vless cell (the first
 * cell the node-agent realises in C3). Pure + testable: maps an ordered hop
 * list + pre-generated inter-hop link creds into per-node xray inbound/outbound
 * /routing fragments by role (entry / transit / exit).
 *
 * Topology (proxy-chain, terminate-at-each-hop so the entry can split-route):
 *   entry:   user-inbound (already deployed via the node's profile) + a
 *            link-OUT to hop[1]; route user traffic -> link-out.
 *   transit: link-IN (from prev) + link-OUT (to next); link-in -> link-out.
 *   exit:    link-IN (from prev) + freedom; link-in -> direct.
 *
 * Other cells (ss2022/wg links, hy2/naive bridges) extend this later.
 */

// Inter-hop link port base. The link from hop[i] to hop[i+1] listens on the
// RECEIVING node at LINK_PORT_BASE + i. High to dodge user inbounds; the
// node-agent (C3) firewalls it to peer nodes and ensures it's free.
export const LINK_PORT_BASE = 24000;

export interface LinkCred {
  /** VLESS user id shared by the originating hop's outbound and the next hop's inbound. */
  uuid: string;
  /** Port the receiving (next) hop listens on for this inter-hop link. */
  port: number;
}

/** Pre-generate link creds for the N-1 inter-hop links of an N-hop cascade. */
export function generateLinkCreds(hopCount: number): LinkCred[] {
  const creds: LinkCred[] = [];
  for (let i = 0; i < hopCount - 1; i++) {
    creds.push({ uuid: randomUUID(), port: LINK_PORT_BASE + i });
  }
  return creds;
}

export type HopRole = 'entry' | 'transit' | 'exit';

export interface CascadeConfigHopInput {
  nodeId: string;
  position: number;
  /** Public host the PREVIOUS hop dials to reach this node's link inbound. */
  nodeHost: string;
}

export interface HopConfig {
  nodeId: string;
  position: number;
  role: HopRole;
  inbounds: Record<string, unknown>[];
  outbounds: Record<string, unknown>[];
  routingRules: Record<string, unknown>[];
}

const LINK_IN_TAG = 'cascade-link-in';
const LINK_OUT_TAG = 'cascade-link-out';
const DIRECT_TAG = 'direct';

function vlessLinkInbound(cred: LinkCred): Record<string, unknown> {
  return {
    tag: LINK_IN_TAG,
    port: cred.port,
    listen: '0.0.0.0',
    protocol: 'vless',
    settings: { clients: [{ id: cred.uuid }], decryption: 'none' },
    streamSettings: { network: 'raw', security: 'none' },
  };
}

function vlessLinkOutbound(host: string, cred: LinkCred): Record<string, unknown> {
  return {
    tag: LINK_OUT_TAG,
    protocol: 'vless',
    settings: {
      vnext: [{ address: host, port: cred.port, users: [{ id: cred.uuid, encryption: 'none' }] }],
    },
    streamSettings: { network: 'raw', security: 'none' },
  };
}

const freedomOutbound: Record<string, unknown> = { tag: DIRECT_TAG, protocol: 'freedom' };

export function buildCascadeConfigs(
  hops: CascadeConfigHopInput[],
  linkCreds: LinkCred[],
): HopConfig[] {
  const sorted = [...hops].sort((a, b) => a.position - b.position);
  const n = sorted.length;
  return sorted.map((hop, i) => {
    const role: HopRole = i === 0 ? 'entry' : i === n - 1 ? 'exit' : 'transit';
    const linkIn = i > 0 ? linkCreds[i - 1] : null;
    const linkOut = i < n - 1 ? linkCreds[i] : null;

    const inbounds = linkIn ? [vlessLinkInbound(linkIn)] : [];
    const outbounds: Record<string, unknown>[] = [];
    if (linkOut) outbounds.push(vlessLinkOutbound(sorted[i + 1]!.nodeHost, linkOut));
    outbounds.push(freedomOutbound);

    const routingRules: Record<string, unknown>[] = [];
    if (role === 'entry') {
      // User traffic -> link-out. Split-routing presets can prepend
      // direct/block rules ahead of this later (E).
      routingRules.push({ type: 'field', network: 'tcp,udp', outboundTag: LINK_OUT_TAG });
    } else if (role === 'transit') {
      routingRules.push({ type: 'field', inboundTag: [LINK_IN_TAG], outboundTag: LINK_OUT_TAG });
    } else {
      routingRules.push({ type: 'field', inboundTag: [LINK_IN_TAG], outboundTag: DIRECT_TAG });
    }

    return { nodeId: hop.nodeId, position: hop.position, role, inbounds, outbounds, routingRules };
  });
}
