import path from 'path';
import Fastify from 'fastify';
import view from '@fastify/view';
import formbody from '@fastify/formbody';
import nunjucks from 'nunjucks';
import cron from 'node-cron';
import { appConfig } from './config';
import { getDb, closeDb } from './db/connection';
import { runMigrations } from './db/migrations';
import { RadarrClient } from './radarr/radarrClient';
import { RateLimiter } from './radarr/rateLimiter';
import { ScannerService } from './scanner/scannerService';
import { QueueRepository } from './db/repositories/queueRepository';
import { DeniedRepository } from './db/repositories/deniedRepository';
import { LogRepository } from './db/repositories/logRepository';
import { PushoverClient } from './notifications/pushoverClient';
import { apiRoutes } from './routes/apiRoutes';
import { webhookRoutes } from './routes/webhookRoutes';
import { uiRoutes } from './routes/uiRoutes';
import logger from './logger';

async function main(): Promise<void> {
  // 1. Database
  const db = getDb();
  runMigrations(db);
  logger.info('Database initialized');

  // 2. Repositories
  const queueRepo = new QueueRepository();
  const deniedRepo = new DeniedRepository();
  const logRepo = new LogRepository();

  // 3. Radarr client + rate limiter
  const radarr = new RadarrClient(appConfig.radarr.url, appConfig.radarr.apiKey);
  const rateLimiter = new RateLimiter(
    appConfig.scanner.rateLimit.maxConcurrent,
    appConfig.scanner.rateLimit.delayBetweenMs,
    appConfig.scanner.rateLimit.maxPerHour,
  );

  // 4. Notifications
  const pushover = new PushoverClient();

  // 5. Scanner
  const scanner = new ScannerService(radarr, rateLimiter, queueRepo, deniedRepo, logRepo, pushover);

  // 6. Fastify
  const app = Fastify({ logger: false });
  await app.register(formbody);

  const templateRoot = path.resolve(__dirname, 'templates');
  const njkEnv = nunjucks.configure(templateRoot, { autoescape: true });

  await app.register(view, {
    engine: { nunjucks: njkEnv },
    templates: templateRoot,
  });

  // 7. Decorate with services
  app.decorate('scanner', scanner);
  app.decorate('queueRepo', queueRepo);
  app.decorate('deniedRepo', deniedRepo);
  app.decorate('logRepo', logRepo);
  app.decorate('radarr', radarr);

  // 8. Inject pendingCount into all views
  app.addHook('preHandler', async (request, reply) => {
    const accept = request.headers.accept ?? '';
    if (accept.includes('text/html')) {
      (reply as any).locals = {
        ...(reply as any).locals,
        pendingCount: queueRepo.pendingCount(),
      };
    }
  });

  // 9. Register routes
  await app.register(apiRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(uiRoutes);

  // 10. Scheduler
  if (cron.validate(appConfig.scanner.scheduleCron)) {
    cron.schedule(appConfig.scanner.scheduleCron, async () => {
      logger.info('Scheduled scan starting');
      try {
        const result = await scanner.runFullScan();
        logger.info('Scheduled scan complete', result);
      } catch (err) {
        logger.error('Scheduled scan failed', { error: err });
      }
    });
    logger.info(`Scanner scheduled: ${appConfig.scanner.scheduleCron}`);
  }

  // 11. Start
  await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
  logger.info(`MediaManagement running on http://${appConfig.server.host}:${appConfig.server.port}`);

  // 12. Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err });
  process.exit(1);
});
