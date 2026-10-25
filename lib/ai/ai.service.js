import { AI_IMAGE_MARKER, } from './types.js';
const MAX_ID = Number.MAX_SAFE_INTEGER;
function isValidId(value) {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAX_ID;
}
function isValidText(text) {
    return typeof text === 'string' && text.trim().length > 0;
}
/**
 * Servizio AI a livello applicativo. Gestisce persistenza e flusso della
 * conversazione, ma delega la generazione effettiva del testo a un AiProvider
 * iniettato, così questa classe non dipende mai direttamente dall'SDK Gemini
 * (né da quello di altro provider).
 */
export class AIService {
    enabled;
    repo;
    provider;
    /** Chat AI attiva per utente, solo in memoria (NON persistita; si azzera al riavvio). */
    activeByUser = new Map();
    constructor(repo, provider) {
        this.repo = repo;
        this.provider = provider;
        this.enabled = provider !== null;
    }
    createChat(userId) {
        if (!this.enabled)
            return { ok: false, error: 'disabled' };
        try {
            const chatNumber = this.repo.createChat(userId);
            this.activeByUser.set(userId, chatNumber);
            return { ok: true, chatNumber };
        }
        catch (error) {
            console.error('[ai] createChat failed:', error);
            return { ok: false, error: 'db_error' };
        }
    }
    activeChat(userId) {
        return this.activeByUser.get(userId) ?? null;
    }
    deactivate(userId) {
        this.activeByUser.delete(userId);
    }
    listChats(userId) {
        if (!this.enabled)
            return { ok: false, error: 'disabled' };
        try {
            const rows = this.repo.listChats(userId);
            const chats = rows.map((row) => ({
                chatNumber: row.chatNumber,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                messageCount: this.repo.countMessages(row.id),
            }));
            return { ok: true, chats };
        }
        catch (error) {
            console.error('[ai] listChats failed:', error);
            return { ok: false, error: 'db_error' };
        }
    }
    deleteChat(userId, chatNumber) {
        if (!this.enabled)
            return { ok: false, error: 'disabled' };
        if (!isValidId(chatNumber))
            return { ok: false, error: 'invalid_id' };
        try {
            const deleted = this.repo.deleteChat(userId, chatNumber);
            return deleted
                ? { ok: true, chatNumber }
                : { ok: false, error: 'not_found' };
        }
        catch (error) {
            console.error('[ai] deleteChat failed:', error);
            return { ok: false, error: 'db_error' };
        }
    }
    async sendMessage(userId, chatNumber, text, image) {
        if (!this.enabled)
            return { ok: false, error: 'disabled' };
        if (!isValidId(chatNumber))
            return { ok: false, error: 'invalid_id' };
        const hasText = isValidText(text);
        if (!hasText && !image)
            return { ok: false, error: 'empty_message' };
        let chat;
        try {
            chat = this.repo.findChat(userId, chatNumber);
        }
        catch (error) {
            console.error('[ai] sendMessage lookup failed:', error);
            return { ok: false, error: 'db_error' };
        }
        if (!chat)
            return { ok: false, error: 'not_found' };
        const history = this.repo.listMessages(chat.id);
        const storedContent = hasText ? text.trim() : AI_IMAGE_MARKER;
        try {
            this.repo.addMessage(chat.id, 'user', storedContent);
        }
        catch (error) {
            console.error('[ai] failed to store user message:', error);
            return { ok: false, error: 'db_error' };
        }
        const request = history.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            text: message.content,
        }));
        request.push({
            role: 'user',
            text: hasText ? text.trim() : '',
            ...(image ? { image } : {}),
        });
        let reply;
        try {
            reply = await this.provider.generateResponse(request);
        }
        catch (error) {
            console.error('[ai] provider error:', error);
            return { ok: false, error: 'provider_error' };
        }
        if (!isValidText(reply))
            return { ok: false, error: 'empty_response' };
        try {
            this.repo.addMessage(chat.id, 'assistant', reply.trim());
        }
        catch (error) {
            console.error('[ai] failed to store assistant message:', error);
            return { ok: false, error: 'db_error' };
        }
        return { ok: true, chatNumber, reply: reply.trim() };
    }
}
const DISABLED_VIEW = {
    enabled: false,
    createChat: () => ({ ok: false, error: 'disabled' }),
    listChats: () => ({ ok: false, error: 'disabled' }),
    deleteChat: () => ({ ok: false, error: 'disabled' }),
    sendMessage: async () => ({ ok: false, error: 'disabled' }),
    activeChat: () => null,
    deactivate: () => undefined,
};
/** Vista no-op condivisa, usata quando nessun servizio AI è collegato a un dispatcher. */
export function disabledAiView() {
    return { ...DISABLED_VIEW };
}
