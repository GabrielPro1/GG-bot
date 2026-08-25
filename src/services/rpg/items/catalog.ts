import type { RpgItem } from './types.js';

export const RPG_ITEMS: readonly RpgItem[] = [
  {
    id: 'pozione',
    name: 'Pozione',
    emoji: '🧪',
    price: 50,
    description: 'Recupera energia',
    effectDescription: 'Recupera energia',
    effectEmoji: '❤️',
    type: 'consumable',
    effect: { kind: 'energy', amount: 25 },
  },
  {
    id: 'portafortuna',
    name: 'Portafortuna',
    emoji: '🍀',
    price: 250,
    description: '+10% fortuna',
    effectDescription: '+10% fortuna',
    effectEmoji: '✨',
    type: 'accessory',
    effect: { kind: 'luck', amount: 10 },
  },
  {
    id: 'spada',
    name: 'Spada',
    emoji: '⚔️',
    price: 500,
    description: '+10 attacco',
    effectDescription: '+10 attacco',
    effectEmoji: '⚔️',
    type: 'weapon',
    effect: { kind: 'attack', amount: 10 },
  },
  {
    id: 'scudo',
    name: 'Scudo',
    emoji: '🛡️',
    price: 500,
    description: '+10 difesa',
    effectDescription: '+10 difesa',
    effectEmoji: '🛡️',
    type: 'armor',
    effect: { kind: 'defense', amount: 10 },
  },
];

const itemsByLowercasedId = new Map<string, RpgItem>(
  RPG_ITEMS.map((item) => [item.id.toLowerCase(), item]),
);

export function findItemById(input: string): RpgItem | null {
  return itemsByLowercasedId.get(input.trim().toLowerCase()) ?? null;
}

export function getAllItems(): readonly RpgItem[] {
  return RPG_ITEMS;
}
