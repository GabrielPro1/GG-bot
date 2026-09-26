const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
function formatRemainingTime(ms) {
    if (ms < 60_000)
        return 'meno di 1m';
    const totalMinutes = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
export default {
    name: 'giornaliero',
    category: 'rpg',
    emoji: '🎁',
    description: 'Ritira la tua ricompensa giornaliera',
    execute: async ({ identity, rpg, reply }) => {
        const result = rpg.claimDaily(identity.userId);
        if (!result.claimed) {
            await reply([
                '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                '┃    ⏰ GIORNALIERO    ┃',
                '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                '',
                '😴 Hai già riscosso la ricompensa',
                '   di oggi!',
                '',
                '⏳ Potrai ritirarla di nuovo tra:',
                `   ${formatRemainingTime(result.remainingMs)}`,
                '',
                SIGNATURE,
            ].join('\n'));
            return;
        }
        await reply([
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃     🎁 RICOMPENSA     ┃',
            '┃       GIORNALIERA       ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            '🎉 Ricompensa riscattata!',
            '',
            `🪙 +${result.reward} monete`,
            `💰 Portafoglio: 🪙 ${result.walletCoins}`,
            '',
            '⏰ Torna domani per ritirarla',
            '   di nuovo!',
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
