import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS identities (
  user_id   TEXT PRIMARY KEY,
  lid_jid   TEXT,
  pn_jid    TEXT,
  username  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_lid_user
  ON identities(lid_jid) WHERE lid_jid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_pn_user
  ON identities(pn_jid) WHERE pn_jid IS NOT NULL;

CREATE TABLE IF NOT EXISTS lid_pn_mappings (
  lid_user TEXT NOT NULL,
  pn_user  TEXT NOT NULL,
  PRIMARY KEY (lid_user, pn_user)
);

CREATE TABLE IF NOT EXISTS players (
  user_id               TEXT PRIMARY KEY,
  level                 INTEGER NOT NULL DEFAULT 1,
  xp                    INTEGER NOT NULL DEFAULT 0,
  energy                INTEGER NOT NULL DEFAULT 100,
  max_energy            INTEGER NOT NULL DEFAULT 100,
  attack                INTEGER NOT NULL DEFAULT 10,
  defense               INTEGER NOT NULL DEFAULT 10,
  luck                  INTEGER NOT NULL DEFAULT 0,
  wallet_coins          INTEGER NOT NULL DEFAULT 100,
  bank_coins            INTEGER NOT NULL DEFAULT 0,
  wins                  INTEGER NOT NULL DEFAULT 0,
  losses                INTEGER NOT NULL DEFAULT 0,
  last_daily            INTEGER,
  robbery_cooldown      TEXT,
  combat_cooldown_until INTEGER,
  hunt_cooldown_until   INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES identities(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id  TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES players(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipment (
  user_id   TEXT PRIMARY KEY,
  weapon    TEXT,
  armor     TEXT,
  accessory TEXT,
  FOREIGN KEY (user_id) REFERENCES players(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_missions (
  user_id    TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  day_key    TEXT NOT NULL,
  progress   INTEGER NOT NULL DEFAULT 0,
  claimed    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, mission_id, day_key),
  FOREIGN KEY (user_id) REFERENCES players(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  chat_number INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, chat_number),
  FOREIGN KEY (user_id) REFERENCES identities(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES ai_chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_chat
  ON ai_messages(chat_id, id);

CREATE INDEX IF NOT EXISTS idx_ai_chats_user
  ON ai_chats(user_id, chat_number);
`;

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_V1);
  return db;
}

export function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gg-bot-test-'));
  return join(dir, 'test.db');
}

export function cleanupTempDir(dbPath: string): void {
  try {
    const dir = dbPath.replace(/[/\\][^/\\]+$/, '');
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/** Insert an identity row directly so FK constraints are satisfied for player tests. */
export function insertTestIdentity(db: Database.Database, userId: string): void {
  db.prepare(
    `INSERT INTO identities (user_id, lid_jid, pn_jid, username) VALUES (?, null, null, null)`,
  ).run(userId);
}
