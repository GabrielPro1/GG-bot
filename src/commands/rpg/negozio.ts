import { getAllItems } from '../../services/rpg/items/catalog.js';
import { getRarityInfo } from '../../services/rpg/items/rarity.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

export default {
  name: 'negozio',
  category: 'rpg',
  emoji: '🛒',
  description: 'Visualizza il negozio RPG',
  execute: async ({ reply }) => {
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
  },
} satisfies Command;
