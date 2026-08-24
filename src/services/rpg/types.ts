export interface RpgPlayer {
  userId: string;
  level: number;
  xp: number;
  coins: number;
  wins: number;
  losses: number;
}

export interface RpgServiceView {
  getOrCreatePlayer(userId: string): RpgPlayer;
}
