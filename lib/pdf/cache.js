import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FILE_EXTENSION = '.img';

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function cacheKeyFor(book, pageNumber, config) {
    const payload = [
        book.fileName,
        book.size,
        book.mtimeMs,
        pageNumber,
        config.renderScale,
        config.imageFormat,
        config.jpegQuality,
    ].join('|');
    return sha256(payload);
}

function entryPath(cacheDir, key) {
    return path.join(cacheDir, `${key}${FILE_EXTENSION}`);
}

/**
 * Cache opzionale delle pagine su disco. Non lancia mai eccezioni: ogni metodo
 * degrada a un mancato hit, così la funzionalità continua a funzionare anche se
 * la directory della cache non è scrivibile.
 */
export class PdfCache {
    constructor(config) {
        this.config = config;
    }

    get enabled() {
        return Boolean(this.config.cacheEnabled);
    }

    async pathFor(key) {
        if (!this.enabled)
            return null;
        return entryPath(this.config.cacheDir, key);
    }

    async get(key) {
        if (!this.enabled)
            return null;
        const filePath = entryPath(this.config.cacheDir, key);
        try {
            const info = await stat(filePath);
            if (!info.isFile())
                return null;
            if (Date.now() - info.mtimeMs > this.config.cacheMaxAgeMs) {
                await unlink(filePath).catch(() => undefined);
                return null;
            }
            await utimes(filePath, new Date(), new Date()).catch(() => undefined);
            const bytes = await readFile(filePath);
            return bytes.byteLength > 0 ? bytes : null;
        }
        catch {
            return null;
        }
    }

    async set(key, bytes) {
        if (!this.enabled)
            return false;
        try {
            await mkdir(this.config.cacheDir, { recursive: true });
            const filePath = entryPath(this.config.cacheDir, key);
            const tmpPath = `${filePath}.${process.pid}.tmp`;
            await writeFile(tmpPath, bytes);
            await rename(tmpPath, filePath).catch(async (error) => {
                await unlink(tmpPath).catch(() => undefined);
                throw error;
            });
            await this.prune();
            return true;
        }
        catch (error) {
            console.warn('[pdf][cache] write failed:', error instanceof Error ? error.message : error);
            return false;
        }
    }

    async prune() {
        if (!this.enabled)
            return;
        try {
            const entries = await readdir(this.config.cacheDir);
            const items = [];
            let total = 0;
            for (const name of entries) {
                if (!name.endsWith(FILE_EXTENSION))
                    continue;
                try {
                    const info = await stat(path.join(this.config.cacheDir, name));
                    if (!info.isFile())
                        continue;
                    items.push({ name, size: info.size, mtimeMs: info.mtimeMs });
                    total += info.size;
                }
                catch {
                    // ignora le voci scomparse durante la scansione
                }
            }
            items.sort((a, b) => a.mtimeMs - b.mtimeMs);
            for (const item of items) {
                if (total <= this.config.cacheMaxBytes)
                    break;
                const removed = await unlink(path.join(this.config.cacheDir, item.name)).then(() => true).catch(() => false);
                if (removed)
                    total -= item.size;
            }
        }
        catch {
            // la potatura della cache è best-effort
        }
    }

    async clear() {
        if (!this.enabled)
            return false;
        try {
            const entries = await readdir(this.config.cacheDir);
            await Promise.all(entries
                .filter((name) => name.endsWith(FILE_EXTENSION))
                .map((name) => unlink(path.join(this.config.cacheDir, name)).catch(() => undefined)));
            return true;
        }
        catch {
            return false;
        }
    }
}