import { getDb } from '../connection';

export interface ActionLogEntry {
  id: number;
  radarr_movie_id: number;
  title: string;
  action_type: string;
  details: string | null;
  created_at: string;
}

export class LogRepository {
  insert(entry: { radarrMovieId: number; title: string; actionType: string; details?: Record<string, unknown> }): void {
    getDb().prepare(`
      INSERT INTO action_log (radarr_movie_id, title, action_type, details)
      VALUES (?, ?, ?, ?)
    `).run(entry.radarrMovieId, entry.title, entry.actionType, entry.details ? JSON.stringify(entry.details) : null);
  }

  getRecent(limit: number = 50, offset: number = 0): ActionLogEntry[] {
    return getDb().prepare(
      `SELECT * FROM action_log ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as ActionLogEntry[];
  }

  countAll(): number {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM action_log').get() as { count: number };
    return row.count;
  }
}
