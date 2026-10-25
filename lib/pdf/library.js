import { mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PDF_EXTENSION = '.pdf';

export function ensureBooksDir(config) {
    mkdirSync(config.booksDir, { recursive: true });
}

function fold(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export function displayNameFromFileName(fileName) {
    const base = fileName.slice(0, -PDF_EXTENSION.length);
    const name = base
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return name.length > 0 ? name : fileName;
}

function assertInsideBooksDir(booksDir, filePath) {
    const relative = path.relative(booksDir, filePath);
    if (relative.length === 0)
        throw new Error('resolved book path equals the books dir');
    const segments = relative.split(path.sep);
    if (segments.some((segment) => segment === '..' || segment.length === 0))
        throw new Error('resolved book path escapes the books dir');
}

async function statBook(booksDir, fileName) {
    const filePath = path.resolve(booksDir, fileName);
    assertInsideBooksDir(booksDir, filePath);
    const info = await stat(filePath);
    if (!info.isFile())
        return null;
    return {
        fileName,
        filePath,
        displayName: displayNameFromFileName(fileName),
        size: info.size,
        mtimeMs: Math.round(info.mtimeMs),
    };
}

export async function listBooks(config) {
    ensureBooksDir(config);
    const results = [];
    let files;
    try {
        const dirents = await readdir(config.booksDir, { withFileTypes: true });
        files = dirents.filter((dirent) => dirent.isFile());
    }
    catch {
        return { ok: false, error: 'read_error', books: [] };
    }
    for (const dirent of files.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!dirent.name.toLowerCase().endsWith(PDF_EXTENSION))
            continue;
        try {
            const book = await statBook(config.booksDir, dirent.name);
            if (book)
                results.push(book);
        }
        catch (error) {
            console.error('[pdf] skipped unreadable file:', dirent.name, error instanceof Error ? error.message : error);
        }
    }
    return { ok: true, books: results };
}

function scoreMatch(query, candidate) {
    if (candidate === query)
        return 100;
    if (candidate.startsWith(query))
        return 90;
    if (candidate.includes(query))
        return 80;
    const words = query.split(' ').filter((word) => word.length > 0);
    if (words.length > 0 && words.every((word) => candidate.includes(word)))
        return 70 + words.length;
    return 0;
}

/**
 * Cerca nella libreria dei libri. Restituisce:
 *  - ok:true      con il singolo miglior match
 *  - ok:false, reason:'not_found'
 *  - ok:false, reason:'ambiguous' con tutti i migliori match
 */
export async function searchBooks(config, query) {
    const foldedQuery = fold(query);
    if (foldedQuery.length === 0)
        return { ok: false, reason: 'not_found', query };
    const { ok, books } = await listBooks(config);
    if (!ok)
        return { ok: false, reason: 'read_error', query };
    let bestScore = 0;
    const matches = [];
    for (const book of books) {
        const score = scoreMatch(foldedQuery, fold(book.displayName));
        if (score < 70)
            continue;
        if (score > bestScore) {
            bestScore = score;
            matches.length = 0;
            matches.push(book);
        }
        else if (score === bestScore) {
            matches.push(book);
        }
    }
    if (matches.length === 0)
        return { ok: false, reason: 'not_found', query };
    if (matches.length === 1)
        return { ok: true, book: matches[0] };
    return {
        ok: false,
        reason: 'ambiguous',
        query,
        matches: matches.map((book) => ({ fileName: book.fileName, displayName: book.displayName })),
    };
}