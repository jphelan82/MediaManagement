import { RadarrClient } from '../radarr/radarrClient';
import { RadarrMovie } from '../radarr/radarrTypes';
import { LibraryConfig } from '../config';
import { QueueRepository } from '../db/repositories/queueRepository';
import { DeniedRepository } from '../db/repositories/deniedRepository';
import { LogRepository } from '../db/repositories/logRepository';
import logger from '../logger';

// Extract folder name from a path that may use Windows or POSIX separators
function getMovieFolderName(moviePath: string): string {
  return moviePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

// Build new path preserving the separator style of the root folder
function buildMoviePath(rootFolder: string, folderName: string): string {
  const sep = rootFolder.includes('\\') ? '\\' : '/';
  const root = rootFolder.replace(/[\\/]+$/, '');
  return `${root}${sep}${folderName}`;
}

export async function executeDowngrade(
  radarr: RadarrClient,
  movie: RadarrMovie,
  targetLib: LibraryConfig,
  logRepo: LogRepository,
  actionType: string = 'downgrade',
): Promise<void> {
  const movieFolderName = getMovieFolderName(movie.path);
  const newPath = buildMoviePath(targetLib.rootFolder, movieFolderName);

  logger.info(`Downgrading "${movie.title}" to ${targetLib.name}`, {
    movieId: movie.id,
    from: movie.rootFolderPath,
    to: targetLib.rootFolder,
  });

  const updatedMovie: RadarrMovie = {
    ...movie,
    qualityProfileId: targetLib.qualityProfileId,
    rootFolderPath: targetLib.rootFolder,
    path: newPath,
  };

  await radarr.updateMovie(updatedMovie, true);
  await radarr.searchMovie([movie.id]);

  logRepo.insert({
    radarrMovieId: movie.id,
    title: movie.title,
    actionType,
    details: {
      fromTier: movie.qualityProfileId,
      toTier: targetLib.tier,
      toLibrary: targetLib.name,
    },
  });
}

export async function queueUpgrade(
  movie: RadarrMovie,
  currentLib: LibraryConfig,
  targetLib: LibraryConfig,
  queueRepo: QueueRepository,
  deniedRepo: DeniedRepository,
  logRepo: LogRepository,
): Promise<boolean> {
  // Skip if already denied
  if (deniedRepo.isDenied(movie.id, targetLib.tier)) {
    logger.debug(`Skipping upgrade for "${movie.title}" — previously denied for tier ${targetLib.tier}`);
    return false;
  }

  // Skip if already pending
  if (queueRepo.existsPending(movie.id, targetLib.tier)) {
    logger.debug(`Skipping upgrade for "${movie.title}" — already pending for tier ${targetLib.tier}`);
    return false;
  }

  logger.info(`Queueing upgrade for "${movie.title}": ${currentLib.name} → ${targetLib.name}`);

  queueRepo.insert({
    radarrMovieId: movie.id,
    title: movie.title,
    year: movie.year,
    tmdbId: movie.tmdbId,
    currentTier: currentLib.tier,
    targetTier: targetLib.tier,
  });

  logRepo.insert({
    radarrMovieId: movie.id,
    title: movie.title,
    actionType: 'upgrade_queued',
    details: {
      fromLibrary: currentLib.name,
      toLibrary: targetLib.name,
    },
  });

  return true;
}

export async function executeApproval(
  radarr: RadarrClient,
  movie: RadarrMovie,
  targetLib: LibraryConfig,
  logRepo: LogRepository,
): Promise<void> {
  const movieFolderName = getMovieFolderName(movie.path);
  const newPath = buildMoviePath(targetLib.rootFolder, movieFolderName);

  logger.info(`Executing approved upgrade for "${movie.title}" to ${targetLib.name}`);

  const updatedMovie: RadarrMovie = {
    ...movie,
    qualityProfileId: targetLib.qualityProfileId,
    rootFolderPath: targetLib.rootFolder,
    path: newPath,
  };

  await radarr.updateMovie(updatedMovie, true);
  await radarr.searchMovie([movie.id]);

  logRepo.insert({
    radarrMovieId: movie.id,
    title: movie.title,
    actionType: 'upgrade_executed',
    details: {
      toTier: targetLib.tier,
      toLibrary: targetLib.name,
    },
  });
}
