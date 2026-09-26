export const QR_INSTRUCTIONS = [
    '📱 Scansiona questo QR con WhatsApp.',
    '',
    'WhatsApp → Impostazioni → Dispositivi collegati → Collega un dispositivo',
].join('\n');
export const SUCCESS_TEXT = '✅ WhatsApp collegato correttamente!\nIl tuo numero è ora connesso.';
export const DEFAULT_LINK_TIMEOUT_MS = 5 * 60 * 1000;
export class TelegramLinker {
    sessionManager;
    qrToPng;
    timeoutMs;
    runs = new Map();
    constructor(options) {
        this.sessionManager = options.sessionManager;
        this.qrToPng = options.qrToPng;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_LINK_TIMEOUT_MS;
    }
    isLinking(userId) {
        return this.runs.has(userId);
    }
    /** Discards any in-progress linking state for a user without messaging. */
    cancel(userId) {
        this.runs.delete(userId);
    }
    /** Permanently deletes a user's WhatsApp session (socket + auth folder). */
    async deleteSession(userId) {
        this.runs.delete(userId);
        return this.sessionManager.deleteSession(userId);
    }
    async start(userId, chat) {
        if (this.runs.has(userId)) {
            await chat.sendText('⚠️ Collegamento già in corso per questo account. Attendi il QR o riprova più tardi.');
            return;
        }
        const existing = this.sessionManager.getManagedSession(userId);
        if (existing) {
            if (existing.state === 'open') {
                await chat.sendText('✅ WhatsApp già collegato. Nessuna nuova sessione avviata.');
            }
            else {
                await chat.sendText('⚠️ Esiste già una sessione per questo account non ancora collegata. ' +
                    'Chiudila prima di riprovare.');
            }
            return;
        }
        const run = { chat, settled: false };
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
        }
        catch (error) {
            console.error(`[telegram-link] createSession failed for ${userId}:`, error);
            this.fail(run, '❌ Impossibile avviare il collegamento. Riprova più tardi.');
            return;
        }
        setTimeout(() => {
            this.handleTimeout(userId);
        }, this.timeoutMs).unref?.();
    }
    async handleQr(run, qr) {
        if (run.settled)
            return;
        try {
            const png = await this.qrToPng(qr);
            await run.chat.sendQr(png, QR_INSTRUCTIONS);
        }
        catch (error) {
            console.error('[telegram-link] failed to render/send QR:', error);
            this.fail(run, '❌ Errore durante la generazione del QR. Riprova.');
        }
    }
    handleTimeout(userId) {
        const run = this.runs.get(userId);
        if (!run || run.settled)
            return;
        this.fail(run, '⏰ Tempo scaduto per il collegamento. Riprova quando vuoi.');
        void this.sessionManager.closeSession(userId);
    }
    fail(run, text) {
        if (run.settled)
            return;
        run.settled = true;
        const userId = [...this.runs.entries()].find(([, r]) => r === run)?.[0];
        void run.chat.sendText(text);
        if (userId)
            this.runs.delete(userId);
    }
}
