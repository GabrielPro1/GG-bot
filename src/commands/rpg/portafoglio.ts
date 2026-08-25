import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

export default {
  name: 'portafoglio',
  category: 'rpg',
  emoji: '💰',
  description: 'Mostra contanti e banca',
  execute: async ({ identity, rpg, reply }) => {
    const wallet = rpg.getWalletBalance(identity.userId);
    const bank = rpg.getBankBalance(identity.userId);

    await reply([
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃   💰 PORTAFOGLIO   ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `👛 Contanti: 🪙 ${wallet}`,
      `🏦 Banca: 🪙 ${bank}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `💎 Totale: 🪙 ${wallet + bank}`,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
