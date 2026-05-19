import type { FastifyInstance } from 'fastify';

export interface AdminCreds {
  username: string;
  password: string;
}

export const DEFAULT_ADMIN: AdminCreds = {
  username: 'admin',
  password: 'password123',
};

export async function registerAdmin(
  app: FastifyInstance,
  creds: AdminCreds = DEFAULT_ADMIN,
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: creds,
  });
  if (res.statusCode !== 201) {
    throw new Error(`registerAdmin failed: ${res.statusCode} ${res.body}`);
  }
}

export async function loginAdmin(
  app: FastifyInstance,
  creds: AdminCreds = DEFAULT_ADMIN,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: creds,
  });
  if (res.statusCode !== 200) {
    throw new Error(`loginAdmin failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body).token;
}

export async function registerAndLogin(
  app: FastifyInstance,
  creds: AdminCreds = DEFAULT_ADMIN,
): Promise<string> {
  await registerAdmin(app, creds);
  return loginAdmin(app, creds);
}
