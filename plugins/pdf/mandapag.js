import { PdfSender } from '../../lib/pdf/sender.js';
import { getPdfConfig } from '../../lib/pdf/pdf-library.config.js';
import { parseMandapagArgs } from '../../lib/pdf/page-parser.js';

let sender = null;

function getSender() {
    if (!sender) {
        sender = new PdfSender(getPdfConfig());
    }
    return sender;
}

const USAGE = [
    '📖 *COME USARE /mandapag*',
    '',
    '/mandapag <libro> <pagina>',
    '   Esempio: /mandapag matematica 125',
    '',
    '/mandapag <libro> <inizio>-<fine>',
    '   Esempio: /mandapag matematica 125-128',
    '',
    '💡 Indica la pagina come è numerata sul libro.',
    '💡 Lista libri: /libri',
].join('\n');

function formatResult(result) {
    switch (result.error) {
        case 'not_found':
            return `❌ Nessun libro corrisponde a «${result.query}».\n💡 Usa /libri per vedere i titoli disponibili.`;
        case 'ambiguous':
            return [
                `🤔 Ho trovato più libri per «${result.query}»:`,
                '',
                ...result.matches.map((match, index) => `${index + 1}. ${match.displayName}`),
                '',
                'Specifica meglio il titolo.',
            ].join('\n');
        case 'read_error':
            return '❌ Impossibile leggere la cartella dei libri.';
        case 'too_many_pages':
            return `⚠️ Hai richiesto ${result.requested} pagine, ma il massimo è ${result.max} per richiesta.`;
        case 'file_too_large':
            return '❌ Il file PDF supera la dimensione massima consentita.';
        case 'renderer_unavailable':
            return `⚠️ ${result.detail ?? 'Il motore di rendering PDF non è disponibile su questa piattaforma.'}`;
        case 'corrupt_pdf':
            return `❌ «${result.bookName}» sembra danneggiato o non è un PDF valido.`;
        case 'empty_pdf':
            return `❌ «${result.bookName}» non contiene pagine.`;
        case 'page_out_of_range':
            return `❌ «${result.bookName}» ha ${result.pageCount} pagine. Le pagine ${result.pages.join(', ')} non esistono.`;
        default: {
            const summary = `✅ Inviate ${result.sentPages.length} pagine da «${result.bookName}».`;
            if (!result.failedPages || result.failedPages.length === 0)
                return summary;
            const failed = result.failedPages.map((entry) => `${entry.page} (${entry.reason})`).join(', ');
            return `${summary}\n⚠️ Pagine non inviate: ${failed}.`;
        }
    }
}

function renderParseError(parsed) {
    switch (parsed.kind) {
        case 'usage':
            return USAGE;
        case 'missingBook':
            return '⚠️ Indica il libro.\n\nEsempio: /mandapag matematica 125\n💡 Lista libri: /libri';
        case 'missingPage':
            return `⚠️ Indica il numero di pagina per «${parsed.bookQuery}».\n\nEsempio: /mandapag ${parsed.bookQuery} 125`;
        case 'malformed':
            return '⚠️ Pagina non valida. Usa un numero intero oppure un intervallo tipo 125-128.';
        case 'inverted':
            return `⚠️ Intervallo invertito: inizio (${parsed.start}) maggiore di fine (${parsed.end}).\nEsempio corretto: ${parsed.start}-${parsed.end}`;
        default:
            return USAGE;
    }
}

export default {
    name: 'mandapag',
    category: 'pdf',
    emoji: '📄',
    description: 'Invia pagine di un libro PDF come immagini',
    execute: async ({ args, reply, sendImage }) => {
        const parsed = parseMandapagArgs(args);
        if (parsed.kind !== 'ok') {
            await reply(renderParseError(parsed));
            return;
        }
        if (typeof sendImage !== 'function') {
            await reply('⚠️ Invio immagini non disponibile in questo contesto.');
            return;
        }
        const result = await getSender().sendPageRange({
            bookQuery: parsed.bookQuery,
            spec: parsed.spec,
            sendImage,
        });
        await reply(formatResult(result));
    },
};