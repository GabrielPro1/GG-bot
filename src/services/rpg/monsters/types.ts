export interface MonsterLootEntry {
  itemId: string;
  dropChance: number;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface RpgMonster {
  id: string;
  emoji: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  rewardCoins: { min: number; max: number };
  rewardXp: { min: number; max: number };
  loot: MonsterLootEntry[];
}
