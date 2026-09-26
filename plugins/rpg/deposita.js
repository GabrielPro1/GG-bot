const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
function usage() {
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃      🏦 DEPOSITA      ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        '⚠️ Quantità mancante.',
        '',
        'Uso: /deposita <quantità>',
        'Esempio: /deposita 500',
        '',
        SIGNATURE,
    ].join('\n');
}
const INVALID_AMOUNT_MESSAGES = {
    invalid_amount: '⚠️ Quantità non valida: usa un numero intero maggiore di 0.',
    insufficient_wallet: '😢 Non hai abbastanza monete nel portafoglio.',
    insufficient_bank: '😢 Impossibile: saldo bancario insufficente.',
};
export default {
    name: 'deposita',
    category: 'rpg',
    emoji: '🏦',
    description: 'Deposita monete in banca',
    execute: async ({ args, identity, rpg, reply }) => {
        const raw = args[0];
        if (!raw) {
            await reply(usage());
            return;
        }
        const result = rpg.deposit(identity.userId, Number(raw));
        if (!result.ok) {
            await reply([
                '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                '┃      🏦 DEPOSITA      ┃',
                '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                '',
                INVALID_AMOUNT_MESSAGES[result.error],
                '',
                SIGNATURE,
            ].join('\n'));
            return;
        }
        await reply([
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃      🏦 DEPOSITA      ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            '✅ Deposito riuscito!',
            '',
            `👛 Contanti: 🪙 ${result.walletCoins}`,
            `🏦 Banca: 🪙 ${result.bankCoins}`,
            '',
            '🛡️ Le monete in banca sono al sicuro dai ladri.',
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
