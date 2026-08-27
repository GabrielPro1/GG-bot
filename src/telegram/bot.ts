import { Bot } from 'grammy';
import qrcode from 'qrcode';
import { registerHandlers } from './handlers.js';
import { TelegramLinker } from './link.js';
import type { SessionManager } from '../whatsapp/session-manager.js';

export async function startTelegramBot(sessionManager: SessionManager): Promise<Bot | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.trim().length === 0) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.');
    return null;
  }

  const linker = new TelegramLinker({
    sessionManager,
    qrToPng: (qr) => qrcode.toBuffer(qr, { type: 'png' }),
  });

  const bot = new Bot(token);
  registerHandlers(bot, linker);

  await bot.start({
    onStart: () => {
      console.log('Telegram bot started.');
    },
  });

  return bot;
}
