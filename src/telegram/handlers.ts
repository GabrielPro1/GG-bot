import { Bot, InputFile } from 'grammy';
import type { TelegramLinker } from './link.js';

export const LINK_WHATSAPP_CALLBACK = 'link_whatsapp';

export function registerHandlers(bot: Bot, linker: TelegramLinker): void {
  bot.command('start', (ctx) => {
    void ctx.reply(
      '🤖 Benvenuto! Questo bot ti permetterà di collegare il tuo numero WhatsApp.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Collega WhatsApp', callback_data: LINK_WHATSAPP_CALLBACK }],
          ],
        },
      },
    );
  });

  bot.callbackQuery(LINK_WHATSAPP_CALLBACK, async (ctx) => {
    const user = ctx.from;
    if (!user) return;

    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery({
        text: 'Usa questo bot in chat privata per collegare WhatsApp.',
      });
      return;
    }

    const userId = String(user.id);
    if (linker.isLinking(userId)) {
      await ctx.answerCallbackQuery({ text: 'Collegamento già in corso.' });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Avvio collegamento…' });

    await linker.start(userId, {
      sendText: (text) => ctx.reply(text),
      sendQr: (buffer, caption) => ctx.replyWithPhoto(new InputFile(buffer), { caption }),
    });
  });

  bot.command('deletesession', async (ctx) => {
    const user = ctx.from;
    if (!user) return;

    // Only ever target the caller's own session id; /deletesession takes no args.
    const deleted = await linker.deleteSession(String(user.id));

    if (deleted) {
      await ctx.reply(
        '🗑️ Sessione WhatsApp eliminata correttamente.\nOra puoi collegare nuovamente il tuo numero.',
      );
    } else {
      await ctx.reply('ℹ️ Non hai nessuna sessione WhatsApp da eliminare.');
    }
  });
}
