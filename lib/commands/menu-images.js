import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_DIR = fileURLToPath(new URL('../../media/menu/', import.meta.url));

/** Menu categories that ship a dedicated header image. */
const DEDICATED_KEYS = new Set(['core', 'rpg', 'ai', 'fun', 'group', 'owner']);

/** Used for any category without its own image, so cards are never left blank. */
const FALLBACK = 'other.png';

/** Buffers are cached so repeated /menu calls never re-read them from disk. */
const cache = new Map();

/** Maps a menu section key to the file name of its header image. */
export function resolveMenuImageName(sectionKey) {
    return DEDICATED_KEYS.has(sectionKey) ? `${sectionKey}.png` : FALLBACK;
}

/** Reads (and caches) the header image bytes for a menu section. */
export async function loadMenuImage(sectionKey) {
    const name = resolveMenuImageName(sectionKey);
    if (!cache.has(name)) {
        cache.set(name, await readFile(join(IMAGE_DIR, name)));
    }
    return cache.get(name);
}
