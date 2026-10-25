export class PdfRenderError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'PdfRenderError';
        this.code = code;
    }
}

export const RENDER_ERROR_CODES = {
    corrupt_pdf: 'corrupt_pdf',
    empty_pdf: 'empty_pdf',
    page_out_of_range: 'page_out_of_range',
    read_error: 'read_error',
    render_error: 'render_error',
    renderer_unavailable: 'renderer_unavailable',
};

/**
 * Costruisce il renderer delle pagine configurato. I renderer vengono caricati in modo
 * lazy così che una dipendenza nativa mancante o incompatibile non impedisca mai al bot
 * di avviarsi. Restituisce { renderer } in caso di successo, altrimenti { error } con
 * un messaggio leggibile dall'utente.
 */
export async function createRenderer(config) {
    if (config.renderer === 'mupdf') {
        try {
            const { MupdfRenderer } = await import('./mupdf-renderer.js');
            return { renderer: new MupdfRenderer(config) };
        }
        catch (error) {
            console.error('[pdf] mupdf renderer unavailable:', error);
            return {
                error: 'Il renderer PDF alternativo (mupdf) non è disponibile. ' +
                    'Controlla che il pacchetto "mupdf" sia installato e riprova.',
            };
        }
    }
    try {
        const { PdfjsRenderer } = await import('./pdfjs-renderer.js');
        return { renderer: new PdfjsRenderer(config) };
    }
    catch (error) {
        console.error('[pdf] pdfjs renderer unavailable:', error);
        return {
            error: 'Il motore di rendering PDF (pdf.js + canvas) non è disponibile su questa ' +
                'piattaforma. Verifica che le dipendenze native siano installate correttamente.',
        };
    }
}