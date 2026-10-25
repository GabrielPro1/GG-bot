import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { readdir, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKeyFor, PdfCache } from '../lib/pdf/cache.js';

function makeCacheConfig(dir, overrides = {}) {
    return {
        cacheEnabled: true,
        cacheDir: dir,
        cacheMaxBytes: 10 * 1024 * 1024,
        cacheMaxAgeMs: 60 * 60 * 1000,
        ...overrides,
    };
}

function makeBook(fileName, size, mtimeMs) {
    return { fileName, size, mtimeMs };
}

function withCacheDir(t) {
    const dir = mkdtempSync(join(tmpdir(), 'gg-pdf-cache-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
}

test('cache: set/get roundtrip', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir));
    const config = { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 };
    const book = makeBook('m.pdf', 100, 1000);
    const key = cacheKeyFor(book, 3, config);
    const bytes = Buffer.from('page image bytes');
    assert.equal(await cache.set(key, bytes), true);
    const result = await cache.get(key);
    assert.ok(result);
    assert.equal(result.toString(), 'page image bytes');
});

test('cache: miss for unknown key', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir));
    assert.equal(await cache.get('unknown'), null);
});

test('cacheKeyFor: differs when anything changes', () => {
    const config = { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 };
    const a = cacheKeyFor(makeBook('m.pdf', 100, 1000), 3, config);
    const b = cacheKeyFor(makeBook('m.pdf', 101, 1000), 3, config);
    const c = cacheKeyFor(makeBook('m.pdf', 100, 1001), 3, config);
    const d = cacheKeyFor(makeBook('m.pdf', 100, 1000), 4, config);
    const e = cacheKeyFor(makeBook('m.pdf', 100, 1000), 3, { ...config, renderScale: 3 });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
    assert.notEqual(a, e);
    assert.equal(a, cacheKeyFor(makeBook('m.pdf', 100, 1000), 3, config));
});

test('cache: stale entries are evicted and read as miss', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir, { cacheMaxAgeMs: 0 }));
    const book = makeBook('m.pdf', 100, 1000);
    const config = { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 };
    const key = cacheKeyFor(book, 1, config);
    await cache.set(key, Buffer.from('x'));
    const filePath = join(dir, `${key}.img`);
    const stats = await stat(filePath);
    const past = new Date(stats.mtimeMs - 5000);
    await utimes(filePath, past, past);
    assert.equal(await cache.get(key), null);
    assert.equal(readdirSync(dir).length, 0);
});

test('cache: prune keeps the store under the size limit', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir, { cacheMaxBytes: 250 }));
    const config = { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 };
    for (let i = 1; i <= 5; i += 1) {
        const key = cacheKeyFor(makeBook('m.pdf', 100, 1000), i, config);
        await cache.set(key, Buffer.alloc(100));
    }
    const entries = readdirSync(dir).filter((name) => name.endsWith('.img'));
    assert.ok(entries.length <= 3);
});

test('cache: disabled cache stores nothing', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir, { cacheEnabled: false }));
    const key = cacheKeyFor(makeBook('m.pdf', 100, 1000), 1, { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 });
    assert.equal(await cache.set(key, Buffer.from('x')), false);
    assert.equal(await cache.get(key), null);
    assert.equal(await cache.clear(), false);
});

test('cache: clear removes all entries', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir));
    const config = { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 };
    await cache.set(cacheKeyFor(makeBook('m.pdf', 100, 1000), 1, config), Buffer.from('a'));
    await cache.set(cacheKeyFor(makeBook('m.pdf', 100, 1000), 2, config), Buffer.from('b'));
    assert.equal(await cache.clear(), true);
    const after = await readdir(dir);
    assert.equal(after.length, 0);
});

test('cache: corrupted/unreadable entry is a miss', async (t) => {
    const dir = withCacheDir(t);
    const cache = new PdfCache(makeCacheConfig(dir));
    const key = cacheKeyFor(makeBook('m.pdf', 100, 1000), 1, { renderScale: 2, imageFormat: 'jpeg', jpegQuality: 82 });
    writeFileSync(join(dir, `${key}.img`), '');
    assert.equal(await cache.get(key), null);
});