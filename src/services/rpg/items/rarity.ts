import type { RpgItemRarity } from './types.js';

export interface RpgItemRarityInfo {
  readonly rarity: RpgItemRarity;
  readonly name: string;
  readonly emoji: string;
}

const RPG_ITEM_RARITIES: Readonly<Record<RpgItemRarity, RpgItemRarityInfo>> = {
  common: { rarity: 'common', name: 'Comune', emoji: '⚪' },
  uncommon: { rarity: 'uncommon', name: 'Non comune', emoji: '🟢' },
  rare: { rarity: 'rare', name: 'Raro', emoji: '🔵' },
  epic: { rarity: 'epic', name: 'Epico', emoji: '🟣' },
  legendary: { rarity: 'legendary', name: 'Leggendario', emoji: '🟠' },
};

export function getRarityInfo(rarity: RpgItemRarity): RpgItemRarityInfo {
  return RPG_ITEM_RARITIES[rarity];
}

export function isRpgItemRarity(value: unknown): value is RpgItemRarity {
  return typeof value === 'string' && value in RPG_ITEM_RARITIES;
}
