import { xpRequiredForLevel } from '../../lib/rpg/rpg.service.js';
const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BAR_WIDTH = 10;
function renderBar(current, max) {
    const filled = Math.min(BAR_WIDTH, Math.floor((current / Math.max(max, 1)) * BAR_WIDTH));
    return `${'█'.repeat(filled)}${'▱'.repeat(BAR_WIDTH - filled)}`;
}
export default {
    name: 'profilo',
    category: 'rpg',
    emoji: '👤',
    description: 'Mostra il tuo profilo RPG',
    execute: async ({ identity, rpg, reply }) => {
        const player = rpg.getOrCreatePlayer(identity.userId);
        const stats = rpg.getStats(identity.userId);
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
            renderBar(player.xp, xpNeeded),
            '',
            `❤️ Energia: ${stats.energy} / ${stats.maxEnergy}`,
            renderBar(stats.energy, stats.maxEnergy),
            '',
            `⚔️ Attacco: ${stats.attack}`,
            `🛡️ Difesa: ${stats.defense}`,
            `🍀 Fortuna: ${stats.luck}%`,
            '',
            '💰 Monete:',
            `👛 Wallet: 🪙 ${player.walletCoins}`,
            `🏦 Banca: 🪙 ${player.bankCoins}`,
            '',
            `⚔️ Vittorie: ${player.wins}`,
            `💀 Sconfitte: ${player.losses}`,
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
