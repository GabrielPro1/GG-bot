import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

export default {
  name: 'portafoglio',
  category: 'rpg',
  emoji: '💰',
  description: 'Controlla le tue monete',
  execute: async ({ identity, rpg, reply }) => {
    const player = rpg.getOrCreatePlayer(identity.userId);

    await reply([
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃   💰 PORTAFOGLIO   ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      '💰 Monete disponibili',
      '',
      `      🪙 ${player.coins}`,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
