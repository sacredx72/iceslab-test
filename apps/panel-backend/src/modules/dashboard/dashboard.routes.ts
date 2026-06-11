import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/auth.hook.js';
import * as dashboardService from './dashboard.service.js';
import { getInsights } from './insights.service.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/dashboard/overview',
    { onRequest: [requireAuth] },
    async (_request, reply) => {
      const overview = await dashboardService.getOverview();
      return reply.send(overview);
    },
  );

  // K1-b/c Insights — on-demand (not polled). `days` selects the SRH window;
  // the HWID stats are point-in-time and ignore it.
  app.get<{ Querystring: { days?: string } }>(
    '/api/dashboard/insights',
    { onRequest: [requireAuth] },
    async (request, reply) => {
      const days = request.query.days ? Number(request.query.days) : undefined;
      const insights = await getInsights(days);
      return reply.send(insights);
    },
  );
}
