import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

const NOT_CONFIGURED = '⚠️ Il servizio AI non è configurato.';

const CHAT_NOT_FOUND = '❌ Chat AI non trovata.';

const PROVIDER_ERROR = '⚠️ Si è verificato un errore durante la richiesta all\'AI. Riprova tra poco.';

const USAGE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃          🤖 AI              ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  '⚠️ Usa:',
  '',
  '/ai crea chat   → attiva AI mode e crea una chat',
  '/ai chat <id> <messaggio>',
  '/ai chats',
  '/ai elimina chat <id>',
  '/esci chat       → esce da AI mode',
  '',
  SIGNATURE,
].join('\n');

function parseChatId(raw: string | undefined): number | null {
  if (raw === undefined || raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

function renderBox(title: string, lines: readonly string[]): string {
  return ['╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮', `┃   ${title}   ┃`, '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯', '', ...lines, '', SIGNATURE].join('\n');
}

export default {
  name: 'ai',
  aliases: ['gemini'],
  category: 'ai',
  emoji: '🤖',
  description: 'Chatta con l\'AI (Gemini)',
  execute: async ({ args, identity, ai, reply }) => {
    if (!ai.enabled) {
      await reply(NOT_CONFIGURED);
      return;
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'crea' && args[1]?.toLowerCase() === 'chat') {
      const result = ai.createChat(identity.userId);
      if (!result.ok) {
        await reply(result.error === 'disabled' ? NOT_CONFIGURED : '❌ Errore nel database. Riprova.' );
        return;
      }
      await reply(
        renderBox('🤖 CHAT AI ATTIVATA', [
          '',
          `🆔 ID: ${result.chatNumber}`,
          '',
          'Scrivimi direttamente per parlare con l\'AI.',
          'Per uscire digita /esci chat',
          '',
          'Oppure usa /ai chat <id> <messaggio>',
          '',
        ]),
      );
      return;
    }

    if (subcommand === 'chat') {
      const chatId = parseChatId(args[1]);
      if (chatId === null) {
        await reply(USAGE);
        return;
      }
      const message = args.slice(2).join(' ').trim();
      if (message.length === 0) {
        await reply(USAGE);
        return;
      }
      const result = await ai.sendMessage(identity.userId, chatId, message);
      if (!result.ok) {
        switch (result.error) {
          case 'disabled':
            await reply(NOT_CONFIGURED);
            break;
          case 'not_found':
            await reply(CHAT_NOT_FOUND);
            break;
          case 'invalid_id':
          case 'empty_message':
            await reply(USAGE);
            break;
          case 'empty_response':
          case 'provider_error':
          default:
            await reply(PROVIDER_ERROR);
            break;
        }
        return;
      }
      await reply(result.reply);
      return;
    }

    if (subcommand === 'chats') {
      const result = ai.listChats(identity.userId);
      if (!result.ok) {
        await reply(result.error === 'disabled' ? NOT_CONFIGURED : '❌ Errore nel database. Riprova.');
        return;
      }
      if (result.chats.length === 0) {
        await reply('🤖 Non hai ancora chat AI. Usa `/ai crea chat` per crearne una.');
        return;
      }
      const lines = result.chats.map((chat) => `${chat.chatNumber} — Chat AI`);
      await reply(renderBox('🤖 LE TUE CHAT', ['', ...lines, '']));
      return;
    }

    if (subcommand === 'elimina' && args[1]?.toLowerCase() === 'chat') {
      const chatId = parseChatId(args[2]);
      if (chatId === null) {
        await reply(USAGE);
        return;
      }
      const result = ai.deleteChat(identity.userId, chatId);
      if (!result.ok) {
        switch (result.error) {
          case 'disabled':
            await reply(NOT_CONFIGURED);
            break;
          case 'not_found':
            await reply(CHAT_NOT_FOUND);
            break;
          default:
            await reply(USAGE);
            break;
        }
        return;
      }
      await reply(`🗑️ Chat AI ${result.chatNumber} eliminata.`);
      return;
    }

    await reply(USAGE);
  },
} satisfies Command;
