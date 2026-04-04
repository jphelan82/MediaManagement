import { ScannerService } from '../scanner/scannerService';
import { QueueRepository } from '../db/repositories/queueRepository';
import { DeniedRepository } from '../db/repositories/deniedRepository';
import { LogRepository } from '../db/repositories/logRepository';
import { RadarrClient } from '../radarr/radarrClient';

declare module 'fastify' {
  interface FastifyInstance {
    scanner: ScannerService;
    queueRepo: QueueRepository;
    deniedRepo: DeniedRepository;
    logRepo: LogRepository;
    radarr: RadarrClient;
  }
}
