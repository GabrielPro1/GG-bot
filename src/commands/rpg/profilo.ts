import { xpRequiredForLevel } from '../../services/rpg/rpg.service.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const XP_BAR_WIDTH = 10;

function renderXpBar(xp: number, needed: number): string {
  const filled = Math.min(
    XP_BAR_WIDTH,
    Math.floor((xp / Math.max(needed, 1)) * XP_BAR_WIDTH),
  );
  return `${'▰'.repeat(filled)}${'▱'.repeat(XP_BAR_WIDTH - filled)}`;
}

export default {
  name: 'profilo',
  category: 'rpg',
  emoji: '👤',
  description: 'Mostra il tuo profilo RPG',
  execute: async ({ identity, rpg, reply }) => {
    const player = rpg.getOrCreatePlayer(identity.userId);
    const xpNeeded = xpRequiredForLevel(player.level);

    await reply([
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃    👤 PROFILO RPG    ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      '👤 Giocatore',
      '',
      `⭐ Livello: ${player.level}`,
      `✨ Esperienza: ${player.xp} / ${xpNeeded}`,
      renderXpBar(player.xp, xpNeeded),
      '',
      `💰 Monete: 🪙 ${player.coins}`,
      '',
      `⚔️ Vittorie: ${player.wins}`,
      `💀 Sconfitte: ${player.losses}`,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
