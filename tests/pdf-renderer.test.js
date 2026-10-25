import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfjsRenderer } from '../lib/pdf/renderers/pdfjs-renderer.js';
import { PdfRenderError, RENDER_ERROR_CODES } from '../lib/pdf/renderers/renderer.js';

const RENDERER_CONFIG = { renderScale: 1.5, imageFormat: 'jpeg', jpegQuality: 70 };

async function buildSamplePdf() {
    const { PDFDocument, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const colors = [rgb(0.9, 0.1, 0.1), rgb(0.1, 0.8, 0.1), rgb(0.1, 0.1, 0.8)];
    for (const color of colors) {
        const page = doc.addPage([300, 400]);
        page.drawRectangle({ x: 20, y: 20, width: 260, height: 360, color });
    }
    return Buffer.from(await doc.save());
}

/**
 * PDF valido ma senza pagine (/Pages con /Count 0 e /Kids vuoto): pdf.js
 * riporta numPages === 0. Serve un file costruito a mano perché l'output di
 * pdf-lib per un documento senza pagine viene interpretato come 1 pagina.
 */
function buildZeroPagePdf() {
    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n',
    ];
    let body = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
        offsets.push(body.length);
        body += object;
    }
    const xrefPos = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i += 1)
        body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    return Buffer.from(body, 'latin1');
}

test('pdfjs renderer: renders a real PDF to JPEG', async (t) => {
    let pdfjs;
    try {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    catch {
        t.skip('pdfjs-dist non installato');
        return;
    }
    try {
        await import('@napi-rs/canvas');
    }
    catch {
        t.skip('@napi-rs/canvas non installato');
        return;
    }

    const renderer = new PdfjsRenderer(RENDERER_CONFIG);
    const pdfData = await buildSamplePdf();
    const handle = await renderer.open(pdfData);
    try {
        assert.equal(handle.pageCount, 3);
        const page1 = await handle.renderPage(1);
        const page2 = await handle.renderPage(2);
        assert.ok(page1 instanceof Buffer);
        assert.equal(page1[0], 0xff);
        assert.equal(page1[1], 0xd8);
        assert.equal(page1[2], 0xff);
        assert.ok(page1.compare(page2) !== 0, 'pagine diverse devono produrre immagini diverse');
    }
    finally {
        await handle.dispose();
    }
});

test('pdfjs renderer: PNG format works', async (t) => {
    try {
        await import('pdfjs-dist/legacy/build/pdf.mjs');
        await import('@napi-rs/canvas');
    }
    catch {
        t.skip('dipendenze renderer non installate');
        return;
    }
    const renderer = new PdfjsRenderer({ ...RENDERER_CONFIG, imageFormat: 'png' });
    const handle = await renderer.open(await buildSamplePdf());
    try {
        const png = await handle.renderPage(1);
        assert.ok(png.length >= 8);
        assert.equal(png.toString('latin1', 0, 4), '\x89PNG');
    }
    finally {
        await handle.dispose();
    }
});

test('pdfjs renderer: corrupt input throws corrupt_pdf', async (t) => {
    try {
        await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    catch {
        t.skip('pdfjs-dist non installato');
        return;
    }
    const renderer = new PdfjsRenderer(RENDERER_CONFIG);
    await assert.rejects(
        () => renderer.open(Buffer.from('questo non è un PDF valido')), 
        (error) => error instanceof PdfRenderError && error.code === RENDER_ERROR_CODES.corrupt_pdf,
    );
});

test('pdfjs renderer: out of range page throws page_out_of_range', async (t) => {
    try {
        await import('pdfjs-dist/legacy/build/pdf.mjs');
        await import('@napi-rs/canvas');
    }
    catch {
        t.skip('dipendenze renderer non installate');
        return;
    }
    const renderer = new PdfjsRenderer(RENDERER_CONFIG);
    const handle = await renderer.open(await buildSamplePdf());
    try {
        await assert.rejects(
            () => handle.renderPage(99),
            (error) => error instanceof PdfRenderError && error.code === RENDER_ERROR_CODES.page_out_of_range,
        );
    }
    finally {
        await handle.dispose();
    }
});

test('pdfjs renderer: empty pdf throws empty_pdf', async (t) => {
    try {
        await import('pdfjs-dist/legacy/build/pdf.mjs');
        await import('@napi-rs/canvas');
    }
    catch {
        t.skip('dipendenze renderer non installate');
        return;
    }
    const renderer = new PdfjsRenderer(RENDERER_CONFIG);
    await assert.rejects(
        () => renderer.open(buildZeroPagePdf()),
        (error) => error instanceof PdfRenderError && error.code === RENDER_ERROR_CODES.empty_pdf,
    );
});