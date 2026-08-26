import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRepository } from '../src/services/rpg/player.repository.js';
import { createTestDb, createTempDbPath, cleanupTempDir, insertTestIdentity } from './helpers.js';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/db/index.js';

describe('PlayerRepository', () => {
  let db: Database.Database;
  let repo: PlayerRepository;
  const userId = 'user-1';

  beforeEach(() => {
    db = createTestDb();
    insertTestIdentity(db, userId);
    repo = new PlayerRepository(db);
  });

  it('getOrCreatePlayer creates a player with correct initial values', () => {
    const player = repo.getOrCreatePlayer(userId);
    assert.equal(player.userId, userId);
    assert.equal(player.level, 1);
    assert.equal(player.xp, 0);
    assert.equal(player.energy, 100);
    assert.equal(player.maxEnergy, 100);
    assert.equal(player.attack, 10);
    assert.equal(player.defense, 10);
    assert.equal(player.luck, 0);
    assert.equal(player.walletCoins, 100);
    assert.equal(player.bankCoins, 0);
    assert.equal(player.wins, 0);
    assert.equal(player.losses, 0);
    assert.equal(player.lastDaily, null);
    assert.equal(player.robberyCooldown, null);
    assert.equal(player.combatCooldownUntil, null);
    assert.equal(player.huntCooldownUntil, null);
    assert.deepEqual(player.inventory, {});
    assert.deepEqual(player.equipment, { weapon: null, armor: null, accessory: null });
    assert.deepEqual(player.missions, {});
  });

  it('getPlayer returns undefined if player does not exist', () => {
    assert.equal(repo.getPlayer('nonexistent'), undefined);
  });

  it('getOrCreatePlayer returns the same reference when player is cached', () => {
    const first = repo.getOrCreatePlayer(userId);
    const second = repo.getOrCreatePlayer(userId);
    assert.equal(first, second);
  });

  it('savePlayer persists all properties', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.level = 5;
    player.xp = 75;
    player.energy = 50;
    player.maxEnergy = 150;
    player.attack = 20;
    player.defense = 15;
    player.luck = 5;
    player.walletCoins = 500;
    player.bankCoins = 200;
    player.wins = 10;
    player.losses = 3;
    player.lastDaily = 1000;
    player.robberyCooldown = { until: 2000, jailed: true };
    player.combatCooldownUntil = 3000;
    player.huntCooldownUntil = 4000;
    repo.savePlayer(player);

    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.equal(loaded.level, 5);
    assert.equal(loaded.xp, 75);
    assert.equal(loaded.energy, 50);
    assert.equal(loaded.maxEnergy, 150);
    assert.equal(loaded.attack, 20);
    assert.equal(loaded.defense, 15);
    assert.equal(loaded.luck, 5);
    assert.equal(loaded.walletCoins, 500);
    assert.equal(loaded.bankCoins, 200);
    assert.equal(loaded.wins, 10);
    assert.equal(loaded.losses, 3);
    assert.equal(loaded.lastDaily, 1000);
    assert.deepEqual(loaded.robberyCooldown, { until: 2000, jailed: true });
    assert.equal(loaded.combatCooldownUntil, 3000);
    assert.equal(loaded.huntCooldownUntil, 4000);
  });

  it('inventory is serialized/deserialized correctly', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.inventory = { spada: 2, pozione: 5, scudo: 1 };
    repo.savePlayer(player);

    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.deepEqual(loaded.inventory, { spada: 2, pozione: 5, scudo: 1 });
  });

  it('equipment is serialized/deserialized correctly', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.equipment = { weapon: 'spada', armor: 'scudo', accessory: null };
    repo.savePlayer(player);

    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.deepEqual(loaded.equipment, { weapon: 'spada', armor: 'scudo', accessory: null });
  });

  it('missions is serialized/deserialized correctly', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.missions = {
      'combatti-3': { dayKey: '2025-01-15', progress: 2, claimed: false },
      'caccia-3': { dayKey: '2025-01-15', progress: 3, claimed: true },
    };
    repo.savePlayer(player);

    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.equal(loaded.missions['combatti-3'].dayKey, '2025-01-15');
    assert.equal(loaded.missions['combatti-3'].progress, 2);
    assert.equal(loaded.missions['combatti-3'].claimed, false);
    assert.equal(loaded.missions['caccia-3'].progress, 3);
    assert.equal(loaded.missions['caccia-3'].claimed, true);
  });

  it('robberyCooldown is serialized/deserialized correctly', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.robberyCooldown = { until: 999999, jailed: false };
    repo.savePlayer(player);

    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.deepEqual(loaded.robberyCooldown, { until: 999999, jailed: false });
  });

  it('reload from a new repository on the same DB recovers data', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.level = 7;
    player.walletCoins = 1234;
    player.inventory = { pozione: 3 };
    repo.savePlayer(player);

    // Simulate a "restart": create entirely new repo on same DB
    const newRepo = new PlayerRepository(db);
    const loaded = newRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.equal(loaded.level, 7);
    assert.equal(loaded.walletCoins, 1234);
    assert.deepEqual(loaded.inventory, { pozione: 3 });
  });

  it('transaction commits on success', () => {
    const player = repo.getOrCreatePlayer(userId);
    const result = repo.transaction(() => {
      player.walletCoins = 999;
      repo.savePlayer(player);
      return 'done';
    });
    assert.equal(result, 'done');
    const loaded = repo.getPlayer(userId);
    assert.ok(loaded);
    assert.equal(loaded.walletCoins, 999);
  });

  it('transaction rolls back on exception', () => {
    const player = repo.getOrCreatePlayer(userId);
    player.walletCoins = 50;
    repo.savePlayer(player);

    assert.throws(() => {
      repo.transaction(() => {
        player.walletCoins = 999;
        repo.savePlayer(player);
        throw new Error('boom');
      });
    }, /boom/);

    // Create a fresh repo to bypass cache and verify DB state
    const freshRepo = new PlayerRepository(db);
    const loaded = freshRepo.getPlayer(userId);
    assert.ok(loaded);
    assert.equal(loaded.walletCoins, 50);
  });

  it('getAllPlayers returns all players in the DB', () => {
    insertTestIdentity(db, 'user-a');
    insertTestIdentity(db, 'user-b');
    insertTestIdentity(db, 'user-c');
    repo.getOrCreatePlayer(userId);
    repo.getOrCreatePlayer('user-a');
    repo.getOrCreatePlayer('user-c');

    const all = repo.getAllPlayers();
    const ids = all.map((p) => p.userId).sort();
    assert.deepEqual(ids, ['user-1', 'user-a', 'user-c']);
  });

  it('true restart: data survives closing and reopening DB via temp file', async () => {
    const tempPath = createTempDbPath();
    try {
      // Phase 1: create DB, populate, close
      {
        const db1 = openDatabase(tempPath);
        insertTestIdentity(db1, 'restart-user');
        const repo1 = new PlayerRepository(db1);
        const p = repo1.getOrCreatePlayer('restart-user');
        p.level = 12;
        p.walletCoins = 42;
        p.inventory = { spada: 1 };
        repo1.savePlayer(p);
        db1.close();
      }

      // Phase 2: reopen DB, verify
      {
        const db2 = openDatabase(tempPath);
        const repo2 = new PlayerRepository(db2);
        const loaded = repo2.getPlayer('restart-user');
        assert.ok(loaded);
        assert.equal(loaded.level, 12);
        assert.equal(loaded.walletCoins, 42);
        assert.deepEqual(loaded.inventory, { spada: 1 });
        db2.close();
      }
    } finally {
      cleanupTempDir(tempPath);
    }
  });
});
