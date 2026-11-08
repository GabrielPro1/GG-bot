import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mc, { executeMcCommand } from '../plugins/owner/mc.js';
import { RconError } from '../lib/minecraft/rcon.js';
import { CommandDispatcher } from '../lib/commands/dispatcher.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { OwnerService } from '../config.js';

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

async function run({ args = [], rcon = makeRcon(), isOwner = true } = {}) {
    const replies = [];
    await executeMcCommand({
        args,
        rcon,
        isOwner,
        reply: async (text) => {
            replies.push(text);
        },
    });
    return { text: replies.join('\n'), rcon };
}

describe('/mc', () => {
    it('vive nella categoria owner ma non è bloccato dal dispatcher', () => {
        assert.equal(mc.name, 'mc');
        assert.equal(mc.ownerOnly, false);
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

    it('permette /mc list anche ai non owner', async () => {
        const rcon = makeRcon({ response: 'There are 2 of a max of 20 players online' });
        const { text } = await run({ args: ['list'], rcon, isOwner: false });
        assert.match(text, /There are 2/);
        assert.equal(rcon.calls.length, 1);
        assert.equal(rcon.calls[0].command, 'list');
    });

    it('permette le varianti di list ai non owner', async () => {
        const rcon = makeRcon({ response: 'players' });
        const { text } = await run({ args: ['list', 'uuids'], rcon, isOwner: false });
        assert.match(text, /players/);
        assert.equal(rcon.calls[0].command, 'list uuids');
    });

    it('blocca i comandi diversi da list per i non owner', async () => {
        const rcon = makeRcon();
        const { text } = await run({ args: ['say', 'ciao'], rcon, isOwner: false });
        assert.match(text, /Solo gli owner/);
        assert.equal(rcon.calls.length, 0);
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

describe('/mc tramite dispatcher', () => {
    const owner = { pn: 'owner@s.whatsapp.net' };
    const nonOwner = { pn: 'altro@s.whatsapp.net' };

    function build() {
        const registry = new CommandRegistry();
        registry.register(mc);
        const ownerService = new OwnerService({ owners: ['owner@s.whatsapp.net'] });
        return new CommandDispatcher(registry, {}, ownerService);
    }

    async function dispatch(dispatcher, text, identity, rcon) {
        const replies = [];
        await dispatcher.handle(text, {
            identity,
            rcon,
            reply: async (replyText) => {
                replies.push(replyText);
            },
        });
        return replies.join('\n');
    }

    it('esegue /mc list per un non owner', async () => {
        const rcon = makeRcon({ response: 'There are 1 of a max of 20 players online' });
        const text = await dispatch(build(), '/mc list', nonOwner, rcon);
        assert.match(text, /There are 1/);
        assert.equal(rcon.calls.length, 1);
    });

    it('blocca /mc say per un non owner', async () => {
        const rcon = makeRcon();
        const text = await dispatch(build(), '/mc say ciao', nonOwner, rcon);
        assert.match(text, /Solo gli owner/);
        assert.equal(rcon.calls.length, 0);
    });

    it('esegue /mc say per un owner', async () => {
        const rcon = makeRcon({ response: 'ok' });
        const text = await dispatch(build(), '/mc say ciao', owner, rcon);
        assert.match(text, /ok/);
        assert.equal(rcon.calls[0].command, 'say ciao');
    });
});
