import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../config.js';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Reset the DB singleton (for testing). */
export function resetDb() {
  db = null;
}

export function getDb() {
  if (db) return db;

  const dataDir = process.env.DATA_DIR ?? config.dataDir;
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'hangarwiki.db');
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });
  return db;
}

/** Run schema creation (simple approach — for production, use proper migrations). */
export function initDb() {
  const db = getDb();
  const sqlite = (db as any).session.client as Database.Database;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      public_key TEXT,
      encrypted_private_key TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wikis (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      forge_owner TEXT NOT NULL,
      forge_repo TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wiki_members (
      id TEXT PRIMARY KEY,
      wiki_id TEXT NOT NULL REFERENCES wikis(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      invited_at TEXT NOT NULL,
      accepted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS page_index (
      id TEXT PRIMARY KEY,
      wiki_id TEXT NOT NULL REFERENCES wikis(id),
      page_path TEXT NOT NULL,
      title TEXT NOT NULL,
      content_text TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}
