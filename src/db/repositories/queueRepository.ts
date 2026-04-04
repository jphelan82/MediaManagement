import { getDb } from '../connection';

export interface QueueItem {
  id: number;
  radarr_movie_id: number;
  title: string;
  year: number;
  tmdb_id: number;
  current_tier: number;
  target_tier: number;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  updated_at: string;
}

export class QueueRepository {
  getPending(): QueueItem[] {
    return getDb().prepare(
      `SELECT * FROM upgrade_queue WHERE status = 'pending' ORDER BY created_at DESC`
    ).all() as QueueItem[];
  }

  getById(id: number): QueueItem | undefined {
    return getDb().prepare(
      `SELECT * FROM upgrade_queue WHERE id = ?`
    ).get(id) as QueueItem | undefined;
  }

  existsPending(radarrMovieId: number, targetTier: number): boolean {
    const row = getDb().prepare(
      `SELECT 1 FROM upgrade_queue WHERE radarr_movie_id = ? AND target_tier = ? AND status = 'pending'`
    ).get(radarrMovieId, targetTier);
    return !!row;
  }

  insert(item: { radarrMovieId: number; title: string; year: number; tmdbId: number; currentTier: number; targetTier: number }): void {
    getDb().prepare(`
      INSERT OR IGNORE INTO upgrade_queue
        (radarr_movie_id, title, year, tmdb_id, current_tier, target_tier, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(item.radarrMovieId, item.title, item.year, item.tmdbId, item.currentTier, item.targetTier);
  }

  approve(id: number): QueueItem | undefined {
    getDb().prepare(`
      UPDATE upgrade_queue SET status = 'approved', updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(id);
    return this.getById(id);
  }

  deny(id: number): QueueItem | undefined {
    getDb().prepare(`
      UPDATE upgrade_queue SET status = 'denied', updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(id);
    return this.getById(id);
  }

  getDenied(): QueueItem[] {
    return getDb().prepare(
      `SELECT * FROM upgrade_queue WHERE status = 'denied' ORDER BY updated_at DESC`
    ).all() as QueueItem[];
  }

  pendingCount(): number {
    const row = getDb().prepare(
      `SELECT COUNT(*) as count FROM upgrade_queue WHERE status = 'pending'`
    ).get() as { count: number };
    return row.count;
  }
}
