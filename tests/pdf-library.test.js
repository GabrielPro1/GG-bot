import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listBooks, searchBooks, displayNameFromFileName, ensureBooksDir } from '../lib/pdf/library.js';

function makeConfig(booksDir) {
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
        cacheEnabled: false,
        cacheDir: join(booksDir, 'cache'),
        cacheMaxBytes: 1024,
        cacheMaxAgeMs: 1000,
        renderer: 'pdfjs',
    };
}

function withBooksDir(t, files, subdirFile = null) {
    const dir = mkdtempSync(join(tmpdir(), 'gg-pdf-lib-'));
    for (const name of files)
        writeFileSync(join(dir, name), Buffer.from(`dummy ${name}`));
    if (subdirFile) {
        const sub = join(dir, 'sottocartella');
        mkdirSync(sub);
        writeFileSync(join(sub, subdirFile), Buffer.from('dummy'));
    }
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
}

test('listBooks: only pdf files, subfolders ignored', async (t) => {
    const dir = withBooksDir(t, ['Matematica Verde.pdf', 'storia.pdf', 'nota.txt'], 'nascosto.pdf');
    const result = await listBooks(makeConfig(dir));
    assert.equal(result.ok, true);
    const names = result.books.map((b) => b.fileName).sort();
    assert.deepEqual(names, ['Matematica Verde.pdf', 'storia.pdf']);
});

test('listBooks: missing dir is created and empty listing returned', async (t) => {
    const dir = join(mkdtempSync(join(tmpdir(), 'gg-pdf-lib-')), 'libri');
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = await listBooks(makeConfig(dir));
    assert.equal(result.ok, true);
    assert.equal(result.books.length, 0);
    ensureBooksDir(makeConfig(dir));
});

test('displayNameFromFileName: readable naming', () => {
    assert.equal(displayNameFromFileName('matematica_vol_2.pdf'), 'matematica vol 2');
    assert.equal(displayNameFromFileName('Storia - moderna.pdf'), 'Storia moderna');
    assert.equal(displayNameFromFileName('scienze.pdf'), 'scienze');
    assert.equal(displayNameFromFileName('solo.pdf'), 'solo');
});

test('searchBooks: exact match with spaces', async (t) => {
    const dir = withBooksDir(t, ['Matematica Verde.pdf', 'storia.pdf']);
    const result = await searchBooks(makeConfig(dir), 'matematica verde');
    assert.equal(result.ok, true);
    assert.equal(result.book.fileName, 'Matematica Verde.pdf');
});

test('searchBooks: case-insensitive', async (t) => {
    const dir = withBooksDir(t, ['Matematica Verde.pdf']);
    const result = await searchBooks(makeConfig(dir), 'MATEMATICA');
    assert.equal(result.ok, true);
    assert.equal(result.book.fileName, 'Matematica Verde.pdf');
});

test('searchBooks: accents and separators tolerated', async (t) => {
    const dir = withBooksDir(t, ['Analisi Matematica.pdf']);
    const result = await searchBooks(makeConfig(dir), 'analisi matematica');
    assert.equal(result.ok, true);
});

test('searchBooks: ambiguous query returns all matches', async (t) => {
    const dir = withBooksDir(t, ['Matematica Verde.pdf', 'matematica_vol_2.pdf']);
    const result = await searchBooks(makeConfig(dir), 'matematica');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ambiguous');
    assert.equal(result.matches.length, 2);
});

test('searchBooks: unknown book', async (t) => {
    const dir = withBooksDir(t, ['matematica.pdf']);
    const result = await searchBooks(makeConfig(dir), 'fisica');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
});

test('searchBooks: empty query', async (t) => {
    const dir = withBooksDir(t, ['matematica.pdf']);
    const result = await searchBooks(makeConfig(dir), '   ');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
});

test('books paths stay inside the books dir', async (t) => {
    const dir = withBooksDir(t, ['matematica.pdf']);
    const { books } = await listBooks(makeConfig(dir));
    for (const book of books) {
        const relative = book.filePath.startsWith(dir) ? book.filePath.slice(dir.length) : null;
        assert.ok(relative !== null);
        assert.ok(!relative.includes('..'));
    }
});