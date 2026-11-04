import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { loadRconConfigFromEnv } from '../lib/minecraft/config.js';
import { normalizeRconCommand, RconError, sendRconCommand } from '../lib/minecraft/rcon.js';

function encodePacket(id, type, body = '') {
    const payload = Buffer.from(body, 'utf8');
    const length = 4 + 4 + payload.length + 2;
    const buffer = Buffer.alloc(4 + length);
    buffer.writeInt32LE(length, 0);
    buffer.writeInt32LE(id, 4);
    buffer.writeInt32LE(type, 8);
    payload.copy(buffer, 12);
    buffer.writeUInt8(0, 12 + payload.length);
    buffer.writeUInt8(0, 13 + payload.length);
    return buffer;
}

function readPacket(buffer) {
    if (buffer.length < 4) {
        return null;
    }
    const length = buffer.readInt32LE(0);
    if (length < 10) {
        throw new Error('pacchetto di test non valido');
    }
    if (buffer.length < 4 + length) {
        return null;
    }
    const packet = buffer.subarray(4, 4 + length);
    return {
        id: packet.readInt32LE(0),
        type: packet.readInt32LE(4),
        body: packet.subarray(8).toString('utf8').replace(/\0+$/g, ''),
        rest: buffer.subarray(4 + length),
    };
}

async function withServer(onPacket, run) {
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        let buffer = Buffer.alloc(0);
        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            for (;;) {
                const packet = readPacket(buffer);
                if (!packet) {
                    break;
                }
                buffer = packet.rest;
                onPacket(socket, packet);
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    try {
        await run(port);
    }
    finally {
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise((resolve) => server.close(resolve));
    }
}

function makeHandler({ password = 'secret', response = 'ok', parts = null } = {}) {
    return (socket, packet) => {
        if (packet.type === 3) {
            if (packet.body !== password) {
                socket.write(encodePacket(-1, 2, ''));
                return;
            }
            socket.write(encodePacket(packet.id, 2, ''));
            socket.write(encodePacket(packet.id, 0, ''));
            return;
        }
        if (packet.type === 2) {
            const chunks = parts ?? [response];
            for (const [index, chunk] of chunks.entries()) {
                if (index === 0) {
                    socket.write(encodePacket(packet.id, 0, chunk));
                }
                else {
                    setTimeout(() => socket.write(encodePacket(packet.id, 0, chunk)), 15);
                }
            }
        }
    };
}

function configFor(port, overrides = {}) {
    return {
        host: '127.0.0.1',
        port,
        password: 'secret',
        timeoutMs: 1000,
        ...overrides,
    };
}

describe('RCON', () => {
    it('autentica e restituisce la risposta del server', async () => {
        await withServer(makeHandler({ response: 'There are 0 of a max of 20 players online' }), async (port) => {
            const response = await sendRconCommand('/list', { config: configFor(port) });
            assert.equal(response, 'There are 0 of a max of 20 players online');
        });
    });

    it('concatena le risposte divise in più pacchetti', async () => {
        await withServer(makeHandler({ parts: ['Hello ', 'world'] }), async (port) => {
            const response = await sendRconCommand('say hi', { config: configFor(port) });
            assert.equal(response, 'Hello world');
        });
    });

    it('gestisce un comando senza output', async () => {
        await withServer(makeHandler({ response: '' }), async (port) => {
            const response = await sendRconCommand('say hi', { config: configFor(port) });
            assert.equal(response, '');
        });
    });

    it('segnala la password errata', async () => {
        await withServer(makeHandler({ password: 'giusta' }), async (port) => {
            await assert.rejects(
                sendRconCommand('list', { config: configFor(port, { password: 'sbagliata' }) }),
                (error) => error instanceof RconError && error.code === 'auth_failed',
            );
        });
    });

    it('va in timeout se il server non risponde', async () => {
        await withServer(() => {}, async (port) => {
            await assert.rejects(
                sendRconCommand('list', { config: configFor(port, { timeoutMs: 200 }) }),
                (error) => error instanceof RconError && error.code === 'timeout',
            );
        });
    });

    it('segnala la connessione rifiutata', async () => {
        let port;
        await withServer(() => {}, async (closedPort) => {
            port = closedPort;
        });
        await assert.rejects(
            sendRconCommand('list', { config: configFor(port) }),
            (error) => error instanceof RconError && error.code === 'connection_failed',
        );
    });
});

describe('normalizeRconCommand', () => {
    it('toglie lo slash iniziale dei comandi normali', () => {
        assert.equal(normalizeRconCommand('/say ciao'), 'say ciao');
        assert.equal(normalizeRconCommand('  /list  '), 'list');
    });

    it('conserva il doppio slash dei comandi WorldEdit', () => {
        assert.equal(normalizeRconCommand('//set stone'), '//set stone');
    });

    it('rifiuta i comandi vuoti', () => {
        assert.throws(
            () => normalizeRconCommand('   '),
            (error) => error instanceof RconError && error.code === 'empty_command',
        );
    });

    it('rifiuta newline e caratteri di controllo', () => {
        assert.throws(
            () => normalizeRconCommand('say\nop'),
            (error) => error instanceof RconError && error.code === 'invalid_command',
        );
    });

    it('rifiuta i comandi troppo lunghi', () => {
        assert.throws(
            () => normalizeRconCommand('a'.repeat(1001)),
            (error) => error instanceof RconError && error.code === 'invalid_command',
        );
    });
});

describe('configurazione RCON', () => {
    it('usa i valori predefiniti', () => {
        assert.deepEqual(loadRconConfigFromEnv({ MC_RCON_PASSWORD: 'secret' }), {
            host: '127.0.0.1',
            port: 25575,
            password: 'secret',
            timeoutMs: 5000,
        });
    });

    it('restituisce null se la password manca o è vuota', () => {
        assert.equal(loadRconConfigFromEnv({}), null);
        assert.equal(loadRconConfigFromEnv({ MC_RCON_PASSWORD: '   ' }), null);
    });

    it('accetta host, porta e timeout personalizzati', () => {
        assert.deepEqual(loadRconConfigFromEnv({
            MC_RCON_HOST: '10.0.0.5',
            MC_RCON_PORT: '25576',
            MC_RCON_PASSWORD: 'secret',
            MC_RCON_TIMEOUT_MS: '1500',
        }), {
            host: '10.0.0.5',
            port: 25576,
            password: 'secret',
            timeoutMs: 1500,
        });
    });

    it('ignora porta e timeout non validi', () => {
        const config = loadRconConfigFromEnv({
            MC_RCON_PASSWORD: 'secret',
            MC_RCON_PORT: '99999',
            MC_RCON_TIMEOUT_MS: '10',
        });
        assert.equal(config.port, 25575);
        assert.equal(config.timeoutMs, 5000);
    });

    it('mantiene la password così com’è', () => {
        const config = loadRconConfigFromEnv({ MC_RCON_PASSWORD: '  secret  ' });
        assert.equal(config.password, '  secret  ');
    });
});
