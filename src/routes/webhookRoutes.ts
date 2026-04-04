import { FastifyInstance, FastifyRequest } from 'fastify';
import logger from '../logger';

interface RadarrWebhookPayload {
  eventType: string;
  movie?: {
    id: number;
    title: string;
    tmdbId: number;
  };
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/radarr', async (request: FastifyRequest<{ Body: RadarrWebhookPayload }>, reply) => {
    const payload = request.body;

    logger.info(`Received Radarr webhook: ${payload.eventType}`, {
      movieId: payload.movie?.id,
      title: payload.movie?.title,
    });

    if (payload.eventType === 'MovieAdded' && payload.movie?.id) {
      // Evaluate the newly added movie asynchronously
      app.scanner.evaluateSingleMovie(payload.movie.id).catch(err => {
        logger.error(`Failed to evaluate newly added movie "${payload.movie?.title}"`, { error: err });
      });
    }

    return { received: true };
  });
}
