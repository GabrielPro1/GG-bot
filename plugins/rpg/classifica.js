const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const MEDALS = ['🥇', '🥈', '🥉'];
const VALID_CATEGORIES = new Set(['livello', 'vittorie', 'ricchezza']);
function formatLevel(entry) {
    return `Livello ${entry.level}`;
}
function formatWins(entry) {
    return `${entry.wins} vittorie`;
}
function formatWealth(entry) {
    return `🪙 ${entry.walletCoins + entry.bankCoins}`;
}
function renderRanking(entries, nameResolver, formatter) {
    if (entries.length === 0)
        return '  Nessun giocatore nella classifica.';
    return entries
        .map((entry, i) => {
        const medal = MEDALS[i] ?? `#${i + 1}`;
        const name = nameResolver(entry.userId);
        return `${medal} @${name} — ${formatter(entry)}`;
    })
        .join('\n');
}
function renderCategory(title, entries, nameResolver, formatter) {
    return [title, '', renderRanking(entries, nameResolver, formatter)].join('\n');
}
export default {
    name: 'classifica',
    category: 'rpg',
    emoji: '🏆',
    description: 'Mostra le classifiche dei giocatori',
    execute: async ({ args, rpg, reply }) => {
        const rawArg = args[0]?.toLowerCase();
        const category = rawArg && VALID_CATEGORIES.has(rawArg) ? rawArg : null;
        const nameResolver = (userId) => rpg.getPlayerName(userId);
        const lines = [
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃      🏆 CLASSIFICHE      ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        ];
        const showAll = category === null;
        const showLevel = showAll || category === 'livello';
        const showWins = showAll || category === 'vittorie';
        const showWealth = showAll || category === 'ricchezza';
        if (showLevel) {
            const entries = rpg.getLeaderboardByLevel();
            lines.push('');
            lines.push(renderCategory('⭐ LIVELLO', entries, nameResolver, formatLevel));
        }
        if (showWins) {
            const entries = rpg.getLeaderboardByWins();
            lines.push('');
            lines.push(renderCategory('⚔️ VITTORIE', entries, nameResolver, formatWins));
        }
        if (showWealth) {
            const entries = rpg.getLeaderboardByWealth();
            lines.push('');
            lines.push(renderCategory('🪙 RICCHEZZA', entries, nameResolver, formatWealth));
        }
        lines.push('');
        lines.push(SIGNATURE);
        await reply(lines.join('\n'));
    },
};
