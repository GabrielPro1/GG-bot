import type { ClaimDailyResult, RpgPlayer, RpgServiceView } from './types.js';

export const INITIAL_COINS = 100;
export const XP_PER_LEVEL = 100;
export const DAILY_REWARD_COINS = 100;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function xpRequiredForLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

function createInitialPlayer(userId: string): RpgPlayer {
  return {
    userId,
    level: 1,
    xp: 0,
    coins: INITIAL_COINS,
    wins: 0,
    losses: 0,
    lastDaily: null,
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

  addCoins(userId: string, amount: number): void {
    this.getOrCreatePlayer(userId).coins += amount;
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
    player.coins += DAILY_REWARD_COINS;
    return { claimed: true, reward: DAILY_REWARD_COINS, coins: player.coins };
  }
}
