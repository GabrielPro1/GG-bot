import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mc, { executeMcCommand } from '../plugins/owner/mc.js';
import { RconError } from '../lib/minecraft/rcon.js';

const CONFIG = {
    host: '127.0.0.1',
    port: 25575,
    password: 'secret',
    timeoutMs: 1000,
};

function makeRcon({ config = CONFIG, response = 'ok', error = null } = {}) {
    const calls = [];
    return {
        calls,
        loadConfig: () => config,
        send: async (command, cfg) => {
            calls.push({ command, cfg });
            if (error) {
                throw error;
            }
            return response;
        },
    };
}

async function run({ args = [], rcon = makeRcon() } = {}) {
    const replies = [];
    await executeMcCommand({
        args,
        rcon,
        reply: async (text) => {
            replies.push(text);
        },
    });
    return { text: replies.join('\n'), rcon };
}

describe('/mc', () => {
    it('è owner-only e vive nella categoria owner', () => {
        assert.equal(mc.name, 'mc');
        assert.equal(mc.ownerOnly, true);
        assert.equal(mc.category, 'owner');
    });

    it('mostra l’uso se non riceve un comando', async () => {
        const { text, rcon } = await run({ args: [] });
        assert.match(text, /Uso: \/mc/);
        assert.equal(rcon.calls.length, 0);
    });

    it('avvisa se RCON non è configurato', async () => {
        const rcon = makeRcon({ config: null });
        const { text } = await run({ args: ['list'], rcon });
        assert.match(text, /non configurato/);
        assert.equal(rcon.calls.length, 0);
    });

    it('invia il comando e mostra la risposta', async () => {
        const rcon = makeRcon({ response: 'There are 0 of a max of 20 players online' });
        const { text } = await run({ args: ['list'], rcon });
        assert.match(text, /> list/);
        assert.match(text, /There are 0 of a max of 20 players online/);
        assert.equal(rcon.calls.length, 1);
        assert.equal(rcon.calls[0].command, 'list');
        assert.deepEqual(rcon.calls[0].cfg, CONFIG);
    });

    it('toglie lo slash iniziale prima di inviare il comando', async () => {
        const { rcon } = await run({ args: ['/say', 'ciao'] });
        assert.equal(rcon.calls[0].command, 'say ciao');
    });

    it('conserva il doppio slash dei comandi WorldEdit', async () => {
        const { rcon } = await run({ args: ['//set', 'stone'] });
        assert.equal(rcon.calls[0].command, '//set stone');
    });

    it('gestisce un comando senza risposta', async () => {
        const { text } = await run({ args: ['say', 'hi'], rcon: makeRcon({ response: '' }) });
        assert.match(text, /nessuna risposta/);
    });

    it('traduce la password RCON errata', async () => {
        const rcon = makeRcon({ error: new RconError('auth_failed', 'password errata') });
        const { text } = await run({ args: ['list'], rcon });
        assert.match(text, /Password RCON errata/);
    });

    it('traduce il timeout', async () => {
        const rcon = makeRcon({ error: new RconError('timeout', 'nessuna risposta') });
        const { text } = await run({ args: ['list'], rcon });
        assert.match(text, /non ha risposto in tempo/);
    });

    it('traduce la connessione chiusa', async () => {
        const rcon = makeRcon({ error: new RconError('connection_closed', 'chiusa') });
        const { text } = await run({ args: ['list'], rcon });
        assert.match(text, /chiuso la connessione RCON/);
    });

    it('rifiuta comandi con newline', async () => {
        const rcon = makeRcon();
        const { text } = await run({ args: ['say\nop'], rcon });
        assert.match(text, /non valido/);
        assert.equal(rcon.calls.length, 0);
    });

    it('tronca le risposte troppo lunghe', async () => {
        const { text } = await run({
            args: ['list'],
            rcon: makeRcon({ response: 'x'.repeat(5000) }),
        });
        assert.ok(text.length < 4000);
        assert.match(text, /…/);
    });
});
