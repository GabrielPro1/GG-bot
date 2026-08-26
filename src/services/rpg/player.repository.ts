import type Database from 'better-sqlite3';
import type {
  DailyMissionState,
  EquipmentSlots,
  RpgPlayer,
  RobberyPenalty,
} from './types.js';

const INITIAL_LEVEL = 1;
const INITIAL_XP = 0;
const INITIAL_ENERGY = 100;
const INITIAL_MAX_ENERGY = 100;
const INITIAL_ATTACK = 10;
const INITIAL_DEFENSE = 10;
const INITIAL_LUCK = 0;
const INITIAL_COINS = 100;
const INITIAL_BANK_COINS = 0;

interface PlayerRow {
  user_id: string;
  level: number;
  xp: number;
  energy: number;
  max_energy: number;
  attack: number;
  defense: number;
  luck: number;
  wallet_coins: number;
  bank_coins: number;
  wins: number;
  losses: number;
  last_daily: number | null;
  robbery_cooldown: string | null;
  combat_cooldown_until: number | null;
  hunt_cooldown_until: number | null;
}

interface InventoryRow {
  item_id: string;
  quantity: number;
}

interface EquipmentRow {
  weapon: string | null;
  armor: string | null;
  accessory: string | null;
}

interface MissionRow {
  mission_id: string;
  day_key: string;
  progress: number;
  claimed: number;
}

export class PlayerRepository {
  private readonly cache = new Map<string, RpgPlayer>();
  private readonly db: Database.Database;

  private readonly stmts: {
    getPlayer: Database.Statement;
    selectAllPlayers: Database.Statement;
    upsertPlayer: Database.Statement;
    deleteInventory: Database.Statement;
    insertInventory: Database.Statement;
    getInventory: Database.Statement;
    upsertEquipment: Database.Statement;
    getEquipment: Database.Statement;
    getMissions: Database.Statement;
    upsertMission: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;

    this.stmts = {
      getPlayer: db.prepare(
        `SELECT user_id, level, xp, energy, max_energy, attack, defense, luck,
                wallet_coins, bank_coins, wins, losses, last_daily,
                robbery_cooldown, combat_cooldown_until, hunt_cooldown_until
         FROM players WHERE user_id = ?`,
      ),
      selectAllPlayers: db.prepare(
        `SELECT user_id, level, xp, energy, max_energy, attack, defense, luck,
                wallet_coins, bank_coins, wins, losses, last_daily,
                robbery_cooldown, combat_cooldown_until, hunt_cooldown_until
         FROM players`,
      ),
      upsertPlayer: db.prepare(
        `INSERT INTO players (user_id, level, xp, energy, max_energy, attack, defense, luck,
                              wallet_coins, bank_coins, wins, losses, last_daily,
                              robbery_cooldown, combat_cooldown_until, hunt_cooldown_until)
         VALUES (@userId, @level, @xp, @energy, @maxEnergy, @attack, @defense, @luck,
                 @walletCoins, @bankCoins, @wins, @losses, @lastDaily,
                 @robberyCooldown, @combatCooldownUntil, @huntCooldownUntil)
         ON CONFLICT(user_id) DO UPDATE SET
           level = @level, xp = @xp, energy = @energy, max_energy = @maxEnergy,
           attack = @attack, defense = @defense, luck = @luck,
           wallet_coins = @walletCoins, bank_coins = @bankCoins,
           wins = @wins, losses = @losses, last_daily = @lastDaily,
           robbery_cooldown = @robberyCooldown,
           combat_cooldown_until = @combatCooldownUntil,
           hunt_cooldown_until = @huntCooldownUntil,
           updated_at = datetime('now')`,
      ),
      deleteInventory: db.prepare(
        `DELETE FROM inventory WHERE user_id = ?`,
      ),
      insertInventory: db.prepare(
        `INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)`,
      ),
      getInventory: db.prepare(
        `SELECT item_id, quantity FROM inventory WHERE user_id = ?`,
      ),
      upsertEquipment: db.prepare(
        `INSERT INTO equipment (user_id, weapon, armor, accessory)
         VALUES (@userId, @weapon, @armor, @accessory)
         ON CONFLICT(user_id) DO UPDATE SET
           weapon = @weapon, armor = @armor, accessory = @accessory`,
      ),
      getEquipment: db.prepare(
        `SELECT weapon, armor, accessory FROM equipment WHERE user_id = ?`,
      ),
      getMissions: db.prepare(
        `SELECT mission_id, day_key, progress, claimed FROM player_missions WHERE user_id = ?`,
      ),
      upsertMission: db.prepare(
        `INSERT INTO player_missions (user_id, mission_id, day_key, progress, claimed)
         VALUES (@userId, @missionId, @dayKey, @progress, @claimed)
         ON CONFLICT(user_id, mission_id, day_key) DO UPDATE SET
           progress = @progress, claimed = @claimed`,
      ),
    };
  }

  getPlayer(userId: string): RpgPlayer | undefined {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const row = this.stmts.getPlayer.get(userId) as PlayerRow | undefined;
    if (!row) return undefined;

    const player = this.rowToPlayer(row);
    player.inventory = this.loadInventory(userId);
    player.equipment = this.loadEquipment(userId);
    player.missions = this.loadMissions(userId);

    this.cache.set(userId, player);
    return player;
  }

  getOrCreatePlayer(userId: string): RpgPlayer {
    const existing = this.getPlayer(userId);
    if (existing) return existing;

    const player = this.createInitialPlayer(userId);
    this.savePlayer(player);
    this.cache.set(userId, player);
    return player;
  }

  savePlayer(player: RpgPlayer): void {
    this.stmts.upsertPlayer.run({
      userId: player.userId,
      level: player.level,
      xp: player.xp,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      attack: player.attack,
      defense: player.defense,
      luck: player.luck,
      walletCoins: player.walletCoins,
      bankCoins: player.bankCoins,
      wins: player.wins,
      losses: player.losses,
      lastDaily: player.lastDaily,
      robberyCooldown: player.robberyCooldown ? JSON.stringify(player.robberyCooldown) : null,
      combatCooldownUntil: player.combatCooldownUntil,
      huntCooldownUntil: player.huntCooldownUntil,
    });

    this.stmts.deleteInventory.run(player.userId);
    for (const [itemId, quantity] of Object.entries(player.inventory)) {
      if (quantity > 0) {
        this.stmts.insertInventory.run(player.userId, itemId, quantity);
      }
    }

    this.stmts.upsertEquipment.run({
      userId: player.userId,
      weapon: player.equipment.weapon,
      armor: player.equipment.armor,
      accessory: player.equipment.accessory,
    });

    for (const [missionId, state] of Object.entries(player.missions)) {
      this.stmts.upsertMission.run({
        userId: player.userId,
        missionId,
        dayKey: state.dayKey,
        progress: state.progress,
        claimed: state.claimed ? 1 : 0,
      });
    }

    this.cache.set(player.userId, player);
  }

  getAllPlayers(): RpgPlayer[] {
    const rows = this.stmts.selectAllPlayers.all() as PlayerRow[];
    return rows.map((row) => {
      const userId = row.user_id;
      const cached = this.cache.get(userId);
      if (cached) return cached;

      const player = this.rowToPlayer(row);
      player.inventory = this.loadInventory(userId);
      player.equipment = this.loadEquipment(userId);
      player.missions = this.loadMissions(userId);
      this.cache.set(userId, player);
      return player;
    });
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  private loadInventory(userId: string): Record<string, number> {
    const rows = this.stmts.getInventory.all(userId) as InventoryRow[];
    const inventory: Record<string, number> = {};
    for (const row of rows) {
      inventory[row.item_id] = row.quantity;
    }
    return inventory;
  }

  private loadEquipment(userId: string): EquipmentSlots {
    const row = this.stmts.getEquipment.get(userId) as EquipmentRow | undefined;
    return row
      ? { weapon: row.weapon, armor: row.armor, accessory: row.accessory }
      : { weapon: null, armor: null, accessory: null };
  }

  private loadMissions(userId: string): Record<string, DailyMissionState> {
    const rows = this.stmts.getMissions.all(userId) as MissionRow[];
    const missions: Record<string, DailyMissionState> = {};
    for (const row of rows) {
      missions[row.mission_id] = {
        dayKey: row.day_key,
        progress: row.progress,
        claimed: row.claimed === 1,
      };
    }
    return missions;
  }

  private rowToPlayer(row: PlayerRow): RpgPlayer {
    let robberyCooldown: RobberyPenalty | null = null;
    if (row.robbery_cooldown) {
      try {
        robberyCooldown = JSON.parse(row.robbery_cooldown) as RobberyPenalty;
      } catch {
        robberyCooldown = null;
      }
    }

    return {
      userId: row.user_id,
      level: row.level,
      xp: row.xp,
      energy: row.energy,
      maxEnergy: row.max_energy,
      attack: row.attack,
      defense: row.defense,
      luck: row.luck,
      walletCoins: row.wallet_coins,
      bankCoins: row.bank_coins,
      wins: row.wins,
      losses: row.losses,
      lastDaily: row.last_daily,
      robberyCooldown,
      combatCooldownUntil: row.combat_cooldown_until,
      huntCooldownUntil: row.hunt_cooldown_until,
      inventory: {},
      equipment: { weapon: null, armor: null, accessory: null },
      missions: {},
    };
  }

  private createInitialPlayer(userId: string): RpgPlayer {
    return {
      userId,
      level: INITIAL_LEVEL,
      xp: INITIAL_XP,
      energy: INITIAL_ENERGY,
      maxEnergy: INITIAL_MAX_ENERGY,
      attack: INITIAL_ATTACK,
      defense: INITIAL_DEFENSE,
      luck: INITIAL_LUCK,
      walletCoins: INITIAL_COINS,
      bankCoins: INITIAL_BANK_COINS,
      wins: 0,
      losses: 0,
      lastDaily: null,
      robberyCooldown: null,
      combatCooldownUntil: null,
      huntCooldownUntil: null,
      inventory: {},
      equipment: { weapon: null, armor: null, accessory: null },
      missions: {},
    };
  }
}
