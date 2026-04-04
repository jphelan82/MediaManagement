import { FastifyInstance, FastifyRequest } from 'fastify';
import { appConfig, getLibraryByTier } from '../config';

function tierName(tier: number): string {
  return getLibraryByTier(tier)?.name ?? `Tier ${tier}`;
}

export async function uiRoutes(app: FastifyInstance): Promise<void> {
  // Dashboard
  app.get('/', async (request, reply) => {
    const pendingCount = app.queueRepo.pendingCount();
    const denied = app.queueRepo.getDenied();
    const recentActions = app.logRepo.getRecent(10);
    const scanProgress = app.scanner.getProgress();

    return reply.view('dashboard.njk', {
      pendingCount,
      deniedCount: denied.length,
      recentActions,
      scanProgress,
      tierName,
      libraries: appConfig.libraries,
    });
  });

  // Approval queue page
  app.get('/queue', async (request, reply) => {
    const items = app.queueRepo.getPending();
    return reply.view('queue.njk', { items, tierName });
  });

  // Denied movies page
  app.get('/denied', async (request, reply) => {
    const items = app.queueRepo.getDenied();
    return reply.view('denied.njk', { items, tierName });
  });

  // History page
  app.get('/history', async (request: FastifyRequest<{ Querystring: { page?: string } }>, reply) => {
    const page = parseInt(request.query.page ?? '1', 10);
    const limit = 25;
    const offset = (page - 1) * limit;
    const entries = app.logRepo.getRecent(limit, offset);
    const total = app.logRepo.countAll();
    const totalPages = Math.ceil(total / limit);

    return reply.view('history.njk', {
      entries,
      page,
      totalPages,
      tierName,
    });
  });
}
