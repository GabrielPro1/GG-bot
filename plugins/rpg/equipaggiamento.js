import { findItemById } from '../../lib/rpg/items/catalog.js';
import { getRarityInfo } from '../../lib/rpg/items/rarity.js';
const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const SLOT_LABELS = {
    weapon: '⚔️ Arma',
    armor: '🛡️ Armatura',
    accessory: '🍀 Accessorio',
};
const EMPTY_SLOT_LABELS = {
    weapon: 'Nessuna',
    armor: 'Nessuna',
    accessory: 'Nessuno',
};
const SLOT_BONUS_EMOJI = {
    weapon: '⚔️',
    armor: '🛡️',
    accessory: '🍀',
};
export default {
    name: 'equipaggiamento',
    category: 'rpg',
    emoji: '🎒',
    description: "Visualizza l'equipaggiamento",
    execute: async ({ identity, rpg, reply }) => {
        const equipment = rpg.getEquipment(identity.userId);
        const slotLines = [];
        const bonusLines = [];
        for (const slot of ['weapon', 'armor', 'accessory']) {
            const equippedId = equipment[slot];
            if (!equippedId) {
                slotLines.push(SLOT_LABELS[slot]);
                slotLines.push(`   ${EMPTY_SLOT_LABELS[slot]}`);
                continue;
            }
            const item = findItemById(equippedId);
            slotLines.push(SLOT_LABELS[slot]);
            if (item) {
                const rarity = getRarityInfo(item.rarity);
                slotLines.push(`   ${rarity.emoji} ${rarity.name}`);
                slotLines.push(`   ${item.emoji} ${item.name}`);
            }
            else {
                slotLines.push(`   ${equippedId}`);
            }
            if (item?.effectDescription) {
                bonusLines.push(`${item.effectEmoji ?? SLOT_BONUS_EMOJI[slot]} ${item.effectDescription}`);
            }
        }
        if (bonusLines.length === 0) {
            bonusLines.push('Nessun bonus attivo');
        }
        await reply([
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃  🎒 EQUIPAGGIAMENTO  ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            ...slotLines,
            '',
            '📊 BONUS ATTIVI',
            ...bonusLines,
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
