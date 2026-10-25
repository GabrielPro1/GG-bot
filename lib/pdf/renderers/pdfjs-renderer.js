import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PdfRenderError, RENDER_ERROR_CODES } from './renderer.js';

/**
 * Renderer predefinito: pdf.js di Mozilla (build legacy per Node) più @napi-rs/canvas.
 * Entrambe le librerie vengono importate in modo lazy così che un'installazione nativa
 * rotta produca un errore chiaro invece di far crashare il bot all'avvio.
 */
export class PdfjsRenderer {
    constructor(config) {
        this.config = config;
        this.pdfjsModule = null;
        this.createCanvas = null;
        this.standardFontDataUrl = null;
        this.cMapUrl = null;
    }

    async loadPdfjs() {
        if (this.pdfjsModule)
            return this.pdfjsModule;
        try {
            const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const { createRequire } = await import('node:module');
            const require = createRequire(import.meta.url);
            const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
            // Su Windows l'ESM loader accetta solo URL file://, quindi un semplice
            // percorso assoluto ("C:\...") fa fallire la configurazione del worker.
            mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
            // pdf.js ha bisogno dei dati standard-font/cMap inclusi per disegnare il testo:
            // senza ogni glifo viene ignorato silenziosamente e non compare nella pagina.
            const packageRoot = dirname(dirname(dirname(workerPath)));
            this.standardFontDataUrl = this.dataPathFor(join(packageRoot, 'standard_fonts'));
            this.cMapUrl = this.dataPathFor(join(packageRoot, 'cmaps'));
            this.pdfjsModule = mod;
            return mod;
        }
        catch (error) {
            console.error('[pdf][pdfjs] failed to load pdf.js:', error instanceof Error ? error.message : error);
            throw new PdfRenderError('Il motore di rendering PDF (pdf.js) non è disponibile.',
                RENDER_ERROR_CODES.renderer_unavailable);
        }
    }

    dataPathFor(directory) {
        // In Node pdf.js li legge con fs.readFile(baseUrl + filename), quindi richiede
        // percorsi filesystem semplici (non URL file://), terminanti con un separatore.
        return `${directory}${sep}`;
    }

    async loadCanvas() {
        if (this.createCanvas)
            return this.createCanvas;
        try {
            const { createCanvas } = await import('@napi-rs/canvas');
            this.createCanvas = createCanvas;
            return createCanvas;
        }
        catch (error) {
            console.error('[pdf][canvas] failed to load @napi-rs/canvas:', error instanceof Error ? error.message : error);
            throw new PdfRenderError('Il motore di rendering PDF (canvas) non è disponibile.',
                RENDER_ERROR_CODES.renderer_unavailable);
        }
    }

    async open(pdfData) {
        const mod = await this.loadPdfjs();
        // pdf.js rifiuta i Buffer di Node (sottoclassi di Uint8Array) con
        // "Please provide binary data as Uint8Array, rather than Buffer":
        // copiali in un Uint8Array puro prima di passarli.
        const data = Buffer.isBuffer(pdfData)
            ? new Uint8Array(pdfData)
            : (pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData));
        let pdf;
        try {
            pdf = await mod.getDocument({
                data,
                // Dati font/cMap inclusi: senza questi ogni glifo viene perso.
                standardFontDataUrl: this.standardFontDataUrl,
                cMapUrl: this.cMapUrl,
                cMapPacked: true,
            }).promise;
        }
        catch (error) {
            throw new PdfRenderError('Il PDF sembra danneggiato o ha una struttura non valida.',
                RENDER_ERROR_CODES.corrupt_pdf);
        }
        const pageCount = pdf.numPages;
        if (!Number.isInteger(pageCount) || pageCount < 1) {
            await pdf.destroy().catch(() => undefined);
            throw new PdfRenderError('Il PDF non contiene pagine.', RENDER_ERROR_CODES.empty_pdf);
        }
        return {
            pageCount,
            renderPage: (pageNumber) => this.renderPage(pdf, pageNumber),
            dispose: async () => {
                try {
                    await pdf.destroy();
                }
                catch {
                    // qui non c'è niente da recuperare
                }
            },
        };
    }

    async renderPage(pdf, pageNumber) {
        const createCanvas = await this.loadCanvas();
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
            throw new PdfRenderError(`La pagina ${pageNumber} non esiste.`,
                RENDER_ERROR_CODES.page_out_of_range);
        }
        let page;
        try {
            page = await pdf.getPage(pageNumber);
        }
        catch {
            throw new PdfRenderError('Impossibile leggere la pagina dal PDF.',
                RENDER_ERROR_CODES.corrupt_pdf);
        }
        let canvas = null;
        try {
            const viewport = page.getViewport({ scale: this.config.renderScale });
            canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
            const context = canvas.getContext('2d', { alpha: false });
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            page.cleanup?.();
            const format = this.config.imageFormat === 'png' ? 'image/png' : 'image/jpeg';
            const buffer = format === 'image/png'
                ? canvas.toBuffer('image/png')
                : canvas.toBuffer('image/jpeg', this.config.jpegQuality);
            return buffer;
        }
        catch (error) {
            if (error instanceof PdfRenderError)
                throw error;
            console.error('[pdf][render] failed:', error instanceof Error ? error.message : error);
            throw new PdfRenderError('Errore durante il rendering della pagina.',
                RENDER_ERROR_CODES.render_error);
        }
        finally {
            try {
                canvas?.dispose?.();
            }
            catch {
                // rilascio best-effort del canvas nativo
            }
        }
    }
}