import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const DB_PATH = resolve(PROJECT_ROOT, 'data', 'gg-bot.db');
const CURRENT_SCHEMA_VERSION = 1;

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
`;

const SCHEMA_VERSIONS: Record<number, string> = {
  1: SCHEMA_V1,
};

export function openDatabase(dbPath: string = DB_PATH): Database.Database {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  return db;
}

function initSchema(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version === 0) {
    const schema = SCHEMA_VERSIONS[1];
    if (!schema) throw new Error('Schema v1 not found');
    db.exec(schema);
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    console.log(`[db] Schema initialized (v${CURRENT_SCHEMA_VERSION})`);
  } else if (version < CURRENT_SCHEMA_VERSION) {
    for (let v = version + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const migration = SCHEMA_VERSIONS[v];
      if (!migration) throw new Error(`Schema migration v${v} not found`);
      db.exec(migration);
    }
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    console.log(`[db] Schema migrated v${version} → v${CURRENT_SCHEMA_VERSION}`);
  } else {
    console.log(`[db] Schema v${version} OK`);
  }
}
