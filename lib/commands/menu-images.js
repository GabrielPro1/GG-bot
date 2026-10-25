import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_DIR = fileURLToPath(new URL('../../media/menu/', import.meta.url));

/** Categorie di menu con un'immagine di testa dedicata. */
const DEDICATED_KEYS = new Set(['core', 'rpg', 'ai', 'fun', 'group', 'owner']);

/** Usata per ogni categoria senza immagine propria, così le card non restano mai vuote. */
const FALLBACK = 'other.png';

/** I buffer restano in cache così le chiamate ripetute a /menu non li rileggono dal disco. */
const cache = new Map();

/** Associa la chiave di una sezione del menu al nome file della sua immagine di testa. */
export function resolveMenuImageName(sectionKey) {
    return DEDICATED_KEYS.has(sectionKey) ? `${sectionKey}.png` : FALLBACK;
}

/** Legge (e mette in cache) i byte dell'immagine di testa di una sezione del menu. */
export async function loadMenuImage(sectionKey) {
    const name = resolveMenuImageName(sectionKey);
    if (!cache.has(name)) {
        cache.set(name, await readFile(join(IMAGE_DIR, name)));
    }
    return cache.get(name);
}
