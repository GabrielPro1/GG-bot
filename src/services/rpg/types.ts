export interface RpgPlayer {
  userId: string;
  level: number;
  xp: number;
  coins: number;
  wins: number;
  losses: number;
  lastDaily: number | null;
}

export type ClaimDailyResult =
  | { claimed: true; reward: number; coins: number }
  | { claimed: false; remainingMs: number };

export interface RpgServiceView {
  getOrCreatePlayer(userId: string): RpgPlayer;
  claimDaily(userId: string, now?: number): ClaimDailyResult;
}
