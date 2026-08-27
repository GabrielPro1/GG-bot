import type { SessionManager } from '../whatsapp/session-manager.js';

export const QR_INSTRUCTIONS = [
  '📱 Scansiona questo QR con WhatsApp.',
  '',
  'WhatsApp → Impostazioni → Dispositivi collegati → Collega un dispositivo',
].join('\n');

export const SUCCESS_TEXT =
  '✅ WhatsApp collegato correttamente!\nIl tuo numero è ora connesso.';

export const DEFAULT_LINK_TIMEOUT_MS = 5 * 60 * 1000;

export interface TelegramLinkChat {
  sendText(text: string): Promise<unknown>;
  sendQr(buffer: Buffer, caption: string): Promise<unknown>;
}

export interface TelegramLinkerOptions {
  sessionManager: SessionManager;
  /** Converts a Baileys QR string into a PNG buffer. */
  qrToPng: (qr: string) => Promise<Buffer>;
  timeoutMs?: number;
}

interface LinkRun {
  chat: TelegramLinkChat;
  settled: boolean;
  qrMessageId?: number;
}

export class TelegramLinker {
  private readonly sessionManager: SessionManager;
  private readonly qrToPng: (qr: string) => Promise<Buffer>;
  private readonly timeoutMs: number;
  private readonly runs = new Map<string, LinkRun>();

  constructor(options: TelegramLinkerOptions) {
    this.sessionManager = options.sessionManager;
    this.qrToPng = options.qrToPng;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_LINK_TIMEOUT_MS;
  }

  isLinking(userId: string): boolean {
    return this.runs.has(userId);
  }

  /** Discards any in-progress linking state for a user without messaging. */
  cancel(userId: string): void {
    this.runs.delete(userId);
  }

  /** Permanently deletes a user's WhatsApp session (socket + auth folder). */
  async deleteSession(userId: string): Promise<boolean> {
    this.runs.delete(userId);
    return this.sessionManager.deleteSession(userId);
  }

  async start(userId: string, chat: TelegramLinkChat): Promise<void> {
    if (this.runs.has(userId)) {
      await chat.sendText(
        '⚠️ Collegamento già in corso per questo account. Attendi il QR o riprova più tardi.',
      );
      return;
    }

    const existing = this.sessionManager.getManagedSession(userId);
    if (existing) {
      if (existing.state === 'open') {
        await chat.sendText('✅ WhatsApp già collegato. Nessuna nuova sessione avviata.');
      } else {
        await chat.sendText(
          '⚠️ Esiste già una sessione per questo account non ancora collegata. ' +
            'Chiudila prima di riprovare.',
        );
      }
      return;
    }

    const run: LinkRun = { chat, settled: false };
    this.runs.set(userId, run);

    try {
      await this.sessionManager.createSession(userId, {
        onQr: (uid, qr) => {
          void this.handleQr(run, qr);
        },
        onOpen: (uid) => {
          run.settled = true;
          void chat.sendText(SUCCESS_TEXT);
          this.runs.delete(userId);
        },
        onConnectionUpdate: (uid, update) => {
          if (update.connection === 'close' && !run.settled) {
            this.fail(run, '⚠️ Connessione chiusa prima del completamento. Riprova.');
          }
        },
      });
    } catch (error) {
      console.error(`[telegram-link] createSession failed for ${userId}:`, error);
      this.fail(run, '❌ Impossibile avviare il collegamento. Riprova più tardi.');
      return;
    }

    setTimeout(() => {
      this.handleTimeout(userId);
    }, this.timeoutMs).unref?.();
  }

  private async handleQr(run: LinkRun, qr: string): Promise<void> {
    if (run.settled) return;
    try {
      const png = await this.qrToPng(qr);
      await run.chat.sendQr(png, QR_INSTRUCTIONS);
    } catch (error) {
      console.error('[telegram-link] failed to render/send QR:', error);
      this.fail(run, '❌ Errore durante la generazione del QR. Riprova.');
    }
  }

  private handleTimeout(userId: string): void {
    const run = this.runs.get(userId);
    if (!run || run.settled) return;
    this.fail(run, '⏰ Tempo scaduto per il collegamento. Riprova quando vuoi.');
    void this.sessionManager.closeSession(userId);
  }

  private fail(run: LinkRun, text: string): void {
    if (run.settled) return;
    run.settled = true;
    const userId = [...this.runs.entries()].find(([, r]) => r === run)?.[0];
    void run.chat.sendText(text);
    if (userId) this.runs.delete(userId);
  }
}
