import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

const USAGE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃      👑 RIMUOVI MONETE       ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  '⚠️ Usa:',
  '',
  '/rimuovimonete <quantità> <utente>',
  '',
  '💡 Puoi indicare l\'utente:',
  '   • menzionandolo  (vince se presente)',
  '   • rispondendo a un suo messaggio',
  '',
  SIGNATURE,
].join('\n');

function renderError(title: string, message: string): string {
  return [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    `┃   ${title}   ┃`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    message,
    '',
    SIGNATURE,
  ].join('\n');
}

function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  if (value <= 0) return null;
  return value;
}

export default {
  name: 'rimuovimonete',
  aliases: ['rmcoins', 'togliamonete'],
  category: 'owner',
  emoji: '👑',
  ownerOnly: true,
  description: 'Rimuove monete a un utente',
  execute: async ({ args, rpg, mentions, quoted, reply }) => {
    const amount = parseAmount(args[0]);
    if (amount === null) {
      await reply(
        renderError('❌ ERRORE', '❌ Specifica una quantità intera positiva.'),
      );
      return;
    }

    const target = mentions[0] ?? quoted;
    if (!target) {
      await reply(USAGE);
      return;
    }

    const targetIdentity = target.identity;
    if (!targetIdentity) {
      await reply(
        renderError('❓ NON TROVATO', '❌ Non riesco a identificare questo giocatore.'),
      );
      return;
    }

    if (!rpg.getPlayer(targetIdentity.userId)) {
      await reply(
        renderError('❓ SCONOSCIUTO', '❌ Questo utente non ha ancora un profilo.'),
      );
      return;
    }

    rpg.removeCoins(targetIdentity.userId, amount);
    const wallet = rpg.getWalletBalance(targetIdentity.userId);
    const display = `@${targetIdentity.username ?? targetIdentity.lid ?? targetIdentity.pn ?? 'giocatore'}`;

    await reply(
      [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃    👑 MONETE RIMOSSE      ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        `💰 Rimossi ${amount} monete a ${display}.`,
        `Saldo attuale: ${wallet}`,
        '',
        SIGNATURE,
      ].join('\n'),
    );
  },
} satisfies Command;
