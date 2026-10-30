import { totalXpForLevel, xpRequiredForLevel } from '../../lib/rpg/rpg.service.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BAR_WIDTH = 10;

function renderBar(current, max) {
    const ratio = Math.min(1, Math.max(0, current / Math.max(max, 1)));
    const filled = Math.min(BAR_WIDTH, Math.floor(ratio * BAR_WIDTH));
    return `${'█'.repeat(filled)}${'▱'.repeat(BAR_WIDTH - filled)} ${Math.floor(ratio * 100)}%`;
}

export default {
    name: 'xp',
    category: 'rpg',
    emoji: '🏅',
    description: 'Mostra livello, XP e posizione globale',
    execute: async ({ identity, rpg, reply }) => {
        const player = rpg.getOrCreatePlayer(identity.userId);
        const xpNeeded = xpRequiredForLevel(player.level);
        const missingXp = Math.max(0, xpNeeded - player.xp);
        const totalXp = totalXpForLevel(player.level) + player.xp;
        const rank = rpg.getPlayerRank(identity.userId);
        await reply([
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃       🏅 XP GLOBAL       ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            `⭐ Livello: ${player.level}`,
            `✨ XP: ${player.xp} / ${xpNeeded}`,
            renderBar(player.xp, xpNeeded),
            `🌟 XP totali: ${totalXp}`,
            `🏅 Posizione: ${rank ? `#${rank.position} su ${rank.total}` : 'non disponibile'}`,
            '',
            `🎯 Mancano ${missingXp} XP per il livello ${player.level + 1}`,
            '',
            '💬 Guadagni XP scrivendo in chat',
            '🎮 Le azioni RPG danno XP aggiuntivo',
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
