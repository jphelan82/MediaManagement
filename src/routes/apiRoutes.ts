import { FastifyInstance, FastifyRequest } from 'fastify';
import { getLibraryByTier } from '../config';
import { executeApproval } from '../scanner/actions';
import logger from '../logger';

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  // Queue endpoints
  app.get('/queue', async () => {
    return app.queueRepo.getPending();
  });

  app.get('/queue/denied', async () => {
    return app.queueRepo.getDenied();
  });

  app.post('/queue/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(request.params.id, 10);
    const item = app.queueRepo.approve(id);
    if (!item) {
      return reply.status(404).send({ error: 'Queue item not found or not pending' });
    }

    // Execute the upgrade in Radarr
    try {
      const movie = await app.radarr.getMovie(item.radarr_movie_id);
      const targetLib = getLibraryByTier(item.target_tier);
      if (targetLib) {
        await executeApproval(app.radarr, movie, targetLib, app.logRepo);
      }
    } catch (err) {
      logger.error(`Failed to execute upgrade for "${item.title}"`, { error: err });
      // The approval is recorded even if execution fails — can retry
    }

    return item;
  });

  app.post('/queue/:id/deny', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(request.params.id, 10);
    const item = app.queueRepo.deny(id);
    if (!item) {
      return reply.status(404).send({ error: 'Queue item not found or not pending' });
    }

    // Record denial so scanner won't re-add
    app.deniedRepo.insert(item.radarr_movie_id, item.tmdb_id, item.target_tier);

    app.logRepo.insert({
      radarrMovieId: item.radarr_movie_id,
      title: item.title,
      actionType: 'upgrade_denied',
      details: { targetTier: item.target_tier },
    });

    return item;
  });

  app.post('/queue/denied/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = parseInt(request.params.id, 10);

    // The id here is the upgrade_queue row id (status=denied)
    const item = app.queueRepo.getById(id);
    if (!item || item.status !== 'denied') {
      return reply.status(404).send({ error: 'Denied item not found' });
    }

    // Remove from denied list
    app.deniedRepo.removeByMovie(item.radarr_movie_id, item.target_tier);

    // Update queue item status to approved
    const db = (await import('../db/connection')).getDb();
    db.prepare(`UPDATE upgrade_queue SET status = 'approved', updated_at = datetime('now') WHERE id = ?`).run(id);

    // Execute the upgrade
    try {
      const movie = await app.radarr.getMovie(item.radarr_movie_id);
      const targetLib = getLibraryByTier(item.target_tier);
      if (targetLib) {
        await executeApproval(app.radarr, movie, targetLib, app.logRepo);
      }
    } catch (err) {
      logger.error(`Failed to execute re-approved upgrade for "${item.title}"`, { error: err });
    }

    return { ...item, status: 'approved' };
  });

  // Scan endpoints
  app.post('/scan', async (request, reply) => {
    if (app.scanner.isRunning()) {
      return reply.status(409).send({ error: 'Scan already in progress', progress: app.scanner.getProgress() });
    }

    // Run async — don't wait for completion
    app.scanner.runFullScan().catch(err => {
      logger.error('Scan failed', { error: err });
    });

    return { message: 'Scan started', progress: app.scanner.getProgress() };
  });

  app.get('/scan/status', async () => {
    return app.scanner.getProgress();
  });

  // History
  app.get('/history', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
    const limit = parseInt(request.query.limit ?? '50', 10);
    const offset = parseInt(request.query.offset ?? '0', 10);
    const entries = app.logRepo.getRecent(limit, offset);
    const total = app.logRepo.countAll();
    return { entries, total, limit, offset };
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
