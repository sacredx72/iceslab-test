import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { prisma } from '../../prisma.js';
import { closeRedis } from '../../lib/redis.js';
import { cleanDatabase } from '../../../tests/helpers/db.js';
import { registerAndLogin } from '../../../tests/helpers/auth.js';
import { decodeNodePayload } from '../keygen/keygen.service.js';

let app: FastifyInstance;
let token: string;

beforeEach(async () => {
  app = await buildApp();
  await cleanDatabase();
  token = await registerAndLogin(app);
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeRedis();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('POST /api/nodes', () => {
  it('creates a node and returns a one-time mTLS payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: {
        name: 'eu-1',
        address: '10.0.0.1:8443',
        countryCode: 'DE',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('eu-1');
    expect(body.address).toBe('10.0.0.1:8443');
    expect(body.countryCode).toBe('DE');
    expect(body.status).toBe('unknown');
    expect(body.consumptionMultiplier).toBe('1');
    expect(typeof body.payload).toBe('string');

    const decoded = decodeNodePayload(body.payload);
    expect(decoded.nodeCertPem).toContain('-----BEGIN CERTIFICATE-----');
    expect(decoded.nodeKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(decoded.caCertPem).toContain('-----BEGIN CERTIFICATE-----');
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { name: 'eu-1', address: '10.0.0.1:8443' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 409 on duplicate name', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: '10.0.0.1:8443' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: '10.0.0.2:8443' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 409 on duplicate address', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: '10.0.0.1:8443' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-2', address: '10.0.0.1:8443' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for invalid address (with scheme)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: 'https://10.0.0.1:8443' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/nodes', () => {
  it('returns a paginated list', async () => {
    for (const [name, addr] of [
      ['eu-1', '10.0.0.1:8443'],
      ['eu-2', '10.0.0.2:8443'],
      ['eu-3', '10.0.0.3:8443'],
    ]) {
      await app.inject({
        method: 'POST',
        url: '/api/nodes',
        headers: auth(),
        payload: { name, address: addr },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/nodes?page=1&limit=10',
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(3);
    expect(body.nodes).toHaveLength(3);
    // Public DTOs must not include the secret payload
    for (const n of body.nodes) {
      expect(n).not.toHaveProperty('payload');
    }
  });
});

describe('GET /api/nodes/:id', () => {
  it('returns the node by id', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: '10.0.0.1:8443' },
    });
    const { id } = JSON.parse(created.body);

    const res = await app.inject({
      method: 'GET',
      url: `/api/nodes/${id}`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('eu-1');
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/nodes/00000000-0000-0000-0000-000000000000',
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/nodes/:id', () => {
  it('updates address and country', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'eu-1', address: '10.0.0.1:8443' },
    });
    const { id } = JSON.parse(created.body);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/nodes/${id}`,
      headers: auth(),
      payload: { address: '10.0.0.99:8443', countryCode: 'NL' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.address).toBe('10.0.0.99:8443');
    expect(body.countryCode).toBe('NL');
  });
});

describe('DELETE /api/nodes/:id', () => {
  it('soft-deletes the node', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      headers: auth(),
      payload: { name: 'gone', address: '10.0.0.1:8443' },
    });
    const { id } = JSON.parse(created.body);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/nodes/${id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET',
      url: `/api/nodes/${id}`,
      headers: auth(),
    });
    expect(get.statusCode).toBe(404);
  });
});
