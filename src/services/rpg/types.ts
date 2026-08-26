import type { RpgItem } from './items/types.js';

export interface RobberyPenalty {
  until: number;
  jailed: boolean;
}

export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export interface EquipmentSlots {
  weapon: string | null;
  armor: string | null;
  accessory: string | null;
}

export interface RpgPlayer {
  userId: string;
  level: number;
  xp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  luck: number;
  walletCoins: number;
  bankCoins: number;
  wins: number;
  losses: number;
  lastDaily: number | null;
  robberyCooldown: RobberyPenalty | null;
  combatCooldownUntil: number | null;
  huntCooldownUntil: number | null;
  inventory: Record<string, number>;
  equipment: EquipmentSlots;
  missions: Record<string, DailyMissionState>;
}

export interface DailyMissionState {
  dayKey: string;
  progress: number;
  claimed: boolean;
}

export interface DailyMissionView {
  missionId: string;
  emoji: string;
  name: string;
  description: string;
  goalType: string;
  target: number;
  progress: number;
  ready: boolean;
  claimed: boolean;
  rewardXp: number;
  rewardCoins: number;
}

export type ClaimMissionErrorReason =
  | 'unknown_mission'
  | 'not_active_today'
  | 'incomplete'
  | 'already_claimed';

export type ClaimMissionResult =
  | {
      ok: true;
      missionId: string;
      rewardXp: number;
      rewardCoins: number;
      walletCoins: number;
    }
  | {
      ok: false;
      reason: ClaimMissionErrorReason;
    };

export interface CombatRandomSource {
  rollAttackerCritical(): boolean;
  rollDefenderCritical(): boolean;
}

export type CombatOutcome = 'win' | 'loss' | 'draw';

export type CombatErrorReason =
  | 'invalid_target'
  | 'attacker_not_found'
  | 'target_not_found'
  | 'self_target'
  | 'cooldown'
  | 'insufficient_energy';

export type CombatResult =
  | {
      ok: true;
      outcome: CombatOutcome;
      attackerDamage: number;
      defenderDamage: number;
      attackerCritical: boolean;
      defenderCritical: boolean;
      xp: number;
      coins: number;
      attackerLevel: number;
      levelsGained: number;
      energy: number;
      maxEnergy: number;
      cooldownUntil: number;
    }
  | {
      ok: false;
      reason: CombatErrorReason;
      remainingMs?: number;
      energy?: number;
    };

export interface PlayerStats {
  readonly energy: number;
  readonly maxEnergy: number;
  readonly attack: number;
  readonly defense: number;
  readonly luck: number;
}

export type EnergyError = 'invalid_amount' | 'insufficient_energy';

export type EnergyResult =
  | { ok: true; energy: number; maxEnergy: number }
  | { ok: false; error: EnergyError };

export type EquipResult =
  | { ok: true; item: RpgItem; slot: EquipSlot }
  | { ok: false; error: 'unknown_item' }
  | { ok: false; error: 'not_in_inventory'; item: RpgItem }
  | { ok: false; error: 'not_equippable'; item: RpgItem }
  | { ok: false; error: 'already_equipped'; item: RpgItem; slot: EquipSlot };

export type UnequipResult =
  | { ok: true; item: RpgItem; slot: EquipSlot }
  | { ok: false; error: 'unknown_item' }
  | { ok: false; error: 'not_equippable'; item: RpgItem }
  | { ok: false; error: 'not_equipped'; item: RpgItem };

export type UseItemResult =
  | {
      ok: true;
      item: RpgItem;
      energy: number;
      maxEnergy: number;
      remainingQuantity: number;
    }
  | { ok: false; error: 'unknown_item' }
  | { ok: false; error: 'not_consumable'; item: RpgItem }
  | { ok: false; error: 'not_in_inventory'; item: RpgItem }
  | { ok: false; error: 'energy_full'; item: RpgItem };

export type ClaimDailyResult =
  | { claimed: true; reward: number; walletCoins: number }
  | { claimed: false; remainingMs: number };

export type TransferError =
  | 'invalid_amount'
  | 'insufficient_wallet'
  | 'insufficient_bank';

export type TransferResult =
  | { ok: true; walletCoins: number; bankCoins: number }
  | { ok: false; error: TransferError };

export type SpendError = 'invalid_amount' | 'insufficient_wallet';

export type SpendResult =
  | { ok: true; walletCoins: number; bankCoins: number }
  | { ok: false; error: SpendError };

export type PurchaseResult =
  | {
      ok: true;
      item: RpgItem;
      quantityOwned: number;
      walletCoins: number;
    }
  | { ok: false; error: 'unknown_item' }
  | {
      ok: false;
      error: 'insufficient_wallet';
      item: RpgItem;
      walletCoins: number;
      bankCoins: number;
    }
  | { ok: false; error: 'invalid_amount'; item: RpgItem };

export type RobOptions = {
  now?: number;
  rng?: () => number;
};

export type RobResult =
  | {
      outcome: 'success';
      loot: number;
      percentage: number;
      thiefWalletCoins: number;
      cooldownMs: number;
    }
  | { outcome: 'jailed'; prisonMs: number }
  | { outcome: 'cooldown'; remainingMs: number; jailed: boolean }
  | { outcome: 'self_target' }
  | { outcome: 'unknown_victim' }
  | { outcome: 'broke_victim' };

export type NameResolver = (userId: string) => string | null;

export interface LeaderboardEntry {
  readonly userId: string;
  readonly level: number;
  readonly xp: number;
  readonly wins: number;
  readonly walletCoins: number;
  readonly bankCoins: number;
}

export interface RpgServiceView {
  getOrCreatePlayer(userId: string): RpgPlayer;
  claimDaily(userId: string, now?: number): ClaimDailyResult;
  getWalletBalance(userId: string): number;
  getBankBalance(userId: string): number;
  deposit(userId: string, amount: number): TransferResult;
  withdraw(userId: string, amount: number): TransferResult;
  spendWallet(userId: string, amount: number): SpendResult;
  getInventory(userId: string): Readonly<Record<string, number>>;
  addItem(userId: string, itemId: string, quantity: number): AddItemResult;
  purchaseItem(userId: string, itemId: string): PurchaseResult;
  getStats(userId: string): PlayerStats;
  consumeEnergy(userId: string, amount: number): EnergyResult;
  restoreEnergy(userId: string, amount: number): EnergyResult;
  getEquipment(userId: string): Readonly<EquipmentSlots>;
  equipItem(userId: string, itemId: string): EquipResult;
  unequipItem(userId: string, itemId: string): UnequipResult;
  useItem(userId: string, itemId: string): UseItemResult;

  startCombat(
    attackerUserId: string,
    defenderUserId: string,
    options?: { now?: number; randomSource?: CombatRandomSource },
  ): CombatResult;
  hunt(
    userId: string,
    options?: { now?: number; randomSource?: HuntRandomSource },
  ): HuntResult;
  getDailyMissions(userId: string, now?: number): DailyMissionView[];
  claimMission(userId: string, missionId: string, now?: number): ClaimMissionResult;
  rob(thiefUserId: string, victimUserId: string, options?: RobOptions): RobResult;

  setNameResolver(resolver: NameResolver): void;
  getPlayerName(userId: string): string;
  getLeaderboardByLevel(limit?: number): readonly LeaderboardEntry[];
  getLeaderboardByWins(limit?: number): readonly LeaderboardEntry[];
  getLeaderboardByWealth(limit?: number): readonly LeaderboardEntry[];
}

export interface HuntRandomSource {
  pickMonsterIndex(length: number): number;
  rollPlayerCritical(): boolean;
  rollRange(min: number, max: number): number;
  rollLootDrop(dropChance: number): boolean;
}

export interface HuntLootEntry {
  itemId: string;
  quantity: number;
}

export type AddItemResult =
  | { ok: true; itemId: string; quantityAdded: number; totalOwned: number }
  | { ok: false; error: 'unknown_item' | 'invalid_quantity' };

export type HuntErrorReason = 'cooldown' | 'insufficient_energy';

export type HuntResult =
  | {
      ok: true;
      outcome: 'victory' | 'defeat';
      monsterId: string;
      monsterName: string;
      monsterEmoji: string;
      playerDamage: number;
      monsterDamage: number;
      critical: boolean;
      rewardCoins: number;
      rewardXp: number;
      loot: HuntLootEntry[];
      energy: number;
      maxEnergy: number;
      cooldownUntil: number;
    }
  | {
      ok: false;
      reason: HuntErrorReason;
      remainingMs?: number;
      energy?: number;
    };
