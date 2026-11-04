import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandLoader } from '../lib/commands/loader.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { PERSONAL_COMMANDS } from '../lib/commands/personal.js';

function writeCommand(directory, fileName, name) {
    const source = `export default { name: '${name}', execute: async () => {} };\n`;
    writeFileSync(join(directory, fileName), source, 'utf8');
}

describe('comandi del branch personal', () => {
    it('include i comandi essenziali', () => {
        for (const name of ['menu', 'sezione', 'ping', 'libri', 'mandapag', 'dashboard', 'nuke', 'mc']) {
            assert.ok(PERSONAL_COMMANDS.has(name), `manca ${name}`);
        }
    });

    it('esclude i comandi pubblici', () => {
        for (const name of ['ai', 'barzelletta', '8ball', 'ruba', 'daily']) {
            assert.equal(PERSONAL_COMMANDS.has(name), false, `${name} non dovrebbe essere attivo`);
        }
    });

    it('il loader registra solo i comandi in allowlist', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'gg-personal-'));
        writeCommand(directory, 'allowed.js', 'ping');
        writeCommand(directory, 'blocked.js', 'ruba');
        const registry = new CommandRegistry();
        const loader = new CommandLoader(registry, { commandsDir: directory });
        try {
            await loader.start();
            assert.equal(registry.get('ping')?.name, 'ping');
            assert.equal(registry.get('ruba'), null);
        }
        finally {
            loader.stop();
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
