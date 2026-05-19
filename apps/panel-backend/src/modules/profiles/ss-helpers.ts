import { randomBytes } from 'node:crypto';

/**
 * Auto-generate a server PSK of the right length for the given SS2022
 * cipher. Mirrors the helper that used to live in inbounds.service.ts.
 *
 * - aes-128-gcm  → 16 bytes
 * - aes-256-gcm / chacha20-poly1305 / legacy AEAD → 32 bytes
 */
export function generateSsServerPsk(method: string): string {
  const len = method === '2022-blake3-aes-128-gcm' ? 16 : 32;
  return randomBytes(len).toString('base64');
}
