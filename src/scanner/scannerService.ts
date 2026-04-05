import { RadarrClient } from '../radarr/radarrClient';
import { RadarrMovie } from '../radarr/radarrTypes';
import { RateLimiter, RateLimitExceededError } from '../radarr/rateLimiter';
import { classifyReleases, fileMatchesTier } from './classifier';
import { executeDowngrade, queueUpgrade } from './actions';
import { QueueRepository } from '../db/repositories/queueRepository';
import { DeniedRepository } from '../db/repositories/deniedRepository';
import { LogRepository } from '../db/repositories/logRepository';
import { PushoverClient } from '../notifications/pushoverClient';
import { appConfig, getLibraryByRootFolder, getLibraryByTier, getLibraryByQualityProfile } from '../config';
import { ScanProgress } from '../types';
import logger from '../logger';

export class ScannerService {
  private progress: ScanProgress = this.freshProgress();

  constructor(
    private radarr: RadarrClient,
    private rateLimiter: RateLimiter,
    private queueRepo: QueueRepository,
    private deniedRepo: DeniedRepository,
    private logRepo: LogRepository,
    private pushover: PushoverClient,
  ) {}

  isRunning(): boolean {
    return this.progress.running;
  }

  getProgress(): ScanProgress {
    return { ...this.progress };
  }

  async runFullScan(): Promise<ScanProgress> {
    if (this.progress.running) {
      throw new Error('Scan already in progress');
    }

    this.progress = this.freshProgress();
    this.progress.running = true;
    this.progress.startedAt = new Date();

    try {
      const movies = await this.radarr.getMovies();
      this.progress.total = movies.length;
      logger.info(`Starting full scan of ${movies.length} movies`);

      for (const movie of movies) {
        try {
          await this.evaluateMovie(movie);
        } catch (err) {
          if (err instanceof RateLimitExceededError) {
            logger.warn(`Rate limit exceeded, stopping scan early at ${this.progress.processed}/${this.progress.total}`);
            break;
          }
          this.progress.errors++;
          logger.error(`Error evaluating "${movie.title}"`, { error: err, movieId: movie.id });
        }
        this.progress.processed++;
      }

      // Send notification if upgrades were queued
      if (this.progress.upgradesQueued > 0) {
        const baseUrl = appConfig.server.baseUrl;
        await this.pushover.send(
          'Media Management: Upgrades Available',
          `${this.progress.upgradesQueued} new upgrade candidate(s) found. Review and approve them.`,
          `${baseUrl}/queue`,
        );
      }

      logger.info('Scan complete', {
        total: this.progress.total,
        processed: this.progress.processed,
        skipped: this.progress.skipped,
        downgrades: this.progress.downgrades,
        upgradesQueued: this.progress.upgradesQueued,
        errors: this.progress.errors,
      });
    } finally {
      this.progress.running = false;
    }

    return this.getProgress();
  }

  async evaluateSingleMovie(movieId: number): Promise<void> {
    const movie = await this.radarr.getMovie(movieId);
    await this.evaluateMovie(movie);
  }

  private async evaluateMovie(movie: RadarrMovie): Promise<void> {
    // Determine current tier from root folder or quality profile
    const currentLib =
      getLibraryByRootFolder(movie.rootFolderPath ?? movie.path) ??
      getLibraryByQualityProfile(movie.qualityProfileId);

    if (!currentLib) {
      logger.debug(`Skipping "${movie.title}" — not in a managed library`);
      this.progress.skipped++;
      return;
    }

    // Skip unreleased movies — no point searching indexers if media isn't available yet.
    // Use physical release + 24h buffer (for remuxes/blu-rays), fall back to digital release.
    if (!this.isReleased(movie)) {
      logger.debug(`Skipping "${movie.title}" — not yet released`);
      this.progress.skipped++;
      return;
    }

    // Skip gate: only skip if file matches tier AND movie is already in the highest tier.
    // Lower tiers always need checking — a better quality may have become available.
    if (movie.hasFile && movie.movieFile && currentLib.tier === 1) {
      const qualityName = movie.movieFile.quality?.quality?.name ?? '';
      if (fileMatchesTier(qualityName, currentLib.tier)) {
        this.progress.skipped++;
        return;
      }
    }

    // Rate-limited release search
    const releases = await this.rateLimiter.withLimit(
      () => this.radarr.getReleases(movie.id),
    );

    // Classify best available tier
    const bestTier = classifyReleases(releases);
    if (bestTier === null) {
      // No usable releases found — if movie has no file, could try downgrading
      if (!movie.hasFile && currentLib.tier < 3) {
        // Movie has no file and is in a high tier — try next lower tier
        const lowerLib = getLibraryByTier(currentLib.tier + 1 as 1 | 2 | 3);
        if (lowerLib) {
          await executeDowngrade(this.radarr, movie, lowerLib, this.logRepo);
          this.progress.downgrades++;
        }
      }
      return;
    }

    // Compare current tier with best available
    if (bestTier > currentLib.tier) {
      // Current library is HIGHER quality than what's available → downgrade
      const targetLib = getLibraryByTier(bestTier);
      if (targetLib) {
        await executeDowngrade(this.radarr, movie, targetLib, this.logRepo);
        this.progress.downgrades++;
      }
    } else if (bestTier < currentLib.tier) {
      // Better quality is available
      const targetLib = getLibraryByTier(bestTier);
      if (targetLib) {
        // Auto-upgrade if no file exists yet (nothing downloaded, no waste)
        if (!movie.hasFile) {
          logger.info(`Auto-upgrading "${movie.title}" (no file yet): ${currentLib.name} → ${targetLib.name}`);
          await executeDowngrade(this.radarr, movie, targetLib, this.logRepo, 'auto_upgrade');
          this.progress.downgrades++;
          return;
        }

        // File exists — queue for manual approval
        const queued = await queueUpgrade(
          movie, currentLib, targetLib,
          this.queueRepo, this.deniedRepo, this.logRepo,
        );
        if (queued) this.progress.upgradesQueued++;
      }
    }
    // else: bestTier === currentLib.tier → no action needed
  }

  private isReleased(movie: RadarrMovie): boolean {
    const now = Date.now();
    const BUFFER_MS = 24 * 60 * 60 * 1000; // 24 hours

    // Check physical release first (most relevant for quality media)
    // Then digital release, then theatrical
    const releaseDate = movie.physicalRelease ?? movie.digitalRelease ?? movie.inCinemas;

    if (!releaseDate) {
      // No release date info — fall back to movie year.
      // If the movie is from more than a year ago, it's certainly released.
      if (movie.hasFile) return true;
      const currentYear = new Date().getFullYear();
      return movie.year < currentYear;
    }

    const releaseTime = new Date(releaseDate).getTime();
    return now > releaseTime + BUFFER_MS;
  }

  private freshProgress(): ScanProgress {
    return {
      running: false,
      total: 0,
      processed: 0,
      skipped: 0,
      downgrades: 0,
      upgradesQueued: 0,
      errors: 0,
      startedAt: null,
    };
  }
}
