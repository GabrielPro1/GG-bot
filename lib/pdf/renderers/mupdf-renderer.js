import { PdfRenderError, RENDER_ERROR_CODES } from './renderer.js';

/**
 * EXPERIMENTAL / NON TESTATO. Renderer alternativo basato su MuPDF compilato in
 * WebAssembly (pacchetto "mupdf"). Il WASM puro non richiede build native, cosa
 * promettente per Termux/UserLAnd (ARM). Si attiva con PDF_RENDERER=mupdf.
 *
 * Limiti noti: emette sempre PNG (niente JPEG nell'API WASM usata qui), quindi le
 * pagine grandi producono payload più pesanti rispetto al renderer predefinito.
 */
export class MupdfRenderer {
    constructor(config) {
        this.config = config;
        this.mupdfModule = null;
    }

    async loadMupdf() {
        if (this.mupdfModule)
            return this.mupdfModule;
        try {
            const mod = await import('mupdf');
            this.mupdfModule = mod;
            return mod;
        }
        catch (error) {
            console.error('[pdf][mupdf] failed to load the mupdf module:', error);
            throw new PdfRenderError('Il renderer MuPDF non è disponibile su questa piattaforma.',
                RENDER_ERROR_CODES.renderer_unavailable);
        }
    }

    async open(pdfData) {
        const mupdf = await this.loadMupdf();
        const data = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
        let document;
        try {
            document = mupdf.Document.openDocument(data, 'application/pdf');
        }
        catch (error) {
            console.error('[pdf][mupdf] failed to open document:', error);
            throw new PdfRenderError('Il PDF sembra danneggiato o ha una struttura non valida.',
                RENDER_ERROR_CODES.corrupt_pdf);
        }
        const pageCount = this.resolvePageCount(mupdf, document);
        if (pageCount < 1) {
            throw new PdfRenderError('Il PDF non contiene pagine.', RENDER_ERROR_CODES.empty_pdf);
        }
        return {
            pageCount,
            renderPage: (pageNumber) => this.renderPage(mupdf, document, pageNumber),
            dispose: async () => {
                // MuPDF WASM libera i documenti tramite garbage collection.
            },
        };
    }

    resolvePageCount(mupdf, document) {
        if (typeof document.pageCount === 'number')
            return document.pageCount;
        let count = 0;
        while (true) {
            try {
                document.loadPage(count);
                count += 1;
            }
            catch {
                break;
            }
        }
        return count;
    }

    async renderPage(mupdf, document, pageNumber) {
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
            throw new PdfRenderError(`La pagina ${pageNumber} non esiste.`,
                RENDER_ERROR_CODES.page_out_of_range);
        }
        let page;
        try {
            page = document.loadPage(pageNumber - 1);
        }
        catch {
            throw new PdfRenderError(`La pagina ${pageNumber} non esiste.`,
                RENDER_ERROR_CODES.page_out_of_range);
        }
        try {
            const scale = this.config.renderScale;
            const matrix = new mupdf.Matrix(scale, 0, 0, scale, 0, 0);
            const colorspace = new mupdf.ColorSpace('DeviceRGB');
            const pixmap = page.toPixmap(matrix, colorspace, false, true);
            const result = pixmap.toPNG(true);
            let bytes;
            if (result instanceof Uint8Array) {
                bytes = result;
            }
            else if (typeof result?.asUint8Array === 'function') {
                bytes = await result.asUint8Array();
            }
            else if (result?.bytes) {
                bytes = result.bytes;
            }
            else {
                throw new Error('unexpected toPNG result shape');
            }
            return Buffer.from(bytes);
        }
        catch (error) {
            console.error('[pdf][mupdf] render failed:', error instanceof Error ? error.message : error);
            throw new PdfRenderError('Errore durante il rendering della pagina.',
                RENDER_ERROR_CODES.render_error);
        }
    }
}