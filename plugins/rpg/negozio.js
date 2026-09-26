import { getAllItems } from '../../lib/rpg/items/catalog.js';
import { getRarityInfo } from '../../lib/rpg/items/rarity.js';
const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
/** Items that can be bought. A missing/zero price means "not purchasable". */
function isPurchasable(item) {
    return item.price > 0;
}
/**
 * Builds a quick-reply button for a purchasable item. Its id triggers the real
 * `/acquista <itemId>` command through the existing dispatcher flow, so no
 * purchase logic is duplicated here and no user identifier is embedded.
 */
function itemToBuyButton(item) {
    return {
        displayText: `${item.emoji} Compra ${item.name}`,
        id: `/acquista ${item.id}`,
    };
}
export default {
    name: 'negozio',
    category: 'rpg',
    emoji: '🛒',
    description: 'Visualizza il negozio RPG',
    execute: async ({ reply, sendButtons }) => {
        const itemBlocks = getAllItems().map((item) => {
            const rarity = getRarityInfo(item.rarity);
            return [
                `${rarity.emoji} ${rarity.name}`,
                `${item.emoji} ${item.name.toUpperCase()}`,
                `   ${item.effectEmoji ?? '•'} ${item.effectDescription ?? item.description}`,
                `   🪙 ${item.price}`,
            ].join('\n');
        });
        await reply([
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃    🛒 NEGOZIO RPG    ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            ...itemBlocks.flatMap((block, index) => (index === 0 ? [block] : ['', block])),
            '',
            '💡 Acquista con:',
            '   /acquista <oggetto>',
            '',
            SIGNATURE,
        ].join('\n'));
        const buyButtons = getAllItems().filter(isPurchasable).map(itemToBuyButton);
        await sendButtons?.({
            text: '🛒 Tocca un bottone per comprare un oggetto.',
            title: '🛒 NEGOZIO RPG',
            footer: 'Usa /negozio per aggiornare',
            buttons: buyButtons,
        });
    },
};
