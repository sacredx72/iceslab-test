import { z } from 'zod';

const UsernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

export const CreateAdminSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});
export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;
