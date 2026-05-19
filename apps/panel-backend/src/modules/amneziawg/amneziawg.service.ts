import type { AmneziawgPeer } from '../../generated/prisma/client.js';
import { prisma } from '../../prisma.js';
import { intToIp, ipToInt, parseSubnet } from './amneziawg.subnet.js';

// Default AmneziaWG subnet. Picked far from typical hosting-provider
// infrastructure ranges — Aeza's internal gateway sits on 10.0.0.1,
// so any AWG server tunnel-IP of 10.0.0.1/24 collides with the host's
// default route and the VPS loses connectivity minutes after the
// interface comes up (caught live cycle #6 2026-05-12 via Aeza support).
// 10.66.66.0/24 is uncommon enough to avoid most cloud-provider clashes;
// admins can still override per-profile via the UI.
export const DEFAULT_SUBNET = '10.66.66.0/24';

export class IpExhaustedError extends Error {
  constructor(
    public readonly profileId: string,
    public readonly subnet: string,
  ) {
    super(`No free IPs left in ${subnet} for profile ${profileId}`);
    this.name = 'IpExhaustedError';
  }
}

export async function getPeer(
  profileId: string,
  userId: string,
): Promise<AmneziawgPeer | null> {
  return prisma.amneziawgPeer.findUnique({
    where: { profileId_userId: { profileId, userId } },
  });
}

export async function listPeers(profileId: string): Promise<AmneziawgPeer[]> {
  const rows = await prisma.amneziawgPeer.findMany({ where: { profileId } });
  return rows.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
}

/**
 * Allocate a stable IP for (profile, user). Idempotent — returns the existing
 * row if one is already there. Picks the lowest unused address inside the
 * subnet (skipping network, server, and broadcast).
 *
 * Slice 27 — keyed on profile (the logical AmneziaWG inbound) instead of the
 * old per-node inbound. Same user gets the same IP across every node a profile
 * is bound to; separate WG processes per node never see each other so this is
 * safe.
 *
 * Race-safe via the UNIQUE(profile_id, ip) constraint: a concurrent allocator
 * that grabs our chosen IP triggers a P2002, we re-scan and try the next free
 * slot. A concurrent allocator for the same user collapses to the existing row
 * via UNIQUE(profile_id, user_id).
 */
export async function allocatePeer(
  profileId: string,
  userId: string,
  subnet: string = DEFAULT_SUBNET,
): Promise<AmneziawgPeer> {
  const range = parseSubnet(subnet);
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const existing = await getPeer(profileId, userId);
    if (existing) return existing;

    const taken = new Set(
      (await listPeers(profileId)).map((p) => ipToInt(p.ip)),
    );
    let free: number | null = null;
    for (let n = range.firstUsable; n <= range.lastUsable; n++) {
      if (!taken.has(n)) {
        free = n;
        break;
      }
    }
    if (free === null) throw new IpExhaustedError(profileId, subnet);

    try {
      return await prisma.amneziawgPeer.create({
        data: { profileId, userId, ip: intToIp(free) },
      });
    } catch {
      // P2002 on either UNIQUE — loop will pick existing or next free.
    }
  }
  throw new Error(
    `Failed to allocate amneziawg peer for profile ${profileId} after ${maxAttempts} attempts`,
  );
}

export async function releasePeer(
  profileId: string,
  userId: string,
): Promise<void> {
  await prisma.amneziawgPeer.deleteMany({ where: { profileId, userId } });
}
