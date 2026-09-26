import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommandRegistry } from '../lib/commands/registry.js';
import { loadMenuImage, resolveMenuImageName } from '../lib/commands/menu-images.js';
import { buildMenuSections } from '../lib/commands/menu-sections.js';

const IMAGE_DIR = fileURLToPath(new URL('../media/menu/', import.meta.url));

/** FNV-1a, so we can tell two image files apart without decoding them. */
function fingerprint(buffer) {
    let hash = 0x811c9dc5;
    for (const byte of buffer) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

function makeRegistry() {
    const registry = new CommandRegistry();
    const make = (name, category, emoji) => ({
        name,
        category,
        emoji,
        description: `${name} desc`,
        execute: async () => {},
    });
    registry.register(make('ping', 'core', '🏓'));
    registry.register(make('ruba', 'rpg', '💰'));
    registry.register(make('aggiungimonete', 'owner', '➕'));
    return registry;
}

describe('Menu header images', () => {
    it('gives every menu section its own image', async () => {
        const sections = buildMenuSections(makeRegistry());
        assert.ok(sections.length >= 3, 'menu must expose several sections');

        const names = sections.map((section) => resolveMenuImageName(section.key));
        const unique = new Set(names);
        assert.equal(
            unique.size,
            names.length,
            `each section must map to its own image, got ${JSON.stringify(names)}`,
        );
    });

    it('exposes a category key on every section', () => {
        const sections = buildMenuSections(makeRegistry());
        for (const section of sections) {
            assert.equal(typeof section.key, 'string', `section ${section.title} needs a key`);
        }
    });

    it('uses the generic image for the top level menu', async () => {
        const menu = (await import('../plugins/core/menu.js')).default;
        let captured = null;
        await menu.execute({
            args: [],
            registry: makeRegistry(),
            rpg: {},
            sendList: async (options) => {
                captured = options;
            },
        });
        assert.equal(captured.imageKey, undefined, 'the top level menu has no section image');
        assert.equal(
            (await loadMenuImage(captured.imageKey)).byteLength,
            (await loadMenuImage('other')).byteLength,
            'an undefined key must resolve to the fallback image',
        );
    });

    it('uses the section image when a section is opened', async () => {
        const sezione = (await import('../plugins/core/sezione.js')).default;
        let captured = null;
        await sezione.execute({
            args: ['rpg'],
            registry: makeRegistry(),
            rpg: {},
            reply: async () => undefined,
            sendList: async (options) => {
                captured = options;
            },
        });
        assert.equal(captured.imageKey, 'rpg');
    });

    it('ships one image file per menu category', async () => {
        const files = (await readdir(IMAGE_DIR)).filter((f) => f.endsWith('.png'));
        for (const key of ['core', 'rpg', 'ai', 'fun', 'group', 'owner', 'other']) {
            assert.ok(files.includes(`${key}.png`), `media/menu/${key}.png must exist`);
        }
    });

    it('falls back to the generic image for unknown categories', () => {
        assert.equal(resolveMenuImageName('core'), 'core.png');
        assert.equal(resolveMenuImageName('rpg'), 'rpg.png');
        assert.equal(resolveMenuImageName('fun'), 'fun.png');
        assert.equal(resolveMenuImageName('other'), 'other.png');
        assert.equal(resolveMenuImageName('nope'), 'other.png');
        assert.equal(resolveMenuImageName(undefined), 'other.png');
    });

    it('returns real, different image bytes per category', async () => {
        const core = await loadMenuImage('core');
        const rpg = await loadMenuImage('rpg');
        const owner = await loadMenuImage('owner');
        assert.ok(core.byteLength > 1000, 'core image must not be empty');
        assert.ok(rpg.byteLength > 1000, 'rpg image must not be empty');
        assert.ok(owner.byteLength > 1000, 'owner image must not be empty');
        assert.notEqual(fingerprint(core), fingerprint(rpg), 'core and rpg images must differ');
        assert.notEqual(fingerprint(core), fingerprint(owner), 'core and owner images must differ');
        assert.notEqual(fingerprint(rpg), fingerprint(owner), 'rpg and owner images must differ');
    });

    it('caches the buffer so repeated calls return the same object', async () => {
        const first = await loadMenuImage('ai');
        const second = await loadMenuImage('ai');
        assert.equal(first, second, 'menu image buffers must be cached');
    });

    it('produces a valid PNG signature for every category', async () => {
        const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        for (const key of ['core', 'rpg', 'ai', 'fun', 'group', 'owner', 'other']) {
            const buffer = await readFile(join(IMAGE_DIR, `${key}.png`));
            assert.ok(buffer.subarray(0, 8).equals(signature), `${key}.png must be a real PNG`);
        }
    });
});
