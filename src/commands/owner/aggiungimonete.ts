import type { Command } from '../types.js';
import { resolveTargetUser } from '../target.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

const USAGE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃       👑 AGGIUNGI MONETE       ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  '⚠️ Usa:',
  '',
  '/aggiungimonete <quantità> <utente>',
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
  name: 'aggiungimonete',
  aliases: ['addcoins', 'daimonete'],
  category: 'owner',
  emoji: '👑',
  ownerOnly: true,
  description: 'Aggiunge monete a un giocatore',
  execute: async ({ args, rpg, mentions, quoted, reply }) => {
    const amount = parseAmount(args[0]);
    if (amount === null) {
      await reply(USAGE);
      return;
    }

    const target = resolveTargetUser(mentions, quoted);
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
        renderError(
          '❓ SCONOSCIUTO',
          '❌ Questo giocatore non ha ancora un profilo RPG.',
        ),
      );
      return;
    }

    rpg.addCoins(targetIdentity.userId, amount);
    const wallet = rpg.getWalletBalance(targetIdentity.userId);
    const display = `@${targetIdentity.username ?? targetIdentity.lid ?? targetIdentity.pn ?? 'giocatore'}`;

    await reply(
      [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃    👑 MONETE AGGIUNTE     ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        `🎯 ${display}`,
        `🪙 +${amount} monete`,
        '',
        `👛 Saldo: 🪙 ${wallet}`,
        '',
        SIGNATURE,
      ].join('\n'),
    );
  },
} satisfies Command;
