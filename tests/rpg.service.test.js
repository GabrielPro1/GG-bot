import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RpgService, dayKeyFromDate, selectMissionsForDay } from '../lib/rpg/rpg.service.js';
import { PlayerRepository } from '../lib/rpg/player.repository.js';
import { createTestDb, insertTestIdentity, createTempDbPath, cleanupTempDir } from './helpers.js';
import { openDatabase } from '../lib/db/index.js';
describe('RpgService', () => {
    let db;
    let repo;
    let rpg;
    const uid = 'rpg-user-1';
    const uid2 = 'rpg-user-2';
    beforeEach(() => {
        db = createTestDb();
        insertTestIdentity(db, uid);
        insertTestIdentity(db, uid2);
        repo = new PlayerRepository(db);
        rpg = new RpgService(repo);
    });
    // --- player creation ---
    it('getOrCreatePlayer creates initial player', () => {
        const p = rpg.getOrCreatePlayer(uid);
        assert.equal(p.userId, uid);
        assert.equal(p.level, 1);
        assert.equal(p.walletCoins, 100);
        assert.equal(p.energy, 100);
    });
    // --- persistence/reload ---
    it('data persists on a fresh repository', () => {
        const p = rpg.getOrCreatePlayer(uid);
        p.level = 3;
        p.walletCoins = 250;
        repo.savePlayer(p);
        const freshRepo = new PlayerRepository(db);
        const fresh = new RpgService(freshRepo);
        const loaded = fresh.getPlayer(uid);
        assert.ok(loaded);
        assert.equal(loaded.level, 3);
        assert.equal(loaded.walletCoins, 250);
    });
    // --- wallet + bank ---
    it('getWalletBalance and getBankBalance return correct values', () => {
        rpg.getOrCreatePlayer(uid);
        assert.equal(rpg.getWalletBalance(uid), 100);
        assert.equal(rpg.getBankBalance(uid), 0);
    });
    // --- deposit ---
    it('deposit transfers coins from wallet to bank', () => {
        rpg.getOrCreatePlayer(uid);
        const result = rpg.deposit(uid, 30);
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.walletCoins, 70);
            assert.equal(result.bankCoins, 30);
        }
    });
    it('deposit fails with insufficient wallet', () => {
        rpg.getOrCreatePlayer(uid);
        const result = rpg.deposit(uid, 999);
        assert.equal(result.ok, false);
        if (!result.ok)
            assert.equal(result.error, 'insufficient_wallet');
    });
    // --- withdraw ---
    it('withdraw transfers coins from bank to wallet', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.deposit(uid, 50);
        const result = rpg.withdraw(uid, 20);
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.walletCoins, 70);
            assert.equal(result.bankCoins, 30);
        }
    });
    it('withdraw fails with insufficient bank', () => {
        rpg.getOrCreatePlayer(uid);
        const result = rpg.withdraw(uid, 10);
        assert.equal(result.ok, false);
        if (!result.ok)
            assert.equal(result.error, 'insufficient_bank');
    });
    // --- spendWallet ---
    it('spendWallet succeeds with sufficient balance', () => {
        rpg.getOrCreatePlayer(uid);
        const result = rpg.spendWallet(uid, 40);
        assert.equal(result.ok, true);
        if (result.ok)
            assert.equal(result.walletCoins, 60);
    });
    it('spendWallet fails with insufficient balance', () => {
        rpg.getOrCreatePlayer(uid);
        const result = rpg.spendWallet(uid, 200);
        assert.equal(result.ok, false);
        if (!result.ok)
            assert.equal(result.error, 'insufficient_wallet');
    });
    // --- inventory ---
    it('addItem adds to inventory and getInventory returns it', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.addItem(uid, 'pozione', 3);
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.totalOwned, 3);
            assert.equal(res.quantityAdded, 3);
        }
        const inv = rpg.getInventory(uid);
        assert.equal(inv['pozione'], 3);
    });
    it('addItem with unknown item returns error', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.addItem(uid, 'nonexistent', 1);
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.error, 'unknown_item');
    });
    // --- equipment ---
    it('equipItem equips a weapon and unequipItem removes it', () => {
        const p = rpg.getOrCreatePlayer(uid);
        // Give the player a weapon in inventory
        rpg.addItem(uid, 'spada', 1);
        assert.equal(p.inventory['spada'], 1);
        const equipRes = rpg.equipItem(uid, 'spada');
        assert.equal(equipRes.ok, true);
        if (equipRes.ok)
            assert.equal(equipRes.slot, 'weapon');
        assert.equal(p.equipment.weapon, 'spada');
        const unequipRes = rpg.unequipItem(uid, 'spada');
        assert.equal(unequipRes.ok, true);
        if (unequipRes.ok)
            assert.equal(unequipRes.slot, 'weapon');
        assert.equal(p.equipment.weapon, null);
    });
    it('equipItem fails when item not in inventory', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.equipItem(uid, 'spada');
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.error, 'not_in_inventory');
    });
    // --- useItem ---
    it('useItem consumes a potion and restores energy', () => {
        const p = rpg.getOrCreatePlayer(uid);
        p.energy = 50;
        repo.savePlayer(p);
        rpg.addItem(uid, 'pozione', 1);
        const res = rpg.useItem(uid, 'pozione');
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.energy, 75); // 50 + 25
            assert.equal(res.remainingQuantity, 0);
        }
        assert.equal(rpg.getInventory(uid)['pozione'], undefined);
    });
    it('useItem fails when energy is full', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.addItem(uid, 'pozione', 1);
        const res = rpg.useItem(uid, 'pozione');
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.error, 'energy_full');
    });
    // --- energy ---
    it('consumeEnergy reduces energy', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.consumeEnergy(uid, 30);
        assert.equal(res.ok, true);
        if (res.ok)
            assert.equal(res.energy, 70);
    });
    it('consumeEnergy fails when insufficient', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.consumeEnergy(uid, 200);
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.error, 'insufficient_energy');
    });
    it('restoreEnergy increases energy up to max', () => {
        const p = rpg.getOrCreatePlayer(uid);
        p.energy = 80;
        repo.savePlayer(p);
        const res = rpg.restoreEnergy(uid, 50);
        assert.equal(res.ok, true);
        if (res.ok)
            assert.equal(res.energy, 100); // capped at maxEnergy
    });
    // --- daily claim ---
    it('claimDaily gives reward on first claim', () => {
        rpg.getOrCreatePlayer(uid);
        const now = 1000000;
        const res = rpg.claimDaily(uid, now);
        assert.equal(res.claimed, true);
        if (res.claimed) {
            assert.equal(res.reward, 100);
            assert.equal(res.walletCoins, 200);
        }
    });
    it('claimDaily fails on second call same day', () => {
        rpg.getOrCreatePlayer(uid);
        const now = 1000000;
        rpg.claimDaily(uid, now);
        const res = rpg.claimDaily(uid, now + 1000);
        assert.equal(res.claimed, false);
    });
    // --- combat cooldown ---
    it('startCombat sets combatCooldownUntil on attacker', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.getOrCreatePlayer(uid2);
        const now = 1000000;
        const deterministic = {
            rollAttackerCritical: () => false,
            rollDefenderCritical: () => false,
        };
        const res = rpg.startCombat(uid, uid2, { now, randomSource: deterministic });
        assert.equal(res.ok, true);
        const p = rpg.getPlayer(uid);
        assert.ok(p);
        assert.equal(p.combatCooldownUntil, now + 10 * 60 * 1000);
    });
    // --- hunt cooldown ---
    it('hunt sets huntCooldownUntil', () => {
        rpg.getOrCreatePlayer(uid);
        const now = 1000000;
        const deterministic = {
            pickMonsterIndex: () => 0,
            rollPlayerCritical: () => false,
            rollRange: (min) => min,
            rollLootDrop: () => false,
        };
        const res = rpg.hunt(uid, { now, randomSource: deterministic });
        assert.equal(res.ok, true);
        const p = rpg.getPlayer(uid);
        assert.ok(p);
        assert.equal(p.huntCooldownUntil, now + 5 * 60 * 1000);
    });
    // --- robbery cooldown ---
    it('rob sets robberyCooldown on successful robbery', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.getOrCreatePlayer(uid2);
        const now = 1000000;
        // rng: first call 0.2 (< 0.65 success chance), second call 0.15 (20% loot)
        let callCount = 0;
        const rng = () => {
            callCount++;
            return callCount === 1 ? 0.2 : 0.15;
        };
        const res = rpg.rob(uid, uid2, { now, rng });
        assert.equal(res.outcome, 'success');
        const p = rpg.getPlayer(uid);
        assert.ok(p);
        assert.ok(p.robberyCooldown);
        assert.equal(p.robberyCooldown.jailed, false);
    });
    it('rob sets jailed penalty when rng >= ROB_SUCCESS_CHANCE', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.getOrCreatePlayer(uid2);
        const now = 1000000;
        // rng: first call 0.2 (loot), second call 0.8 (>= 0.65 => jailed)
        let callCount = 0;
        const rng = () => {
            callCount++;
            return callCount === 1 ? 0.2 : 0.8;
        };
        const res = rpg.rob(uid, uid2, { now, rng });
        assert.equal(res.outcome, 'jailed');
        const p = rpg.getPlayer(uid);
        assert.ok(p);
        assert.ok(p.robberyCooldown);
        assert.equal(p.robberyCooldown.jailed, true);
    });
    // --- mission progress ---
    it('trackMissionProgress records progress for active missions', () => {
        rpg.getOrCreatePlayer(uid);
        const now = Date.now();
        const dayKey = dayKeyFromDate(new Date(now));
        const activeMissions = selectMissionsForDay(dayKey);
        // Find a combat mission if one is active today
        const combatMission = activeMissions.find((m) => m.goalType === 'combat');
        if (combatMission) {
            rpg.trackMissionProgress(uid, 'combat', now);
            const player = rpg.getPlayer(uid);
            assert.ok(player);
            assert.equal(player.missions[combatMission.id]?.progress, 1);
            assert.equal(player.missions[combatMission.id]?.dayKey, dayKey);
        }
    });
    it('claimMission succeeds when target is met', () => {
        rpg.getOrCreatePlayer(uid);
        const now = Date.now();
        const dayKey = dayKeyFromDate(new Date(now));
        const activeMissions = selectMissionsForDay(dayKey);
        // Find a daily mission (target=1) and complete it
        const dailyMission = activeMissions.find((m) => m.goalType === 'daily');
        if (dailyMission) {
            // Claim daily first to trigger trackMissionProgress('daily')
            rpg.claimDaily(uid, now);
            const claimRes = rpg.claimMission(uid, dailyMission.id, now);
            assert.equal(claimRes.ok, true);
        }
    });
    it('claimMission fails on double claim', () => {
        rpg.getOrCreatePlayer(uid);
        const now = Date.now();
        const dayKey = dayKeyFromDate(new Date(now));
        const activeMissions = selectMissionsForDay(dayKey);
        const dailyMission = activeMissions.find((m) => m.goalType === 'daily');
        if (dailyMission) {
            rpg.claimDaily(uid, now);
            rpg.claimMission(uid, dailyMission.id, now);
            const second = rpg.claimMission(uid, dailyMission.id, now + 1000);
            assert.equal(second.ok, false);
            if (!second.ok)
                assert.equal(second.reason, 'already_claimed');
        }
    });
    it('mission resets on a different day', () => {
        rpg.getOrCreatePlayer(uid);
        const day1 = new Date('2025-06-15T12:00:00Z').getTime();
        const day2 = new Date('2025-06-16T12:00:00Z').getTime();
        const dk1 = dayKeyFromDate(new Date(day1));
        const dk2 = dayKeyFromDate(new Date(day2));
        if (dk1 !== dk2) {
            // Force mission state for day 1
            const player = rpg.getOrCreatePlayer(uid);
            player.missions['test-mission'] = { dayKey: dk1, progress: 99, claimed: true };
            repo.savePlayer(player);
            // Track on day 2 should start fresh
            // We use an active mission type for day 2
            const activeMissions = selectMissionsForDay(dk2);
            if (activeMissions.length > 0) {
                rpg.trackMissionProgress(uid, activeMissions[0].goalType, day2);
                const reloaded = rpg.getPlayer(uid);
                assert.ok(reloaded);
                const state = reloaded.missions[activeMissions[0].id];
                if (state) {
                    assert.equal(state.dayKey, dk2);
                    assert.equal(state.progress, 1);
                    assert.equal(state.claimed, false);
                }
            }
        }
    });
    // --- combat PvP ---
    it('startCombat modifies both attacker and defender', () => {
        rpg.getOrCreatePlayer(uid);
        rpg.getOrCreatePlayer(uid2);
        const now = 1000000;
        // Force a draw: equal damage -> both get draw xp/coins
        const deterministic = {
            rollAttackerCritical: () => false,
            rollDefenderCritical: () => false,
        };
        const beforeAtkWallet = rpg.getWalletBalance(uid);
        const beforeDefWallet = rpg.getWalletBalance(uid2);
        const res = rpg.startCombat(uid, uid2, { now, randomSource: deterministic });
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.outcome, 'draw');
            // Both get COMBAT_COINS_DRAW=10 and COMBAT_XP_DRAW=10
            assert.equal(rpg.getWalletBalance(uid), beforeAtkWallet + 10);
            assert.equal(rpg.getWalletBalance(uid2), beforeDefWallet + 10);
        }
    });
    it('startCombat rejects self_target', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.startCombat(uid, uid, { now: 1000000 });
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.reason, 'self_target');
    });
    it('startCombat fails when attacker not found', () => {
        rpg.getOrCreatePlayer(uid2);
        const res = rpg.startCombat('ghost', uid2, { now: 1000000 });
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.reason, 'attacker_not_found');
    });
    it('startCombat fails when defender not found', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.startCombat(uid, 'ghost', { now: 1000000 });
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.reason, 'target_not_found');
    });
    // --- rob ---
    it('rob success: thief gains, victim loses', () => {
        rpg.getOrCreatePlayer(uid);
        const victim = rpg.getOrCreatePlayer(uid2);
        victim.walletCoins = 200;
        repo.savePlayer(victim);
        const now = 1000000;
        let callCount = 0;
        const rng = () => {
            callCount++;
            // first call => loot percentage, second call => success (< 0.65)
            return callCount === 1 ? 0.2 : 0.1;
        };
        const beforeThief = rpg.getWalletBalance(uid);
        const beforeVictim = rpg.getWalletBalance(uid2);
        const res = rpg.rob(uid, uid2, { now, rng });
        assert.equal(res.outcome, 'success');
        assert.ok(rpg.getWalletBalance(uid) > beforeThief);
        assert.ok(rpg.getWalletBalance(uid2) < beforeVictim);
    });
    it('rob returns broke_victim when victim has no coins', () => {
        rpg.getOrCreatePlayer(uid);
        const victim = rpg.getOrCreatePlayer(uid2);
        victim.walletCoins = 0;
        repo.savePlayer(victim);
        const res = rpg.rob(uid, uid2, { now: 1000000, rng: () => 0.1 });
        assert.equal(res.outcome, 'broke_victim');
    });
    it('rob returns self_target when thief == victim', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.rob(uid, uid, { now: 1000000 });
        assert.equal(res.outcome, 'self_target');
    });
    // --- leaderboard ---
    it('getLeaderboardByLevel sorts by level desc', () => {
        const p1 = rpg.getOrCreatePlayer(uid);
        p1.level = 5;
        p1.xp = 50;
        repo.savePlayer(p1);
        const p2 = rpg.getOrCreatePlayer(uid2);
        p2.level = 10;
        p2.xp = 0;
        repo.savePlayer(p2);
        const lb = rpg.getLeaderboardByLevel();
        assert.equal(lb.length, 2);
        assert.equal(lb[0].userId, uid2);
        assert.equal(lb[1].userId, uid);
    });
    it('getLeaderboardByWins sorts by wins desc', () => {
        const p1 = rpg.getOrCreatePlayer(uid);
        p1.wins = 3;
        repo.savePlayer(p1);
        const p2 = rpg.getOrCreatePlayer(uid2);
        p2.wins = 7;
        repo.savePlayer(p2);
        const lb = rpg.getLeaderboardByWins();
        assert.equal(lb[0].userId, uid2);
        assert.equal(lb[1].userId, uid);
    });
    it('getLeaderboardByWealth sorts by total wealth desc', () => {
        const p1 = rpg.getOrCreatePlayer(uid);
        p1.walletCoins = 500;
        p1.bankCoins = 300; // total 800
        repo.savePlayer(p1);
        const p2 = rpg.getOrCreatePlayer(uid2);
        p2.walletCoins = 1000;
        p2.bankCoins = 0; // total 1000
        repo.savePlayer(p2);
        const lb = rpg.getLeaderboardByWealth();
        assert.equal(lb[0].userId, uid2);
        assert.equal(lb[1].userId, uid);
    });
    // --- purchase flow ---
    it('purchaseItem succeeds and deducts wallet coins', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.purchaseItem(uid, 'pozione'); // price: 50
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.quantityOwned, 1);
            assert.equal(res.walletCoins, 50); // 100 - 50
        }
        assert.equal(rpg.getInventory(uid)['pozione'], 1);
    });
    it('purchaseItem fails with insufficient wallet', () => {
        rpg.getOrCreatePlayer(uid);
        const res = rpg.purchaseItem(uid, 'spada'); // price: 500, wallet: 100
        assert.equal(res.ok, false);
        if (!res.ok)
            assert.equal(res.error, 'insufficient_wallet');
    });
    // --- hunt ---
    it('hunt victory gives coins and xp', () => {
        rpg.getOrCreatePlayer(uid);
        const now = 1000000;
        const deterministic = {
            pickMonsterIndex: () => 0, // ratto
            rollPlayerCritical: () => true, // crit => playerDamage * 2 => always win vs ratto
            rollRange: (_min, max) => max, // max reward
            rollLootDrop: () => false,
        };
        const beforeWallet = rpg.getWalletBalance(uid);
        const res = rpg.hunt(uid, { now, randomSource: deterministic });
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.outcome, 'victory');
            assert.ok(res.rewardCoins > 0);
            assert.ok(res.rewardXp > 0);
            assert.ok(rpg.getWalletBalance(uid) > beforeWallet);
        }
    });
    it('hunt defeat gives no coins and no xp', () => {
        rpg.getOrCreatePlayer(uid);
        const now = 1000000;
        // Pick the strongest monster (orco, defense=12, attack=22)
        // Give player low attack/defense to guarantee defeat
        const p = rpg.getOrCreatePlayer(uid);
        p.attack = 1;
        p.defense = 1;
        repo.savePlayer(p);
        const deterministic = {
            pickMonsterIndex: () => 3, // orco
            rollPlayerCritical: () => false,
            rollRange: (min) => min,
            rollLootDrop: () => false,
        };
        const beforeWallet = rpg.getWalletBalance(uid);
        const res = rpg.hunt(uid, { now, randomSource: deterministic });
        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.outcome, 'defeat');
            assert.equal(res.rewardCoins, 0);
            assert.equal(res.rewardXp, 0);
            assert.equal(rpg.getWalletBalance(uid), beforeWallet);
        }
    });
    it('true restart: RPG data survives file-based DB close/reopen', async () => {
        const tempPath = createTempDbPath();
        try {
            {
                const db1 = openDatabase(tempPath);
                insertTestIdentity(db1, 'restart-rpg');
                const repo1 = new PlayerRepository(db1);
                const rpg1 = new RpgService(repo1);
                const p = rpg1.getOrCreatePlayer('restart-rpg');
                p.level = 8;
                p.walletCoins = 333;
                repo1.savePlayer(p);
                db1.close();
            }
            {
                const db2 = openDatabase(tempPath);
                const repo2 = new PlayerRepository(db2);
                const rpg2 = new RpgService(repo2);
                const loaded = rpg2.getPlayer('restart-rpg');
                assert.ok(loaded);
                assert.equal(loaded.level, 8);
                assert.equal(loaded.walletCoins, 333);
                db2.close();
            }
        }
        finally {
            cleanupTempDir(tempPath);
        }
    });
});
