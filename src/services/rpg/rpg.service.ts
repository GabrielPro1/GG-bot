import { findItemById } from './items/catalog.js';
import { isEquippable, type RpgItemType } from './items/types.js';
import { getAllMonsters } from './monsters/catalog.js';
import type { MonsterLootEntry, RpgMonster } from './monsters/types.js';
import type {
  AddItemResult,
  ClaimDailyResult,
  CombatRandomSource,
  CombatResult,
  EnergyResult,
  EquipResult,
  EquipSlot,
  EquipmentSlots,
  HuntLootEntry,
  HuntRandomSource,
  HuntResult,
  PlayerStats,
  PurchaseResult,
  RobOptions,
  RobResult,
  RpgPlayer,
  RpgServiceView,
  RobberyPenalty,
  SpendResult,
  TransferResult,
  UnequipResult,
  UseItemResult,
} from './types.js';

export const INITIAL_COINS = 100;
export const INITIAL_BANK_COINS = 0;
export const XP_PER_LEVEL = 100;
export const INITIAL_ENERGY = 100;
export const INITIAL_MAX_ENERGY = 100;
export const INITIAL_ATTACK = 10;
export const INITIAL_DEFENSE = 10;
export const INITIAL_LUCK = 0;
export const DAILY_REWARD_COINS = 100;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ROB_SUCCESS_CHANCE = 0.65;
export const ROB_MIN_PERCENTAGE = 10;
export const ROB_MAX_PERCENTAGE = 30;
export const ROB_SUCCESS_COOLDOWN_MS = 10 * 60 * 1000;
export const ROB_PRISON_MS = 30 * 60 * 1000;
export const COMBAT_ENERGY_COST = 20;
export const COMBAT_COOLDOWN_MS = 10 * 60 * 1000;
export const COMBAT_XP_WIN = 50;
export const COMBAT_XP_LOSS = 20;
export const COMBAT_XP_DRAW = 10;
export const COMBAT_COINS_WIN = 25;
export const COMBAT_COINS_LOSS = 5;
export const COMBAT_COINS_DRAW = 10;
export const HUNT_ENERGY_COST = COMBAT_ENERGY_COST;
export const HUNT_COOLDOWN_MS = 5 * 60 * 1000;

export function xpRequiredForLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
}

const SLOT_BY_ITEM_TYPE: Partial<Record<RpgItemType, EquipSlot>> = {
  weapon: 'weapon',
  armor: 'armor',
  accessory: 'accessory',
};

function slotForItemType(type: RpgItemType): EquipSlot | null {
  return SLOT_BY_ITEM_TYPE[type] ?? null;
}

function computeEffectiveStats(player: RpgPlayer): PlayerStats {
  let attackBonus = 0;
  let defenseBonus = 0;
  let luckBonus = 0;
  for (const itemId of Object.values(player.equipment)) {
    if (!itemId) continue;
    const item = findItemById(itemId);
    if (!item) continue;
    if (item.effect.kind === 'attack') attackBonus += item.effect.amount;
    else if (item.effect.kind === 'defense') defenseBonus += item.effect.amount;
    else if (item.effect.kind === 'luck') luckBonus += item.effect.amount;
  }
  return {
    energy: player.energy,
    maxEnergy: player.maxEnergy,
    attack: player.attack + attackBonus,
    defense: player.defense + defenseBonus,
    luck: player.luck + luckBonus,
  };
}

function createInitialPlayer(userId: string): RpgPlayer {
  return {
    userId,
    level: 1,
    xp: 0,
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
  };
}

export interface AddXpResult {
  levelsGained: number;
}

export class RpgService implements RpgServiceView {
  private readonly players = new Map<string, RpgPlayer>();

  getOrCreatePlayer(userId: string): RpgPlayer {
    const existing = this.players.get(userId);
    if (existing) {
      return existing;
    }
    const player = createInitialPlayer(userId);
    this.players.set(userId, player);
    return player;
  }

  getPlayer(userId: string): RpgPlayer | undefined {
    return this.players.get(userId);
  }

  getWalletBalance(userId: string): number {
    return this.getOrCreatePlayer(userId).walletCoins;
  }

  getBankBalance(userId: string): number {
    return this.getOrCreatePlayer(userId).bankCoins;
  }

  addCoins(userId: string, amount: number): void {
    this.getOrCreatePlayer(userId).walletCoins += amount;
  }

  deposit(userId: string, amount: number): TransferResult {
    if (!isValidAmount(amount)) return { ok: false, error: 'invalid_amount' };
    const player = this.getOrCreatePlayer(userId);
    if (amount > player.walletCoins) return { ok: false, error: 'insufficient_wallet' };
    player.walletCoins -= amount;
    player.bankCoins += amount;
    return { ok: true, walletCoins: player.walletCoins, bankCoins: player.bankCoins };
  }

  withdraw(userId: string, amount: number): TransferResult {
    if (!isValidAmount(amount)) return { ok: false, error: 'invalid_amount' };
    const player = this.getOrCreatePlayer(userId);
    if (amount > player.bankCoins) return { ok: false, error: 'insufficient_bank' };
    player.bankCoins -= amount;
    player.walletCoins += amount;
    return { ok: true, walletCoins: player.walletCoins, bankCoins: player.bankCoins };
  }

  spendWallet(userId: string, amount: number): SpendResult {
    if (!isValidAmount(amount)) return { ok: false, error: 'invalid_amount' };
    const player = this.getOrCreatePlayer(userId);
    if (amount > player.walletCoins) return { ok: false, error: 'insufficient_wallet' };
    player.walletCoins -= amount;
    return { ok: true, walletCoins: player.walletCoins, bankCoins: player.bankCoins };
  }

  getInventory(userId: string): Readonly<Record<string, number>> {
    const player = this.getOrCreatePlayer(userId);
    return { ...player.inventory };
  }

  addItem(userId: string, itemId: string, quantity: number): AddItemResult {
    const item = findItemById(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };
    if (!isValidAmount(quantity)) return { ok: false, error: 'invalid_quantity' };

    const player = this.getOrCreatePlayer(userId);
    const totalOwned = (player.inventory[item.id] ?? 0) + quantity;
    player.inventory[item.id] = totalOwned;

    return { ok: true, itemId: item.id, quantityAdded: quantity, totalOwned };
  }

  purchaseItem(userId: string, itemId: string): PurchaseResult {
    const item = findItemById(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };

    const payment = this.spendWallet(userId, item.price);
    if (!payment.ok) {
      if (payment.error === 'insufficient_wallet') {
        return {
          ok: false,
          error: 'insufficient_wallet',
          item,
          walletCoins: this.getWalletBalance(userId),
          bankCoins: this.getBankBalance(userId),
        };
      }
      return { ok: false, error: 'invalid_amount', item };
    }

    const player = this.getOrCreatePlayer(userId);
    const quantityOwned = (player.inventory[item.id] ?? 0) + 1;
    player.inventory[item.id] = quantityOwned;

    return { ok: true, item, quantityOwned, walletCoins: player.walletCoins };
  }

  getStats(userId: string): PlayerStats {
    return computeEffectiveStats(this.getOrCreatePlayer(userId));
  }

  consumeEnergy(userId: string, amount: number): EnergyResult {
    if (!isValidAmount(amount)) return { ok: false, error: 'invalid_amount' };
    const player = this.getOrCreatePlayer(userId);
    if (amount > player.energy) return { ok: false, error: 'insufficient_energy' };
    player.energy -= amount;
    return { ok: true, energy: player.energy, maxEnergy: player.maxEnergy };
  }

  restoreEnergy(userId: string, amount: number): EnergyResult {
    if (!isValidAmount(amount)) return { ok: false, error: 'invalid_amount' };
    const player = this.getOrCreatePlayer(userId);
    player.energy = Math.min(player.maxEnergy, player.energy + amount);
    return { ok: true, energy: player.energy, maxEnergy: player.maxEnergy };
  }

  getEquipment(userId: string): Readonly<EquipmentSlots> {
    const equipment = this.getOrCreatePlayer(userId).equipment;
    return { ...equipment };
  }

  equipItem(userId: string, itemId: string): EquipResult {
    const item = findItemById(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };

    const slot = slotForItemType(item.type);
    if (!slot || !isEquippable(item)) return { ok: false, error: 'not_equippable', item };

    const player = this.getOrCreatePlayer(userId);
    if ((player.inventory[item.id] ?? 0) <= 0) {
      return { ok: false, error: 'not_in_inventory', item };
    }
    if (player.equipment[slot] === item.id) {
      return { ok: false, error: 'already_equipped', item, slot };
    }

    player.equipment[slot] = item.id;
    return { ok: true, item, slot };
  }

  unequipItem(userId: string, itemId: string): UnequipResult {
    const item = findItemById(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };

    const slot = slotForItemType(item.type);
    if (!slot || !isEquippable(item)) return { ok: false, error: 'not_equippable', item };

    const player = this.getOrCreatePlayer(userId);
    if (player.equipment[slot] !== item.id) {
      return { ok: false, error: 'not_equipped', item };
    }

    player.equipment[slot] = null;
    return { ok: true, item, slot };
  }

  useItem(userId: string, itemId: string): UseItemResult {
    const item = findItemById(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };
    if (item.type !== 'consumable') return { ok: false, error: 'not_consumable', item };

    const player = this.getOrCreatePlayer(userId);
    const owned = player.inventory[item.id] ?? 0;
    if (owned <= 0) return { ok: false, error: 'not_in_inventory', item };

    if (item.effect.kind === 'energy') {
      if (player.energy >= player.maxEnergy) {
        return { ok: false, error: 'energy_full', item };
      }
      player.energy = Math.min(player.maxEnergy, player.energy + item.effect.amount);
    }

    const remainingQuantity = owned - 1;
    if (remainingQuantity > 0) {
      player.inventory[item.id] = remainingQuantity;
    } else {
      delete player.inventory[item.id];
    }

    return {
      ok: true,
      item,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      remainingQuantity,
    };
  }

  addXp(userId: string, amount: number): AddXpResult {
    const player = this.getOrCreatePlayer(userId);
    player.xp += amount;
    let levelsGained = 0;
    while (player.xp >= xpRequiredForLevel(player.level)) {
      player.xp -= xpRequiredForLevel(player.level);
      player.level += 1;
      levelsGained += 1;
    }
    return { levelsGained };
  }

  claimDaily(userId: string, now: number = Date.now()): ClaimDailyResult {
    const player = this.getOrCreatePlayer(userId);
    if (player.lastDaily !== null) {
      const elapsed = now - player.lastDaily;
      if (elapsed < DAILY_COOLDOWN_MS) {
        return { claimed: false, remainingMs: DAILY_COOLDOWN_MS - elapsed };
      }
    }
    player.lastDaily = now;
    player.walletCoins += DAILY_REWARD_COINS;
    return { claimed: true, reward: DAILY_REWARD_COINS, walletCoins: player.walletCoins };
  }

  rob(
    thiefUserId: string,
    victimUserId: string,
    options: RobOptions = {},
  ): RobResult {
    const now = options.now ?? Date.now();
    const rng = options.rng ?? Math.random;

    if (thiefUserId === victimUserId) return { outcome: 'self_target' };

    const victim = this.players.get(victimUserId);
    if (!victim) return { outcome: 'unknown_victim' };

    const thief = this.getOrCreatePlayer(thiefUserId);

    const activePenalty = thief.robberyCooldown;
    if (activePenalty && now < activePenalty.until) {
      return {
        outcome: 'cooldown',
        remainingMs: activePenalty.until - now,
        jailed: activePenalty.jailed,
      };
    }

    const percentage =
      Math.floor(rng() * (ROB_MAX_PERCENTAGE - ROB_MIN_PERCENTAGE + 1)) + ROB_MIN_PERCENTAGE;
    const loot = Math.floor((victim.walletCoins * percentage) / 100);
    if (loot <= 0 || victim.walletCoins <= 0) {
      return { outcome: 'broke_victim' };
    }

    if (rng() >= ROB_SUCCESS_CHANCE) {
      const penalty: RobberyPenalty = { until: now + ROB_PRISON_MS, jailed: true };
      thief.robberyCooldown = penalty;
      return { outcome: 'jailed', prisonMs: ROB_PRISON_MS };
    }

    victim.walletCoins -= loot;
    thief.walletCoins += loot;
    thief.robberyCooldown = { until: now + ROB_SUCCESS_COOLDOWN_MS, jailed: false };

    return {
      outcome: 'success',
      loot,
      percentage,
      thiefWalletCoins: thief.walletCoins,
      cooldownMs: ROB_SUCCESS_COOLDOWN_MS,
    };
  }

  startCombat(
    attackerUserId: string,
    defenderUserId: string,
    options: { now?: number; randomSource?: CombatRandomSource } = {},
  ): CombatResult {
    const now = options.now ?? Date.now();

    if (!attackerUserId || !defenderUserId) return { ok: false, reason: 'invalid_target' };
    if (attackerUserId === defenderUserId) return { ok: false, reason: 'self_target' };

    const attacker = this.players.get(attackerUserId);
    if (!attacker) return { ok: false, reason: 'attacker_not_found' };

    const defender = this.players.get(defenderUserId);
    if (!defender) return { ok: false, reason: 'target_not_found' };

    if (attacker.combatCooldownUntil !== null && now < attacker.combatCooldownUntil) {
      return {
        ok: false,
        reason: 'cooldown',
        remainingMs: attacker.combatCooldownUntil - now,
      };
    }

    const energy = this.consumeEnergy(attackerUserId, COMBAT_ENERGY_COST);
    if (!energy.ok) {
      return {
        ok: false,
        reason: 'insufficient_energy',
        energy: this.getOrCreatePlayer(attackerUserId).energy,
      };
    }

    const attackerStats = computeEffectiveStats(attacker);
    const defenderStats = computeEffectiveStats(defender);

    const randomSource =
      options.randomSource ??
      createDefaultCombatRandomSource(attackerStats.luck, defenderStats.luck);
    const attackerCritical = randomSource.rollAttackerCritical();
    const defenderCritical = randomSource.rollDefenderCritical();

    let attackerDamage = Math.max(1, attackerStats.attack - defenderStats.defense);
    let defenderDamage = Math.max(1, defenderStats.attack - attackerStats.defense);
    if (attackerCritical) attackerDamage *= 2;
    if (defenderCritical) defenderDamage *= 2;

    let outcome: 'win' | 'loss' | 'draw';
    if (attackerDamage > defenderDamage) outcome = 'win';
    else if (defenderDamage > attackerDamage) outcome = 'loss';
    else outcome = 'draw';

    let attackerXp: number;
    let attackerCoins: number;
    let defenderXp: number;
    let defenderCoins: number;
    if (outcome === 'win') {
      attackerXp = COMBAT_XP_WIN;
      attackerCoins = COMBAT_COINS_WIN;
      defenderXp = COMBAT_XP_LOSS;
      defenderCoins = COMBAT_COINS_LOSS;
      attacker.wins += 1;
      defender.losses += 1;
    } else if (outcome === 'loss') {
      attackerXp = COMBAT_XP_LOSS;
      attackerCoins = COMBAT_COINS_LOSS;
      defenderXp = COMBAT_XP_WIN;
      defenderCoins = COMBAT_COINS_WIN;
      attacker.losses += 1;
      defender.wins += 1;
    } else {
      attackerXp = COMBAT_XP_DRAW;
      attackerCoins = COMBAT_COINS_DRAW;
      defenderXp = COMBAT_XP_DRAW;
      defenderCoins = COMBAT_COINS_DRAW;
    }

    this.addCoins(attackerUserId, attackerCoins);
    const levelsGained = this.addXp(attackerUserId, attackerXp).levelsGained;
    this.addCoins(defenderUserId, defenderCoins);
    this.addXp(defenderUserId, defenderXp);

    const cooldownUntil = now + COMBAT_COOLDOWN_MS;
    attacker.combatCooldownUntil = cooldownUntil;

    return {
      ok: true,
      outcome,
      attackerDamage,
      defenderDamage,
      attackerCritical,
      defenderCritical,
      xp: attackerXp,
      coins: attackerCoins,
      attackerLevel: attacker.level,
      levelsGained,
      energy: attacker.energy,
      maxEnergy: attacker.maxEnergy,
      cooldownUntil,
    };
  }

  hunt(
    userId: string,
    options: { now?: number; randomSource?: HuntRandomSource } = {},
  ): HuntResult {
    const now = options.now ?? Date.now();
    const player = this.getOrCreatePlayer(userId);

    if (player.huntCooldownUntil !== null && now < player.huntCooldownUntil) {
      return {
        ok: false,
        reason: 'cooldown',
        remainingMs: player.huntCooldownUntil - now,
      };
    }

    const energy = this.consumeEnergy(userId, HUNT_ENERGY_COST);
    if (!energy.ok) {
      return {
        ok: false,
        reason: 'insufficient_energy',
        energy: player.energy,
      };
    }

    const monsters = getAllMonsters();
    const stats = computeEffectiveStats(player);
    const randomSource = options.randomSource ?? createDefaultHuntRandomSource(stats.luck);
    const monster = monsters[randomSource.pickMonsterIndex(monsters.length)];
    const critical = randomSource.rollPlayerCritical();

    let playerDamage = Math.max(1, stats.attack - monster.defense);
    const monsterDamage = Math.max(1, monster.attack - stats.defense);
    if (critical) playerDamage *= 2;

    const victory = playerDamage >= monsterDamage;

    let rewardCoins = 0;
    let rewardXp = 0;
    let loot: HuntLootEntry[] = [];
    if (victory) {
      rewardCoins = randomSource.rollRange(monster.rewardCoins.min, monster.rewardCoins.max);
      rewardXp = randomSource.rollRange(monster.rewardXp.min, monster.rewardXp.max);
      this.addCoins(userId, rewardCoins);
      this.addXp(userId, rewardXp);
      loot = this.grantHuntLoot(userId, monster, randomSource);
    }

    const cooldownUntil = now + HUNT_COOLDOWN_MS;
    player.huntCooldownUntil = cooldownUntil;

    return {
      ok: true,
      outcome: victory ? 'victory' : 'defeat',
      monsterId: monster.id,
      monsterName: monster.name,
      monsterEmoji: monster.emoji,
      playerDamage,
      monsterDamage,
      critical,
      rewardCoins,
      rewardXp,
      loot,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      cooldownUntil,
    };
  }

  private grantHuntLoot(
    userId: string,
    monster: RpgMonster,
    randomSource: HuntRandomSource,
  ): HuntLootEntry[] {
    const aggregated = new Map<string, number>();
    for (const entry of monster.loot) {
      const resolved = resolveLootEntry(monster.id, entry);
      if (!resolved) continue;
      if (!randomSource.rollLootDrop(resolved.dropChance)) continue;
      const quantity = randomSource.rollRange(resolved.minQuantity, resolved.maxQuantity);
      if (!isValidAmount(quantity)) continue;
      aggregated.set(resolved.itemId, (aggregated.get(resolved.itemId) ?? 0) + quantity);
    }

    const granted: HuntLootEntry[] = [];
    for (const [itemId, quantity] of aggregated) {
      const added = this.addItem(userId, itemId, quantity);
      if (added.ok) {
        granted.push({ itemId, quantity });
      }
    }
    return granted;
  }
}

function createDefaultCombatRandomSource(
  attackerLuck: number,
  defenderLuck: number,
): CombatRandomSource {
  return {
    rollAttackerCritical: () => Math.random() * 100 < attackerLuck,
    rollDefenderCritical: () => Math.random() * 100 < defenderLuck,
  };
}

function createDefaultHuntRandomSource(playerLuck: number): HuntRandomSource {
  return {
    pickMonsterIndex: (length) => Math.floor(Math.random() * length),
    rollPlayerCritical: () => Math.random() * 100 < playerLuck,
    rollRange: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    rollLootDrop: (dropChance) => Math.random() * 100 < dropChance,
  };
}

interface ResolvedLootEntry {
  itemId: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
}

function resolveLootEntry(monsterId: string, entry: MonsterLootEntry): ResolvedLootEntry | null {
  const item = findItemById(entry.itemId);
  if (!item) {
    console.warn(`[rpg] Loot ignorato (${monsterId}): itemId sconosciuto "${entry.itemId}"`);
    return null;
  }
  if (!Number.isFinite(entry.dropChance) || entry.dropChance < 0 || entry.dropChance > 100) {
    console.warn(
      `[rpg] Loot ignorato (${monsterId}): dropChance non valida ${entry.dropChance} per "${entry.itemId}"`,
    );
    return null;
  }
  const minQuantity = entry.minQuantity ?? 1;
  const maxQuantity = entry.maxQuantity ?? minQuantity;
  if (
    !isValidAmount(minQuantity) ||
    minQuantity < 1 ||
    !isValidAmount(maxQuantity) ||
    maxQuantity < minQuantity
  ) {
    console.warn(
      `[rpg] Loot ignorato (${monsterId}): quantità non valide [${minQuantity}, ${maxQuantity}] per "${entry.itemId}"`,
    );
    return null;
  }
  return { itemId: item.id, dropChance: entry.dropChance, minQuantity, maxQuantity };
}
