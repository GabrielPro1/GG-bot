import type { MissionGoalType, RpgMission } from './types.js';

export const RPG_MISSIONS: readonly RpgMission[] = [
  {
    id: 'combatti-3',
    name: 'Spada al vento',
    description: 'Combatti 3 duelli PvP',
    emoji: '⚔️',
    goalType: 'combat',
    target: 3,
    rewardXp: 30,
    rewardCoins: 40,
  },
  {
    id: 'caccia-3',
    name: 'Cacciatore alle prime armi',
    description: 'Caccia 3 mostri',
    emoji: '🏹',
    goalType: 'hunt',
    target: 3,
    rewardXp: 30,
    rewardCoins: 40,
  },
  {
    id: 'rapina-1',
    name: 'Mani leggere',
    description: 'Effettua 1 rapina riuscita',
    emoji: '🥷',
    goalType: 'robbery',
    target: 1,
    rewardXp: 25,
    rewardCoins: 50,
  },
  {
    id: 'giornaliero-1',
    name: 'Buon giorno!',
    description: 'Riscuoti la ricompensa giornaliera',
    emoji: '🎁',
    goalType: 'daily',
    target: 1,
    rewardXp: 20,
    rewardCoins: 30,
  },
  {
    id: 'combatti-5',
    name: 'Guerriero instancabile',
    description: 'Combatti 5 duelli PvP',
    emoji: '⚔️',
    goalType: 'combat',
    target: 5,
    rewardXp: 60,
    rewardCoins: 80,
  },
  {
    id: 'caccia-5',
    name: 'Terrore della foresta',
    description: 'Caccia 5 mostri',
    emoji: '🏹',
    goalType: 'hunt',
    target: 5,
    rewardXp: 60,
    rewardCoins: 80,
  },
];

export const MISSIONS_PER_DAY = 3;

export function findMissionById(id: string): RpgMission | undefined {
  return RPG_MISSIONS.find((mission) => mission.id === id.toLowerCase());
}

export function isValidGoalType(value: unknown): value is MissionGoalType {
  return (
    value === 'combat' || value === 'hunt' || value === 'robbery' || value === 'daily'
  );
}
