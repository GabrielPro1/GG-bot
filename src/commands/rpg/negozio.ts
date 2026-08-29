import { getAllItems } from '../../services/rpg/items/catalog.js';
import { getRarityInfo } from '../../services/rpg/items/rarity.js';
import type { RpgItem } from '../../services/rpg/items/types.js';
import type { Command, ListRow, ListSection } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

/** Items that can be bought. A missing/zero price means "not purchasable". */
function isPurchasable(item: RpgItem): boolean {
  return item.price > 0;
}

/**
 * Builds an interactive row for a purchasable item. Tapping the row triggers
 * the real `/acquista <itemId>` command through the existing dispatcher flow,
 * so no purchase logic is duplicated here.
 */
function itemToBuyRow(item: RpgItem): ListRow {
  return {
    title: `${item.emoji} Compra ${item.name}`,
    description: `🪙 ${item.price} monete`,
    rowId: `/acquista ${item.id}`,
  };
}

function shopSection(): ListSection {
  const rows = getAllItems().filter(isPurchasable).map(itemToBuyRow);
  return { title: '🛒 NEGOZIO RPG', rows };
}

export default {
  name: 'negozio',
  category: 'rpg',
  emoji: '🛒',
  description: 'Visualizza il negozio RPG',
  execute: async ({ reply, sendList }) => {
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

    await sendList({
      text: 'Tocca un oggetto per comprarlo.',
      title: '🛒 NEGOZIO RPG',
      footer: 'Usa /negozio per aggiornare',
      buttonText: '🛒 Compra',
      sections: [shopSection()],
    });
  },
} satisfies Command;
