import Database from 'better-sqlite3';
import logger from '../logger';

const migrations: string[] = [
  // Migration 1: Initial schema
  `
    CREATE TABLE IF NOT EXISTS upgrade_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radarr_movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      year INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      current_tier INTEGER NOT NULL,
      target_tier INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_movie_target_pending
      ON upgrade_queue(radarr_movie_id, target_tier)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS denied_movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radarr_movie_id INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      target_tier INTEGER NOT NULL,
      denied_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(radarr_movie_id, target_tier)
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radarr_movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_action_log_created
      ON action_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `,
];

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  const version = currentVersion?.v ?? 0;

  for (let i = version; i < migrations.length; i++) {
    logger.info(`Running migration ${i + 1}`);
    db.exec(migrations[i]);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
  }

  if (version < migrations.length) {
    logger.info(`Database migrated to version ${migrations.length}`);
  }
}
