import type { RpgMonster } from './types.js';

export const RPG_MONSTERS: readonly RpgMonster[] = [
  {
    id: 'ratto',
    emoji: '🐀',
    name: 'Ratto Selvaggio',
    hp: 8,
    attack: 7,
    defense: 2,
    rewardCoins: { min: 10, max: 20 },
    rewardXp: { min: 10, max: 20 },
    loot: [{ itemId: 'pozione', dropChance: 20, minQuantity: 1, maxQuantity: 1 }],
  },
  {
    id: 'lupo',
    emoji: '🐺',
    name: 'Lupo',
    hp: 15,
    attack: 12,
    defense: 5,
    rewardCoins: { min: 20, max: 35 },
    rewardXp: { min: 20, max: 35 },
    loot: [{ itemId: 'pozione', dropChance: 25, minQuantity: 1, maxQuantity: 1 }],
  },
  {
    id: 'goblin',
    emoji: '👹',
    name: 'Goblin',
    hp: 22,
    attack: 16,
    defense: 8,
    rewardCoins: { min: 30, max: 50 },
    rewardXp: { min: 30, max: 50 },
    loot: [{ itemId: 'pozione', dropChance: 30, minQuantity: 1, maxQuantity: 2 }],
  },
  {
    id: 'orco',
    emoji: '🧟',
    name: 'Orco',
    hp: 35,
    attack: 22,
    defense: 12,
    rewardCoins: { min: 50, max: 80 },
    rewardXp: { min: 50, max: 80 },
    loot: [{ itemId: 'pozione', dropChance: 40, minQuantity: 1, maxQuantity: 2 }],
  },
];

export function getAllMonsters(): readonly RpgMonster[] {
  return RPG_MONSTERS;
}

export function findMonsterById(id: string): RpgMonster | undefined {
  return RPG_MONSTERS.find((monster) => monster.id === id.toLowerCase());
}
