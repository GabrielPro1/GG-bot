const INTEGER_PATTERN = /^\d+$/;
const RANGE_PATTERN = /^\d+-\d+$/;

function toPositiveInteger(raw) {
    if (!INTEGER_PATTERN.test(raw))
        return null;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1)
        return null;
    return value;
}

function stripTrailingPunctuation(raw) {
    return raw.trim().replace(/[.,;:!?]+$/, '');
}

/**
 * Analizza un singolo token pagina in { start, end } (per le pagine singole end === start).
 * Restituisce null quando il token non è una pagina/range, oppure { error:'inverted' } quando
 * l'inizio del range è maggiore della fine.
 */
export function parsePageSpec(raw) {
    if (raw === undefined || raw === null)
        return null;
    const token = stripTrailingPunctuation(String(raw));
    if (token.length === 0)
        return null;
    if (INTEGER_PATTERN.test(token)) {
        const value = toPositiveInteger(token);
        return value === null ? null : { start: value, end: value };
    }
    if (!RANGE_PATTERN.test(token))
        return null;
    const parts = token.split('-');
    const start = toPositiveInteger(parts[0]);
    const end = toPositiveInteger(parts[1]);
    if (start === null || end === null)
        return null;
    if (end < start)
        return { error: 'inverted', start, end };
    return { start, end };
}

function isPageLikeToken(raw) {
    const token = stripTrailingPunctuation(String(raw ?? ''));
    return /^\d/.test(token);
}

function stripMentions(tokens) {
    return tokens.filter((token) => !token.startsWith('@'));
}

/**
 * Analizza la lista argomenti di /mandapag.
 *
 * Restituisce:
 *  - { kind:'usage' }                       nessun argomento
 *  - { kind:'malformed' }                   l'ultimo token sembra una pagina ma non è valido
 *  - { kind:'inverted' }                    range con start > end
 *  - { kind:'missingBook', spec }           pagina presente, manca il nome del libro
 *  - { kind:'missingPage', bookQuery }      libro presente, manca il token pagina
 *  - { kind:'ok', bookQuery, spec }         pronto per l'esecuzione
 */
export function parseMandapagArgs(args) {
    const tokens = stripMentions(args ?? []);
    if (tokens.length === 0)
        return { kind: 'usage' };
    const last = tokens[tokens.length - 1];
    const pageLike = isPageLikeToken(last);
    const spec = pageLike ? parsePageSpec(last) : null;
    if (pageLike) {
        if (spec === null)
            return { kind: 'malformed' };
        if (spec.error === 'inverted')
            return { kind: 'inverted', start: spec.start, end: spec.end };
        const bookQuery = tokens.slice(0, -1).join(' ').trim();
        if (bookQuery.length === 0)
            return { kind: 'missingBook', spec };
        return { kind: 'ok', bookQuery, spec };
    }
    return { kind: 'missingPage', bookQuery: tokens.join(' ').trim() };
}

export function countRangePages(spec) {
    if (!spec || spec.error)
        return 0;
    return spec.end - spec.start + 1;
}