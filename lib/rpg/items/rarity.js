const RPG_ITEM_RARITIES = {
    common: { rarity: 'common', name: 'Comune', emoji: '⚪' },
    uncommon: { rarity: 'uncommon', name: 'Non comune', emoji: '🟢' },
    rare: { rarity: 'rare', name: 'Raro', emoji: '🔵' },
    epic: { rarity: 'epic', name: 'Epico', emoji: '🟣' },
    legendary: { rarity: 'legendary', name: 'Leggendario', emoji: '🟠' },
};
export function getRarityInfo(rarity) {
    return RPG_ITEM_RARITIES[rarity];
}
export function isRpgItemRarity(value) {
    return typeof value === 'string' && value in RPG_ITEM_RARITIES;
}
