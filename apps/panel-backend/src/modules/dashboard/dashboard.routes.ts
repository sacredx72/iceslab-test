import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/auth.hook.js';
import * as dashboardService from './dashboard.service.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/dashboard/overview',
    { onRequest: [requireAuth] },
    async (_request, reply) => {
      const overview = await dashboardService.getOverview();
      return reply.send(overview);
    },
  );
}
