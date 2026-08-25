import type { TransferResult } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

function usage(): string {
  return [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃      💸 PRELEVA      ┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '⚠️ Quantità mancante.',
    '',
    'Uso: /preleva <quantità>',
    'Esempio: /preleva 200',
    '',
    SIGNATURE,
  ].join('\n');
}

const INVALID_AMOUNT_MESSAGES: Record<string, string> = {
  invalid_amount: '⚠️ Quantità non valida: usa un numero intero maggiore di 0.',
  insufficient_wallet: '😢 Impossibile: saldo portafoglio insufficente.',
  insufficient_bank: '😢 Non hai abbastanza monete in banca.',
};

export default {
  name: 'preleva',
  category: 'rpg',
  emoji: '💸',
  description: 'Preleva monete dalla banca',
  execute: async ({ args, identity, rpg, reply }) => {
    const raw = args[0];
    if (!raw) {
      await reply(usage());
      return;
    }

    const result: TransferResult = rpg.withdraw(identity.userId, Number(raw));
    if (!result.ok) {
      await reply([
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃      💸 PRELEVA      ┃',
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
      '┃      💸 PRELEVA      ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      '✅ Prelievo riuscito!',
      '',
      `👛 Contanti: 🪙 ${result.walletCoins}`,
      `🏦 Banca: 🪙 ${result.bankCoins}`,
      '',
      '⚠️ Ora queste monete possono essere rubate!',
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
