export type MissionGoalType = 'combat' | 'hunt' | 'robbery' | 'daily';

export interface RpgMission {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly emoji: string;
  readonly goalType: MissionGoalType;
  readonly target: number;
  readonly rewardXp: number;
  readonly rewardCoins: number;
}
