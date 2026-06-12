import { z } from 'zod';

// The full 7-core protocol set. Stored as free strings on the hop; the
// node-agent realises each entry/link cell native-first (xray entry ->
// vless/ss2022/wg links), bridges later. See docs/ROADMAP.md "C. Каскады".
export const CascadeProtocol = z.enum([
  'xray',
  'hysteria',
  'amneziawg',
  'naive',
  'shadowsocks',
  'mtproto',
  'mieru',
]);

export const CascadeHopSchema = z.object({
  nodeId: z.uuid(),
  /** 0 = entry, highest = exit. Must be contiguous 0..N-1 across the cascade. */
  position: z.number().int().min(0).max(7),
  /** Client-facing protocol; only valid on the entry hop. */
  entryProtocol: CascadeProtocol.optional(),
  /** Protocol to the NEXT hop; omitted on the exit hop. */
  linkProtocol: CascadeProtocol.optional(),
});

export const CreateCascadeSchema = z.object({
  name: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  hops: z.array(CascadeHopSchema).min(2).max(8),
});

export const UpdateCascadeSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  hops: z.array(CascadeHopSchema).min(2).max(8).optional(),
});

export const CascadeIdParamSchema = z.object({ id: z.uuid() });

export type CascadeHopInput = z.infer<typeof CascadeHopSchema>;
export type CreateCascadeInput = z.infer<typeof CreateCascadeSchema>;
export type UpdateCascadeInput = z.infer<typeof UpdateCascadeSchema>;
