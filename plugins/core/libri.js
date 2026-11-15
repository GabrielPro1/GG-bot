/**
 * Comando /libri: mostra l'elenco dei libri disponibili.
 *
 * Nota: i messaggi interattivi WhatsApp (listMessage, buttonsMessage, carousel)
 * richiedono un account WhatsApp Business. Su account personali non sono
 * consegnati, quindi qui rispondiamo con un elenco di testo semplice.
 */
export default {
    name: 'libri',
    category: 'core',
    emoji: '📚',
    description: 'Mostra i libri disponibili',
    execute: async ({ reply }) => {
        const lines = [
            '📚 *LIBRI DISPONIBILI*',
            '',
            '1. 📘 Matematica — 120 pagine — edizione 2026',
            '2. 📗 Italiano — 200 pagine — antologia',
            '3. 📙 Storia — 150 pagine — mondo antico',
            '4. 📕 Dizionario — italiano-inglese',
            '',
            '💡 Usa /mandapag <libro> <pagina> per consultare una pagina.',
        ];
        await reply(lines.join('\n'));
    },
};
