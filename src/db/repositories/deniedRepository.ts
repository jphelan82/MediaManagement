import { getDb } from '../connection';

export interface DeniedMovie {
  id: number;
  radarr_movie_id: number;
  tmdb_id: number;
  target_tier: number;
  denied_at: string;
}

export class DeniedRepository {
  isDenied(radarrMovieId: number, targetTier: number): boolean {
    const row = getDb().prepare(
      `SELECT 1 FROM denied_movies WHERE radarr_movie_id = ? AND target_tier = ?`
    ).get(radarrMovieId, targetTier);
    return !!row;
  }

  insert(radarrMovieId: number, tmdbId: number, targetTier: number): void {
    getDb().prepare(`
      INSERT OR IGNORE INTO denied_movies (radarr_movie_id, tmdb_id, target_tier)
      VALUES (?, ?, ?)
    `).run(radarrMovieId, tmdbId, targetTier);
  }

  remove(id: number): void {
    getDb().prepare('DELETE FROM denied_movies WHERE id = ?').run(id);
  }

  removeByMovie(radarrMovieId: number, targetTier: number): void {
    getDb().prepare(
      'DELETE FROM denied_movies WHERE radarr_movie_id = ? AND target_tier = ?'
    ).run(radarrMovieId, targetTier);
  }

  getAll(): DeniedMovie[] {
    return getDb().prepare(
      `SELECT * FROM denied_movies ORDER BY denied_at DESC`
    ).all() as DeniedMovie[];
  }
}
