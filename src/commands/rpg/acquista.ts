import type { PurchaseResult } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BOX_TITLE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃      🛍️ ACQUISTO      ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
];

type PurchaseFailure = Extract<PurchaseResult, { ok: false }>;

function renderFailure(result: PurchaseFailure): string {
  if (result.error === 'unknown_item') {
    return [
      ...BOX_TITLE,
      '',
      '❌ Questo oggetto non esiste.',
      '',
      '💡 Controlla il /negozio e riprova!',
      '',
      SIGNATURE,
    ].join('\n');
  }

  if (result.error === 'insufficient_wallet') {
    return [
      ...BOX_TITLE,
      '',
      '❌ Non hai abbastanza monete.',
      '',
      `${result.item.emoji} Oggetto: ${result.item.name}`,
      `🪙 Prezzo: ${result.item.price}`,
      `👛 Wallet: 🪙 ${result.walletCoins}`,
      `🏦 Banca: 🪙 ${result.bankCoins}`,
      '',
      '💡 Usa /preleva per portare',
      '   denaro dalla banca al wallet.',
      '',
      SIGNATURE,
    ].join('\n');
  }

  return [
    ...BOX_TITLE,
    '',
    '⚠️ Acquisto non disponibile, riprova.',
    '',
    SIGNATURE,
  ].join('\n');
}

export default {
  name: 'acquista',
  category: 'rpg',
  emoji: '🛍️',
  description: 'Acquista un oggetto dal negozio',
  execute: async ({ args, identity, rpg, reply }) => {
    const itemId = args[0];
    if (!itemId) {
      await reply([
        ...BOX_TITLE,
        '',
        '🛍️ Usa:',
        '',
        '/acquista <oggetto>',
        '',
        '💡 Consulta il /negozio per gli oggetti disponibili.',
        '',
        SIGNATURE,
      ].join('\n'));
      return;
    }

    const result: PurchaseResult = rpg.purchaseItem(identity.userId, itemId);
    if (!result.ok) {
      await reply(renderFailure(result));
      return;
    }

    await reply([
      ...BOX_TITLE,
      '',
      '✅ Acquisto completato!',
      '',
      `${result.item.emoji} Hai acquistato:`,
      `   ${result.item.name} ×${result.quantityOwned}`,
      '',
      `🪙 Spesa: ${result.item.price}`,
      `💰 Wallet: 🪙 ${result.walletCoins}`,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
