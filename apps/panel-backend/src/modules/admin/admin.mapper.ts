import type { AdminUser } from '../../generated/prisma/client.js';

export interface PublicAdminDto {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function mapAdminToPublic(admin: AdminUser): PublicAdminDto {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  };
}
