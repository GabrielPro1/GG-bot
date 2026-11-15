import { createInteractiveButtons } from '@whiskeysockets/baileys';
import {
    pendingDeposito,
    parseDepositInput,
    setPending,
    clearPending,
} from '../../lib/commands/deposit-pending.js';

// Barre ASCII hardcodate, stessa lunghezza di plugins/owner/aggiungimonete.js:
// - Box errore: 13 travi
// - Box risultato: 19 travi
// - Box pending: 17 travi
const SIGNATURE = '╰━━━━ ✨ GG BOT ✨ ━━━━╯';

function formatError(message) {
    return [
        '╭━━╮',
        '┃ 🏦 DEPOSITA ┃',
        '╰━━╯',
        '',
        '❌ Deposito non riuscito.',
        '',
        message,
        '',
        SIGNATURE,
    ].join('\n');
}

function formatResult(deposito, walletCoins, bankCoins) {
    return [
        '╭━━━━╮',
        '┃ 🏦 DEPOSITA   ┃',
        '╰━━━━╯',
        '',
        '✅ Deposito riuscito!',
        '',
        `💰 Importo: 🪙 ${deposito} coins`,
        `👛 Portafoglio: 🪙 ${walletCoins} coins`,
        `🏦 Banca: 🪙 ${bankCoins} coins`,
        '',
        '🛡️ Le monete in banca sono al sicuro.',
        '',
        SIGNATURE,
    ].join('\n');
}

function formatPending(money, bankCoins) {
    const totale = money + bankCoins;
    return [
        '╭━━━━╮',
        '┃ 🏦 DEPOSITA ┃',
        '╰━━━━╯',
        '',
        '𝐐𝐮𝐚𝐧𝐭𝐢 𝐜𝐨𝐢𝐧𝐬 𝐯𝐮𝐨𝐢 𝐝𝐞𝐩𝐨𝐬𝐢𝐭𝐚𝐫𝐞?',
        '',
        `👛 Portafoglio: 🪙 ${money} coins`,
        `🏦 Banca: 🪙 ${bankCoins} coins`,
        `💰 Totale: 🪙 ${totale} coins`,
        '',
        '𝟏. 25%   𝟐. 50%   𝟑. 75%   𝟒. Tutto',
        '𝐒𝐜𝐫𝐢𝐯𝐢 𝐥\'𝐢𝐦𝐩𝐨𝐫𝐭𝐨 𝐨 𝐢𝐥 𝐧𝐮𝐦𝐞𝐫𝐨.',
        '',
        SIGNATURE,
    ].join('\n');
}

export { formatError, formatResult, formatPending };

export default {
    name: 'deposita',
    category: 'rpg',
    emoji: '🏦',
    description: 'Deposita monete in banca',
    execute: async ({ args, identity, rpg, reply, sock, remoteJid }) => {
        const userId = identity.userId;
        const player = rpg.getOrCreatePlayer(userId);
        const money = player.walletCoins;

        // Se c'è un argomento, processa direttamente (compatibile con /deposita 500)
        if (args.length > 0) {
            const raw = args[0];
            const parsed = parseDepositInput(raw, money);
            if (parsed.error) {
                await reply(formatError(parsed.error));
                return;
            }

            const deposito = parsed.amount;
            if (deposito > money) {
                await reply(formatError('𝐍𝐨𝐧 𝐡𝐚𝐢 𝐚𝐛𝐛𝐚𝐬𝐭𝐚𝐧𝐳𝐚 𝐜𝐨𝐢𝐧𝐬 𝐧𝐞𝐥 𝐩𝐨𝐫𝐭𝐚𝐟𝐨𝐠𝐥𝐢𝐨.'));
                return;
            }

            const result = rpg.deposit(userId, deposito);
            if (!result.ok) {
                await reply(formatError('⚠️ Quantità non valida.'));
                return;
            }

            clearPending(userId);
            await reply(formatResult(deposito, result.walletCoins, result.bankCoins));
            return;
        }

        // Nessun argomento: prova i bottoni interattivi, altrimenti fallback a testo
        setPending(userId, { chat: remoteJid });

        const buttons = [
            { buttonId: '/deposita 25%', buttonText: { displayText: '25%' }, type: 1 },
            { buttonId: '/deposita 50%', buttonText: { displayText: '50%' }, type: 1 },
            { buttonId: '/deposita 75%', buttonText: { displayText: '75%' }, type: 1 },
            { buttonId: '/deposita tutto', buttonText: { displayText: 'Tutto' }, type: 1 },
        ];

        let buttonsSent = false;
        if (sock && remoteJid) {
            try {
                await sock.sendMessage(remoteJid, createInteractiveButtons({
                    headerText: '🏦 Deposita',
                    bodyText: 'Quanti coins vuoi depositare?',
                    footerText: `👛 ${money} coins — 🏦 ${player.bankCoins} coins`,
                    buttons,
                }));
                buttonsSent = true;
            }
            catch (error) {
                console.error('[deposita] bottoni non disponibili su questo account:', error instanceof Error ? error.message : error);
            }
        }

        await reply(formatPending(money, player.bankCoins));
        if (!buttonsSent) {
            await reply('💡 I bottoni interattivi richiedono WhatsApp Business. Scrivi comunque il numero o l\'importo.');
        }
    },
};
