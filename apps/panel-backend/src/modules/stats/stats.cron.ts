import { prisma } from '../../prisma.js';
import { NodeTransport, NodeRequestError } from '../nodes/nodes.transport.js';

/**
 * Per-node in-memory snapshot of the last seen cumulative `totalBytesIn/Out`
 * from the agent. Used by the "no per-user accounting" fallback (mtproto +
 * any future single-counter adapter) to compute deltas tick-to-tick. Lives
 * in module scope — cleared when the backend restarts; that's fine, the
 * first tick after restart just records the current snapshot without
 * writing a fake spike.
 */
const totalSnapshot = new Map<string, { in: bigint; out: bigint }>();

/**
 * Poll per-user traffic stats from every online node and roll them into
 * `user_traffic.used_traffic_bytes` (per-user) and `node_usage_history`
 * (per-node, hourly bucket).
 *
 * Agent-side: xray's `api statsquery -reset` returns deltas since last
 * poll; the agent's `GET /stats` endpoint already wraps that. Other cores
 * (Hysteria/AWG/Naive/SS) don't expose per-user counters today — they're
 * absent from the response and silently skipped here.
 *
 * Apply `node.consumptionMultiplier` to the user-side delta so premium
 * regions count more (or less) against per-user limits.
 *
 * Idempotent: on transient failure, skip and try next tick. Never block
 * the cron loop on one slow/down node.
 */
export async function pollNodeStats(): Promise<{ ok: number; failed: number }> {
  const nodes = await prisma.node.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['disabled', 'unreachable'] },
    },
    // protocol is used below for the mtproto presence-only online fallback.
    // Single-secret protocols (mtproto via mtg) can't attribute traffic to a
    // specific userId, so the bytes-delta loop never touches user.onlineAt
    // for them and the UI shows OFFLINE forever. We patch around that by
    // treating "user is currently tracked by the adapter" as the online
    // signal — only for protocols where the design forces this.
    select: { id: true, address: true, consumptionMultiplier: true, protocol: true },
  });
  if (nodes.length === 0) return { ok: 0, failed: 0 };

  const now = new Date();
  // Floor to current hour bucket — UTC. node_usage_history has @@id([nodeId, hour]).
  const hourBucket = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
    ),
  );
  // Floor to current UTC day. node_user_usage_history has @@id([nodeId, date,
  // userId]); the dashboard "Top users today" groups that table by userId
  // WHERE date = today, so the bucket must match startOfToday()'s UTC-midnight
  // shape exactly. Until now nothing wrote this table, so the card was empty.
  const dateBucket = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  let ok = 0;
  let failed = 0;

  await Promise.all(
    nodes.map(async (node) => {
      try {
        const transport = new NodeTransport(node);
        const res = await transport.getStats();
        const rawTotal =
          (res.users ?? []).reduce(
            (acc, u) => acc + (u.bytesIn || 0) + (u.bytesOut || 0),
            0,
          );
        if (rawTotal > 0) {
          console.log(
            `[cron] node-stats-poll ${node.id} — ${res.users.length} entries, total=${rawTotal}B`,
          );
        }
        const multiplier = Number(node.consumptionMultiplier ?? 1) || 1;
        let nodeDownload = 0n;
        let nodeUpload = 0n;
        const userList = res.users ?? [];

        // Compute everything we need first, THEN run all writes in one
        // transaction. The agent's getStats() already drained the upstream
        // counters (xray's `statsquery -reset` is destructive), so any
        // partial-failure mid-loop on the panel side burns those deltas —
        // they're not recoverable on the next poll. Single $transaction
        // commits all-or-nothing: if any upsert fails, everything rolls
        // back and the agent will return cumulative+new on next tick
        // (only deltas since the last successful commit are at risk).
        type UserWrite = {
          userId: string;
          scaled: bigint;
          scaledIn: bigint;
          scaledOut: bigint;
        };
        const userWrites: UserWrite[] = [];
        // Presence-only userIds (mtproto-style adapters): we have zero bytes
        // for them but the adapter reported them in res.users, which is the
        // only signal we get that they exist on this node. Touch onlineAt
        // without incrementing traffic so the UI stops showing OFFLINE
        // forever for MTProto-only users. Documented limitation: per-user
        // quotas still don't apply to mtproto bytes since we can't measure
        // them — surface this to admins in the UI separately (see
        // UserFormModal MTProto-row tooltip).
        const presenceOnlyUserIds: string[] = [];
        const isPresenceOnlyProtocol = node.protocol === 'mtproto';
        // Apply the node's consumption multiplier consistently to billing
        // (usedTrafficBytes) and the per-user daily history below.
        const scale = (v: bigint) =>
          multiplier === 1 ? v : BigInt(Math.round(Number(v) * multiplier));
        for (const u of userList) {
          const inB = BigInt(u.bytesIn || 0);
          const outB = BigInt(u.bytesOut || 0);
          nodeUpload += inB;
          nodeDownload += outB;
          const userDelta = inB + outB;
          if (userDelta === 0n) {
            if (isPresenceOnlyProtocol) presenceOnlyUserIds.push(u.userId);
            continue;
          }
          userWrites.push({
            userId: u.userId,
            scaled: scale(userDelta),
            scaledIn: scale(inB),
            scaledOut: scale(outB),
          });
        }

        // Per-node hourly bucket — computed before the tx so we can include
        // the totalBytes fallback (mtproto-style single-counter protocols).
        if (nodeDownload === 0n && nodeUpload === 0n) {
          const cumIn = BigInt(res.totalBytesIn || 0);
          const cumOut = BigInt(res.totalBytesOut || 0);
          if (cumIn > 0n || cumOut > 0n) {
            const prev = totalSnapshot.get(node.id) ?? { in: 0n, out: 0n };
            const dIn = cumIn > prev.in ? cumIn - prev.in : 0n;
            const dOut = cumOut > prev.out ? cumOut - prev.out : 0n;
            totalSnapshot.set(node.id, { in: cumIn, out: cumOut });
            nodeUpload += dIn;
            nodeDownload += dOut;
          }
        }

        const writes: ReturnType<typeof prisma.userTraffic.upsert>[] = [];
        for (const w of userWrites) {
          writes.push(
            prisma.userTraffic.upsert({
              where: { userId: w.userId },
              create: {
                userId: w.userId,
                usedTrafficBytes: w.scaled,
                lifetimeTrafficBytes: w.scaled,
                onlineAt: now,
                firstConnectedAt: now,
                lastConnectedNodeId: node.id,
              },
              update: {
                usedTrafficBytes: { increment: w.scaled },
                lifetimeTrafficBytes: { increment: w.scaled },
                onlineAt: now,
                lastConnectedNodeId: node.id,
              },
            }),
          );
          // Per-user daily bucket — powers the dashboard "Top users today"
          // card. Direction split, scaled by the node multiplier to stay
          // consistent with usedTrafficBytes above. Zero-delta users were
          // already `continue`d, so every w here genuinely moved bytes.
          writes.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            prisma.nodeUserUsageHistory.upsert({
              where: {
                nodeId_date_userId: {
                  nodeId: node.id,
                  date: dateBucket,
                  userId: w.userId,
                },
              },
              create: {
                nodeId: node.id,
                date: dateBucket,
                userId: w.userId,
                bytesIn: w.scaledIn,
                bytesOut: w.scaledOut,
              },
              update: {
                bytesIn: { increment: w.scaledIn },
                bytesOut: { increment: w.scaledOut },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any,
          );
        }
        // Presence-only upserts (MTProto fallback): touch onlineAt + record
        // last node, but do not increment usedTrafficBytes — we cannot
        // measure those bytes. firstConnectedAt seeded from `now` on first
        // sighting so the user's "connected since" reflects reality.
        for (const uid of presenceOnlyUserIds) {
          writes.push(
            prisma.userTraffic.upsert({
              where: { userId: uid },
              create: {
                userId: uid,
                usedTrafficBytes: 0n,
                lifetimeTrafficBytes: 0n,
                onlineAt: now,
                firstConnectedAt: now,
                lastConnectedNodeId: node.id,
              },
              update: {
                onlineAt: now,
                lastConnectedNodeId: node.id,
              },
            }),
          );
        }
        if (nodeDownload > 0n || nodeUpload > 0n) {
          writes.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            prisma.nodeUsageHistory.upsert({
              where: { nodeId_hour: { nodeId: node.id, hour: hourBucket } },
              create: {
                nodeId: node.id,
                hour: hourBucket,
                downloadBytes: nodeDownload,
                uploadBytes: nodeUpload,
              },
              update: {
                downloadBytes: { increment: nodeDownload },
                uploadBytes: { increment: nodeUpload },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any,
          );
        }
        if (writes.length > 0) {
          await prisma.$transaction(writes);
        }
        ok++;
      } catch (err) {
        failed++;
        const detail =
          err instanceof NodeRequestError
            ? `${err.status} ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        console.log(`[cron] node-stats-poll ${node.id} FAILED: ${detail}`);
      }
    }),
  );

  return { ok, failed };
}
