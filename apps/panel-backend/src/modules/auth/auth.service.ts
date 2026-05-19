import type { AdminUser } from '../../generated/prisma/client.js';
import {
  findAdminByUsername,
  verifyPassword,
} from '../admin/admin.service.js';
import type { LoginInput } from './auth.schemas.js';
import { redis } from '../../lib/redis.js';
import { config } from '../../config.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Account temporarily locked. Retry in ~${retryAfterSeconds}s`);
    this.name = 'AccountLockedError';
  }
}

// Slice S7 — username-scoped lockout. Per-IP rate-limit (Fastify) cuts off
// a single attacker; this layer cuts off distributed brute-force across a
// botnet. Keyed on username (case-insensitive) so the lockout follows the
// account, not the source IP.
const FAIL_KEY = (username: string): string => `auth:fail:${username.toLowerCase()}`;

async function checkLocked(username: string): Promise<void> {
  const key = FAIL_KEY(username);
  const current = await redis.get(key);
  if (current === null) return;
  const count = Number.parseInt(current, 10);
  if (Number.isFinite(count) && count >= config.LOGIN_LOCKOUT_FAILURES) {
    const ttl = await redis.ttl(key);
    throw new AccountLockedError(ttl > 0 ? ttl : 60);
  }
}

async function recordFailure(username: string): Promise<void> {
  const key = FAIL_KEY(username);
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    // First failure inside the window — set short TTL so honest typos
    // don't accumulate forever.
    await redis.expire(key, config.LOGIN_LOCKOUT_WINDOW_MIN * 60);
  }
  if (newCount >= config.LOGIN_LOCKOUT_FAILURES) {
    // Threshold tripped — switch to the long lockout TTL.
    await redis.expire(key, config.LOGIN_LOCKOUT_DURATION_MIN * 60);
  }
}

async function clearFailures(username: string): Promise<void> {
  await redis.del(FAIL_KEY(username));
}

/**
 * Verify credentials and return the admin record.
 * The route will sign the JWT — service stays HTTP-agnostic.
 */
export async function login(input: LoginInput): Promise<AdminUser> {
  // Check lockout BEFORE looking up the admin so we don't even leak which
  // usernames exist via timing differences during a lockout.
  await checkLocked(input.username);

  const admin = await findAdminByUsername(input.username);
  if (!admin) {
    await recordFailure(input.username);
    throw new InvalidCredentialsError();
  }

  const ok = await verifyPassword(input.password, admin.passwordHash);
  if (!ok) {
    await recordFailure(input.username);
    throw new InvalidCredentialsError();
  }

  await clearFailures(input.username);
  return admin;
}