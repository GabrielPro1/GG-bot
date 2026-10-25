/**
 * Scostamenti fra la numerazione del libro cartaceo e le pagine del PDF.
 *
 * In alcuni PDF le prime pagine non sono numerate sul libro (copertina,
 * frontespizio, ...), mentre il PDF le numera comunque: la pagina stampata `X`
 * è quindi la pagina `X + offset` del file. Vale quando le pagine non numerate
 * sono tutte in testa; se ce ne fossero anche in mezzo servirebbe una mappa
 * pagina per pagina.
 *
 * Chiave: nome del file dentro `libri/`, in minuscolo (es. `GE-LB.pdf` → 'ge-lb.pdf').
 * Un libro non elencato (o con offset 0) usa direttamente il numero di pagina del PDF.
 *
 * Esempio, per un PDF con copertina + frontespizio prima della pagina 1 del libro:
 *     'nome-libro.pdf': 2,
 */
export const BOOK_PAGE_OFFSETS = {
    'mathematics-workbook.pdf': 1,
};

/**
 * Restituisce lo scostamento da applicare alle pagine di un libro.
 * In assenza di una voce valida restituisce 0, cioè nessuno scostamento.
 */
export function offsetForBook(bookOffsets, book) {
    if (!bookOffsets || !book)
        return 0;
    const key = String(book.fileName ?? '').toLowerCase();
    const offset = bookOffsets[key];
    return Number.isInteger(offset) ? offset : 0;
}
