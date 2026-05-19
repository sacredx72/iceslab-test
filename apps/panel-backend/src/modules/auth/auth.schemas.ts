import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// Register uses the same shape as CreateAdmin
export { CreateAdminSchema as RegisterSchema } from '../admin/admin.schemas.js';
export type { CreateAdminInput as RegisterInput } from '../admin/admin.schemas.js';