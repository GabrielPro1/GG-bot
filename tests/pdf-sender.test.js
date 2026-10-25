import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PdfSender } from '../lib/pdf/sender.js';
import { PdfRenderError, RENDER_ERROR_CODES } from '../lib/pdf/renderers/renderer.js';

function makeConfig({ booksDir, cacheDir, overrides = {} }) {
    return {
        booksDir,
        maxPagesPerRequest: 5,
        renderScale: 2,
        maxPdfBytes: 1024 * 1024,
        maxConcurrentRenders: 3,
        sendDelayMs: 0,
        imageFormat: 'jpeg',
        jpegQuality: 82,
        maxImageBytes: 1024 * 1024,
        cacheEnabled: true,
        cacheDir,
        cacheMaxBytes: 10 * 1024 * 1024,
        cacheMaxAgeMs: 60 * 60 * 1000,
        renderer: 'pdfjs',
        bookOffsets: {},
        ...overrides,
    };
}

function setup(t, { files = ['matematica.pdf'], content = Buffer.from('dummy pdf content') } = {}) {
    const booksDir = mkdtempSync(join(tmpdir(), 'gg-pdf-send-'));
    const cacheDir = mkdtempSync(join(tmpdir(), 'gg-pdf-cache-'));
    for (const name of files)
        writeFileSync(join(booksDir, name), content);
    t.after(() => {
        rmSync(booksDir, { recursive: true, force: true });
        rmSync(cacheDir, { recursive: true, force: true });
    });
    return { booksDir, cacheDir };
}

function fakeRenderer(options = {}) {
    const state = { opens: 0, renders: 0, disposes: 0 };
    const renderer = {
        state,
        async open() {
            state.opens += 1;
            if (options.openError)
                throw options.openError;
            return {
                pageCount: options.pageCount ?? 3,
                renderPage: async (pageNumber) => {
                    state.renders += 1;
                    if (options.renderErrorFor && options.renderErrorFor(pageNumber))
                        throw options.renderErrorFor(pageNumber);
                    return Buffer.from(`img-${pageNumber}`);
                },
                dispose: async () => {
                    state.disposes += 1;
                },
            };
        },
    };
    return renderer;
}

function collectImages() {
    const sent = [];
    return {
        sent,
        sendImage: async (buffer, caption) => {
            sent.push({ buffer, caption });
        },
    };
}

test('sendPageRange: unknown book', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer: fakeRenderer() });
    const result = await sender.sendPageRange({ bookQuery: 'fisica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'not_found');
    assert.equal(result.query, 'fisica');
});

test('sendPageRange: ambiguous book', async (t) => {
    const { booksDir, cacheDir } = setup(t, { files: ['matematica a.pdf', 'matematica b.pdf'] });
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer: fakeRenderer() });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ambiguous');
    assert.equal(result.matches.length, 2);
});

test('sendPageRange: malformed spec', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer: fakeRenderer() });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { error: 'inverted' }, sendImage: async () => {} });
    assert.deepEqual(result, { ok: false, error: 'malformed' });
});

test('sendPageRange: too many pages', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer: fakeRenderer() });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 10 }, sendImage: async () => {} });
    assert.deepEqual(result, { ok: false, error: 'too_many_pages', requested: 10, max: 5 });
});

test('sendPageRange: file too large', async (t) => {
    const { booksDir, cacheDir } = setup(t, { content: Buffer.alloc(200) });
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { maxPdfBytes: 100 } }),
        { renderer: fakeRenderer() },
    );
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'file_too_large');
});

test('sendPageRange: single page is sent once', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const { sent, sendImage } = collectImages();
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage });
    assert.equal(result.ok, true);
    assert.deepEqual(result.sentPages, [1]);
    assert.deepEqual(result.failedPages, []);
    assert.equal(renderer.state.renders, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].caption, '📄 matematica — pagina 1/3');
});

test('sendPageRange: range order and captions', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const { sent, sendImage } = collectImages();
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 3 }, sendImage });
    assert.equal(result.ok, true);
    assert.deepEqual(result.sentPages, [1, 2, 3]);
    assert.deepEqual(
        sent.map((entry) => entry.caption),
        [
            '📄 matematica — pagina 1/3',
            '📄 matematica — pagina 2/3',
            '📄 matematica — pagina 3/3',
        ],
    );
});

test('sendPageRange: render failure on one page does not stop others', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderError = new PdfRenderError('render failed', RENDER_ERROR_CODES.render_error);
    const renderer = fakeRenderer({ renderErrorFor: (page) => (page === 2 ? renderError : null) });
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const { sent, sendImage } = collectImages();
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 3 }, sendImage });
    assert.equal(result.ok, true);
    assert.deepEqual(result.sentPages, [1, 3]);
    assert.deepEqual(result.failedPages, [{ page: 2, reason: 'errore di rendering' }]);
    assert.equal(sent.length, 2);
});

test('sendPageRange: send error is reported per page', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const sent = [];
    const sendImage = async (buffer, caption) => {
        if (caption.includes('pagina 2/')) {
            const err = new Error('network');
            err.code = 'send_error';
            throw err;
        }
        sent.push(caption);
    };
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 2 }, sendImage });
    assert.deepEqual(result.sentPages, [1]);
    assert.deepEqual(result.failedPages, [{ page: 2, reason: 'errore di invio' }]);
});

test('sendPageRange: oversized image fails as image_too_large', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { maxImageBytes: 4 } }),
        { renderer },
    );
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, true);
    assert.deepEqual(result.failedPages, [{ page: 1, reason: 'immagine troppo grande per WhatsApp' }]);
});

test('sendPageRange: out of range is rejected before any send', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const { sent, sendImage } = collectImages();
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 4, end: 5 }, sendImage });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'page_out_of_range');
    assert.deepEqual(result.pages, [4, 5]);
    assert.equal(result.pageCount, 3);
    assert.equal(sent.length, 0);
    assert.equal(renderer.state.disposes, 1);
});

test('sendPageRange: corrupt pdf on open', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({
        openError: new PdfRenderError('bad', RENDER_ERROR_CODES.corrupt_pdf),
    });
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'corrupt_pdf');
});

test('sendPageRange: empty pdf on open', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({
        openError: new PdfRenderError('void', RENDER_ERROR_CODES.empty_pdf),
    });
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'empty_pdf');
});

test('sendPageRange: concurrent requests for the same page render once', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const spec = { start: 1, end: 1 };
    const call = () => sender.sendPageRange({ bookQuery: 'matematica', spec, sendImage: async () => {} });
    const [a, b] = await Promise.all([call(), call()]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(renderer.state.opens, 2);
    assert.equal(renderer.state.renders, 1);
});

test('sendPageRange: no leftover files with cache disabled', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { cacheEnabled: false } }),
        { renderer: fakeRenderer() },
    );
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage: async () => {} });
    assert.equal(result.ok, true);
    assert.deepEqual(readdirSync(booksDir), ['matematica.pdf']);
});

test('sendPageRange: handle is disposed even when pages fail', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({
        renderErrorFor: () => new PdfRenderError('boom', RENDER_ERROR_CODES.render_error),
    });
    const sender = new PdfSender(makeConfig({ booksDir, cacheDir }), { renderer });
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 2 }, sendImage: async () => {} });
    assert.equal(result.ok, true);
    assert.equal(result.sentPages.length, 0);
    assert.equal(result.failedPages.length, 2);
    assert.equal(renderer.state.disposes, 1);
});

test('sendPageRange: sendDelay is honored between sends', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer();
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { sendDelayMs: 25 } }),
        { renderer },
    );
    const timestamps = [];
    const sendImage = async () => {
        timestamps.push(Date.now());
    };
    const start = Date.now();
    await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 3 }, sendImage });
    assert.equal(timestamps.length, 3);
    assert.ok(timestamps[1] - timestamps[0] >= 20);
    assert.ok(timestamps[2] - timestamps[1] >= 20);
    assert.ok(Date.now() - start >= 40);
});

test('sendPageRange: offset sposta la pagina renderizzata e la didascalia', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({ pageCount: 56 });
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { bookOffsets: { 'matematica.pdf': 2 } } }),
        { renderer },
    );
    const { sent, sendImage } = collectImages();
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 3, end: 4 }, sendImage });
    assert.equal(result.ok, true);
    assert.deepEqual(result.sentPages, [3, 4]);
    assert.equal(result.pageCount, 54);
    // Pagina 3 del libro -> pagina 5 del PDF, e così via.
    assert.deepEqual(sent.map((entry) => entry.buffer.toString()), ['img-5', 'img-6']);
    assert.deepEqual(
        sent.map((entry) => entry.caption),
        [
            '📄 matematica — pagina 3/54',
            '📄 matematica — pagina 4/54',
        ],
    );
});

test('sendPageRange: con offset il limite superiore è la pagina del libro', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({ pageCount: 56 });
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { bookOffsets: { 'matematica.pdf': 2 } } }),
        { renderer },
    );
    const { sent, sendImage } = collectImages();
    // 54 è l'ultima pagina del libro: il PDF le dedica la 56, che esiste.
    const last = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 54, end: 54 }, sendImage });
    assert.equal(last.ok, true);
    assert.equal(sent[0].buffer.toString(), 'img-56');
    // 55 è oltre il libro: il PDF avrebbe una pagina 57, che non esiste.
    const beyond = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 55, end: 55 }, sendImage });
    assert.equal(beyond.error, 'page_out_of_range');
    assert.deepEqual(beyond.pages, [55]);
    assert.equal(beyond.pageCount, 54);
});

test('sendPageRange: offset negativo sposta la numerazione del libro indietro', async (t) => {
    const { booksDir, cacheDir } = setup(t);
    const renderer = fakeRenderer({ pageCount: 10 });
    const sender = new PdfSender(
        makeConfig({ booksDir, cacheDir, overrides: { bookOffsets: { 'matematica.pdf': -3 } } }),
        { renderer },
    );
    const { sent, sendImage } = collectImages();
    // Con offset -3 la pagina 1 del PDF è la pagina 4 del libro.
    const result = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 4, end: 4 }, sendImage });
    assert.equal(result.ok, true);
    assert.equal(result.pageCount, 13);
    assert.equal(sent[0].buffer.toString(), 'img-1');
    // Le pagine 1-3 del libro cadrebbero prima della prima pagina del PDF.
    const below = await sender.sendPageRange({ bookQuery: 'matematica', spec: { start: 1, end: 1 }, sendImage });
    assert.equal(below.error, 'page_out_of_range');
    assert.deepEqual(below.pages, [1]);
});
