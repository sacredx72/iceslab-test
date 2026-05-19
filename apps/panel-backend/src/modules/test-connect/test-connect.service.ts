import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { prisma } from '../../prisma.js';
import { hostFromAddress } from '../subscription/subscription.formats.js';

export interface ProbeResult {
  bindingId: string;
  hostId: string | null;
  hostRemark: string;
  protocol: string;
  nodeName: string;
  // Effective endpoint we probed (after binding + host overrides).
  endpoint: string;
  port: number;
  // What kind of probe ran: tcp / tls / skip.
  probe: 'tcp' | 'tls' | 'skip';
  // For TLS probes — SNI we sent. Lets admins eyeball the masquerade target.
  sni?: string;
  ok: boolean;
  latencyMs?: number;
  // TLS-only — peer cert subject CN. For REALITY this should match the
  // masquerade target (apple.com, etc), NOT the panel's own host.
  certCn?: string;
  error?: string;
  // Hint for the UI when we couldn't run a real probe (UDP-based
  // protocols fall back to a TCP port reachability check, which is
  // less informative — we annotate so admins don't misread a green tick).
  notes?: string;
}

/** Default for `?timeout=` — keep low so a hung probe doesn't stall the response. */
const PROBE_TIMEOUT_MS = 5_000;

const TLS_PROTOCOLS = new Set(['xray', 'naive']);
// UDP-based — TCP probe doesn't actually validate the protocol, but it does
// check the route + firewall. Admin gets a yellow note pointing this out.
const UDP_PROTOCOLS = new Set(['hysteria', 'amneziawg', 'mieru']);

/**
 * Probe a single (binding, host) target. Returns within `PROBE_TIMEOUT_MS`
 * even on a hung peer — never throws.
 */
async function probe(target: {
  bindingId: string;
  hostId: string | null;
  hostRemark: string;
  protocol: string;
  nodeName: string;
  endpoint: string;
  port: number;
  sni: string | null;
  isUdp: boolean;
  isTls: boolean;
}): Promise<ProbeResult> {
  const base: Pick<ProbeResult, 'bindingId' | 'hostId' | 'hostRemark' | 'protocol' | 'nodeName' | 'endpoint' | 'port'> = {
    bindingId: target.bindingId,
    hostId: target.hostId,
    hostRemark: target.hostRemark,
    protocol: target.protocol,
    nodeName: target.nodeName,
    endpoint: target.endpoint,
    port: target.port,
  };

  // TLS probe — for REALITY/xray and Naive. We disable cert-chain validation
  // because (a) REALITY uses a borrowed cert chain we can't pre-trust, and
  // (b) self-hosted Naive often runs ACME staging during development. The
  // useful signal is "did the handshake complete?" + the peer CN, not a
  // valid chain.
  if (target.isTls && target.sni) {
    const start = Date.now();
    return await new Promise<ProbeResult>((resolve) => {
      const sock = tlsConnect({
        host: target.endpoint,
        port: target.port,
        servername: target.sni!,
        rejectUnauthorized: false,
        // ALPN chosen by adapter — leave blank, server picks.
      });
      const onResult = (r: ProbeResult) => {
        sock.destroy();
        resolve(r);
      };
      const t = setTimeout(() => {
        onResult({
          ...base,
          probe: 'tls',
          sni: target.sni ?? undefined,
          ok: false,
          error: `TLS handshake timeout after ${PROBE_TIMEOUT_MS}ms`,
        });
      }, PROBE_TIMEOUT_MS);
      sock.once('secureConnect', () => {
        clearTimeout(t);
        const cert = sock.getPeerCertificate();
        const subjectCn = cert?.subject?.CN;
        const sanRaw = cert?.subjectaltname;
        const cn =
          (typeof subjectCn === 'string' && subjectCn.length > 0
            ? subjectCn
            : Array.isArray(sanRaw)
              ? sanRaw.join(', ')
              : typeof sanRaw === 'string'
                ? sanRaw
                : undefined) || undefined;
        onResult({
          ...base,
          probe: 'tls',
          sni: target.sni ?? undefined,
          ok: true,
          latencyMs: Date.now() - start,
          certCn: cn,
        });
      });
      sock.once('error', (err) => {
        clearTimeout(t);
        onResult({
          ...base,
          probe: 'tls',
          sni: target.sni ?? undefined,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  // TCP probe — fallback for everything else. For UDP-based protocols we
  // attach a `notes` field so the UI doesn't lie about what was tested.
  const start = Date.now();
  return await new Promise<ProbeResult>((resolve) => {
    const sock = netConnect({ host: target.endpoint, port: target.port });
    const onResult = (r: ProbeResult) => {
      sock.destroy();
      resolve(r);
    };
    const t = setTimeout(() => {
      onResult({
        ...base,
        probe: 'tcp',
        ok: false,
        error: `TCP connect timeout after ${PROBE_TIMEOUT_MS}ms`,
        ...(target.isUdp ? { notes: 'UDP-based protocol — tested TCP port reachability only.' } : {}),
      });
    }, PROBE_TIMEOUT_MS);
    sock.once('connect', () => {
      clearTimeout(t);
      onResult({
        ...base,
        probe: 'tcp',
        ok: true,
        latencyMs: Date.now() - start,
        ...(target.isUdp ? { notes: 'UDP-based protocol — TCP reachability only; for full validation install client and try connecting.' } : {}),
      });
    });
    sock.once('error', (err) => {
      clearTimeout(t);
      onResult({
        ...base,
        probe: 'tcp',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ...(target.isUdp ? { notes: 'UDP-based protocol — tested TCP port reachability only.' } : {}),
      });
    });
  });
}

/**
 * Run probes for every (enabled) binding × host of the given profile,
 * concurrently. Returns one row per probe. Order is deterministic
 * (binding.port asc, then host.priority asc) so the UI can render a
 * stable list across re-runs.
 */
export async function testProfileConnect(profileId: string): Promise<ProbeResult[]> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) {
    throw new Error('Profile not found');
  }

  const bindings = await prisma.profileNodeBinding.findMany({
    where: { profileId, enabled: true, node: { deletedAt: null } },
    include: {
      node: { select: { name: true, address: true } },
      hosts: { where: { enabled: true }, orderBy: [{ priority: 'asc' }] },
    },
    orderBy: [{ port: 'asc' }],
  });

  const isTls = TLS_PROTOCOLS.has(profile.protocol);
  const isUdp = UDP_PROTOCOLS.has(profile.protocol);
  const protocolConfig = (profile.config ?? {}) as Record<string, unknown>;

  const targets: Parameters<typeof probe>[0][] = [];

  for (const b of bindings) {
    const baseHost = b.publicHost ?? hostFromAddress(b.node.address);
    const basePort = b.publicPort ?? b.port;
    const profileSni = (() => {
      const names = (protocolConfig.realityServerNames as string[] | undefined) ?? [];
      return typeof names[0] === 'string' ? names[0] : null;
    })();

    const hostRows = b.hosts.length > 0 ? b.hosts : [null];
    for (const h of hostRows) {
      const endpoint = h?.addressOverride ?? baseHost;
      const port = h?.portOverride ?? basePort;
      const sni = h?.sniOverride ?? profileSni ?? endpoint;
      targets.push({
        bindingId: b.id,
        hostId: h?.id ?? null,
        hostRemark: h?.remark ?? 'Default',
        protocol: profile.protocol,
        nodeName: b.node.name,
        endpoint,
        port,
        sni: isTls ? sni : null,
        isUdp,
        isTls,
      });
    }
  }

  // Run all probes in parallel — each is bounded by PROBE_TIMEOUT_MS so
  // the worst-case latency of the response is ~1× timeout regardless of
  // how many bindings the profile has.
  return await Promise.all(targets.map((t) => probe(t)));
}
