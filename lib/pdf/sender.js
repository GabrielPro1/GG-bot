import { readFile } from 'node:fs/promises';
import { listBooks, searchBooks, ensureBooksDir } from './library.js';
import { cacheKeyFor, PdfCache } from './cache.js';
import { Semaphore, KeyedLocker } from './limiter.js';
import { createRenderer } from './renderers/renderer.js';
import { PdfRenderError } from './renderers/renderer.js';
import { countRangePages } from './page-parser.js';
import { offsetForBook } from './book-offsets.js';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageCaption(book, pageNumber, pageCount) {
    return `📄 ${book.displayName} — pagina ${pageNumber}/${pageCount}`;
}

function mapPageFailure(error) {
    if (error instanceof PdfRenderError) {
        switch (error.code) {
            case 'page_out_of_range':
                return 'pagina inesistente';
            case 'corrupt_pdf':
                return 'PDF danneggiato';
            case 'empty_pdf':
                return 'PDF senza pagine';
            case 'renderer_unavailable':
                return 'renderer non disponibile';
            case 'render_error':
            default:
                return 'errore di rendering';
        }
    }
    if (error?.code === 'image_too_large')
        return 'immagine troppo grande per WhatsApp';
    if (error?.code === 'send_error')
        return 'errore di invio';
    console.error('[pdf][send] page failure:', error instanceof Error ? error.message : error);
    return 'errore generico';
}

export class PdfSender {
    constructor(config, options = {}) {
        this.config = config;
        this.cache = new PdfCache(config);
        this.renderSemaphore = new Semaphore(config.maxConcurrentRenders);
        this.docLocker = new KeyedLocker();
        this.rendererPromise = null;
        this.rendererOverride = options.renderer ?? null;
    }

    ensureRenderer() {
        if (this.rendererOverride)
            return Promise.resolve({ renderer: this.rendererOverride });
        if (!this.rendererPromise) {
            this.rendererPromise = createRenderer(this.config);
        }
        return this.rendererPromise;
    }

    async listAvailableBooks() {
        ensureBooksDir(this.config);
        return listBooks(this.config);
    }

    /**
     * Invia le pagine richieste di un libro come immagini WhatsApp separate.
     * Il chiamante fornisce sendImage(buffer, caption); questo metodo attende ogni
     * invio, così il completamento è riportato solo dopo l'elaborazione di tutte le pagine.
     */
    async sendPageRange({ bookQuery, spec, sendImage }) {
        if (!spec || spec.error) {
            return { ok: false, error: 'malformed' };
        }
        const search = await searchBooks(this.config, bookQuery);
        if (!search.ok) {
            return {
                ok: false,
                error: search.reason,
                query: search.query,
                matches: search.matches,
            };
        }
        const book = search.book;
        // Scostamento fra pagina del libro e pagina del PDF (copertina/frontespizio).
        const pageOffset = offsetForBook(this.config.bookOffsets, book);

        const requested = countRangePages(spec);
        if (requested > this.config.maxPagesPerRequest) {
            return {
                ok: false,
                error: 'too_many_pages',
                requested,
                max: this.config.maxPagesPerRequest,
            };
        }
        if (book.size > this.config.maxPdfBytes) {
            return {
                ok: false,
                error: 'file_too_large',
                size: book.size,
                max: this.config.maxPdfBytes,
            };
        }

        const { renderer, error } = await this.ensureRenderer();
        if (error || !renderer) {
            return { ok: false, error: 'renderer_unavailable', detail: error };
        }

        let pdfData;
        try {
            pdfData = await readFile(book.filePath);
        }
        catch {
            return { ok: false, error: 'read_error', bookName: book.displayName };
        }

        let handle;
        try {
            handle = await renderer.open(pdfData);
        }
        catch (openError) {
            if (openError instanceof PdfRenderError) {
                if (openError.code === 'empty_pdf') {
                    return { ok: false, error: 'empty_pdf', bookName: book.displayName };
                }
                if (openError.code === 'corrupt_pdf') {
                    return { ok: false, error: 'corrupt_pdf', bookName: book.displayName };
                }
                if (openError.code === 'renderer_unavailable') {
                    return { ok: false, error: 'renderer_unavailable', detail: openError.message };
                }
            }
            // Qualsiasi altro errore è del motore, non del libro danneggiato: mai dare la colpa al PDF.
            console.error('[pdf][open] unexpected failure:', openError instanceof Error ? openError.stack : openError);
            return {
                ok: false,
                error: 'renderer_unavailable',
                detail: 'Il motore PDF ha fallito in modo imprevisto. Controlla i log del bot.',
            };
        }

        // `pageCount` e le pagine sono nella numerazione del libro; il PDF parte da
        // `1 + pageOffset`, quindi per renderizzare si somma lo scostamento.
        const pageCount = handle.pageCount - pageOffset;
        const pages = [];
        for (let p = spec.start; p <= spec.end; p += 1)
            pages.push(p);
        const outOfRange = pages.filter((p) => p + pageOffset < 1 || p > pageCount);
        if (outOfRange.length > 0) {
            await handle.dispose().catch(() => undefined);
            return { ok: false, error: 'page_out_of_range', pages: outOfRange, pageCount, bookName: book.displayName };
        }

        const sentPages = [];
        const failedPages = [];
        try {
            for (let i = 0; i < pages.length; i += 1) {
                const pageNumber = pages[i];
                try {
                    const buffer = await this.obtainPageBuffer(book, pageNumber + pageOffset, handle);
                    if (buffer.byteLength > this.config.maxImageBytes) {
                        const sizeError = new Error('image too large');
                        sizeError.code = 'image_too_large';
                        throw sizeError;
                    }
                    await sendImage(buffer, pageCaption(book, pageNumber, pageCount));
                    sentPages.push(pageNumber);
                }
                catch (sendOrRenderError) {
                    failedPages.push({ page: pageNumber, reason: mapPageFailure(sendOrRenderError) });
                }
                if (i < pages.length - 1 && this.config.sendDelayMs > 0) {
                    await sleep(this.config.sendDelayMs);
                }
            }
        }
        finally {
            await handle.dispose().catch(() => undefined);
        }

        return {
            ok: true,
            bookName: book.displayName,
            pageCount,
            sentPages,
            failedPages,
        };
    }

    async obtainPageBuffer(book, pageNumber, handle) {
        const key = cacheKeyFor(book, pageNumber, this.config);
        const cached = await this.cache.get(key);
        if (cached)
            return cached;
        return this.docLocker.run(book.filePath, async () => {
            return this.renderSemaphore.run(async () => {
                const again = await this.cache.get(key);
                if (again)
                    return again;
                const buffer = await handle.renderPage(pageNumber);
                await this.cache.set(key, buffer);
                return buffer;
            });
        });
    }
}