export const RPG_ITEMS = [
    {
        id: 'pozione',
        name: 'Pozione',
        emoji: '🧪',
        price: 50,
        description: 'Recupera energia',
        rarity: 'common',
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
        rarity: 'epic',
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
        rarity: 'rare',
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
        rarity: 'uncommon',
        effectDescription: '+10 difesa',
        effectEmoji: '🛡️',
        type: 'armor',
        effect: { kind: 'defense', amount: 10 },
    },
];
const itemsByLowercasedId = new Map(RPG_ITEMS.map((item) => [item.id.toLowerCase(), item]));
export function findItemById(input) {
    return itemsByLowercasedId.get(input.trim().toLowerCase()) ?? null;
}
export function getAllItems() {
    return RPG_ITEMS;
}
