import { z } from 'zod';
import { PermissiveUuid } from '../../lib/uuid-schema.js';

const NameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(64, 'Name too long')
  .regex(/^[A-Za-z0-9 _-]+$/, 'Letters, digits, space, underscore, hyphen');

export const CreateSquadSchema = z.object({
  name: NameSchema,
  description: z.string().max(1000).nullish(),
  /** Slice 27 — squad ACL is now profile-level. Initial profile assignment;
   *  admin can attach later via PUT. */
  profileIds: z.array(z.uuid()).default([]),
});
export type CreateSquadInput = z.infer<typeof CreateSquadSchema>;

export const UpdateSquadSchema = z.object({
  name: NameSchema.optional(),
  description: z.string().max(1000).nullish(),
  /** When provided, replaces the full profile set (set semantics). */
  profileIds: z.array(z.uuid()).optional(),
});
export type UpdateSquadInput = z.infer<typeof UpdateSquadSchema>;

// PermissiveUuid: SquadIdParamSchema accepts the seeded "All" squad
// (00000000-0000-0000-0000-000000000001, non-v4 version digit) when admin
// hits PUT/DELETE /api/squads/:id. The service layer rejects All with a
// friendly SquadProtectedError; without the permissive shape the request
// would die at Zod with a confusing 400.
export const SquadIdParamSchema = z.object({ id: PermissiveUuid });
