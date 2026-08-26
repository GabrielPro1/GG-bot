export type RpgItemType = 'weapon' | 'armor' | 'accessory' | 'consumable';

export type RpgItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type RpgItemEffect =
  | { kind: 'attack'; amount: number }
  | { kind: 'defense'; amount: number }
  | { kind: 'luck'; amount: number }
  | { kind: 'energy'; amount: number };

export interface RpgItem {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly price: number;
  readonly description: string;
  readonly rarity: RpgItemRarity;
  readonly effectDescription?: string;
  readonly effectEmoji?: string;
  readonly type: RpgItemType;
  readonly effect: RpgItemEffect;
}

export function isEquippable(item: RpgItem): boolean {
  return item.type !== 'consumable';
}
