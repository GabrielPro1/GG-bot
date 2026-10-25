export const AI_COMMAND_PREFIX = '/';
const AI_ERRORS = {
    disabled: '⚠️ Il servizio AI non è configurato.',
    not_found: '❌ Chat AI non trovata.',
    provider_error: '⚠️ Si è verificato un errore durante la richiesta all\'AI. Riprova tra poco.',
    empty_response: '⚠️ L\'AI non ha restituito una risposta. Riprova.',
    empty_message: '⚠️ Messaggio vuoto.',
    invalid_id: '❌ Chat AI non valida.',
    db_error: '❌ Errore nel database. Riprova.',
};
/**
 * Smista un messaggio in arrivo quando la modalità AI è attiva per quell'utente.
 *
 * Ritorna:
 *  - 'command'  → il messaggio è un comando (/...): deve passare dal
 *                 dispatcher normale (gestisce /esci chat, /ping, /menu, ...).
 *  - 'ai'       → il messaggio è stato inviato all'AI e la risposta è già stata inviata.
 *  - 'none'     → la modalità AI non è attiva o il messaggio non è indirizzabile all'AI.
 *
 * La funzione è pura (nessuna dipendenza da Baileys) per poter essere testata
 * unitariamente e riusata dal gestore degli eventi WhatsApp.
 */
export async function handleAiModeMessage(input) {
    const { ai, userId, text, image, reply } = input;
    if (!ai.enabled)
        return 'none';
    const chatNumber = ai.activeChat(userId);
    if (chatNumber === null)
        return 'none';
    const isCommand = text !== null && text.startsWith(AI_COMMAND_PREFIX);
    if (isCommand)
        return 'command';
    const hasText = text !== null && text.trim().length > 0;
    const hasImage = image !== null;
    if (!hasText && !hasImage)
        return 'none';
    const aiImage = hasImage
        ? { mimeType: image.mimeType, data: image.data }
        : undefined;
    const result = await ai.sendMessage(userId, chatNumber, text ?? '', aiImage);
    if (!result.ok) {
        await reply(AI_ERRORS[result.error] ?? AI_ERRORS.provider_error);
        return 'ai';
    }
    await reply(result.reply);
    return 'ai';
}
