import { PdfSender } from '../../lib/pdf/sender.js';
import { getPdfConfig } from '../../lib/pdf/pdf-library.config.js';

let sender = null;

function getSender() {
    if (!sender) {
        sender = new PdfSender(getPdfConfig());
    }
    return sender;
}

const NO_BOOKS = [
    '📚 Nessun libro trovato.',
    '',
    '➡️ Inserisci i tuoi PDF scolastici nella cartella',
    '   "libri" del progetto, poi usa /libri.',
    '',
    '💡 Sono supportati solo file PDF.',
].join('\n');

export default {
    name: 'libri',
    category: 'pdf',
    emoji: '📚',
    description: 'Mostra i libri PDF disponibili',
    execute: async ({ reply }) => {
        const result = await getSender().listAvailableBooks();
        if (!result.ok || result.books.length === 0) {
            await reply(NO_BOOKS);
            return;
        }
        const lines = result.books.map((book, index) => `${index + 1}. 📘 ${book.displayName}`);
        await reply([
            '📚 *LIBRI DISPONIBILI*',
            '',
            ...lines,
            '',
            '💡 Usa /mandapag <libro> <pagina>',
            '   Esempio: /mandapag matematica 125',
        ].join('\n'));
    },
};