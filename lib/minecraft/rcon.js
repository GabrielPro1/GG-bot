import net from 'node:net';
import { loadRconConfigFromEnv } from './config.js';

export const RCON_PACKET_TYPE = Object.freeze({
    RESPONSE_VALUE: 0,
    COMMAND: 2,
    AUTH_RESPONSE: 2,
    AUTH: 3,
});

const MAX_PACKET_LENGTH = 4 * 1024 * 1024;
const MAX_RESPONSE_LENGTH = 200_000;
const RESPONSE_IDLE_MS = 100;

export class RconError extends Error {
    code;

    constructor(code, message) {
        super(message);
        this.name = 'RconError';
        this.code = code;
    }
}

function encodePacket(id, type, body = '') {
    const payload = Buffer.from(String(body), 'utf8');
    const length = 4 + 4 + payload.length + 2;
    const buffer = Buffer.allocUnsafe(4 + length);
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
    if (length < 10 || length > MAX_PACKET_LENGTH) {
        throw new RconError('protocol_error', 'Il server ha inviato un pacchetto RCON non valido.');
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

/**
 * Normalizza un comando scritto in chat.
 *
 * RCON accetta i comandi senza lo slash iniziale, ma i comandi WorldEdit
 * iniziano con due slash: in quel caso il doppio slash va conservato.
 */
export function normalizeRconCommand(value) {
    const raw = String(value ?? '');
    if (/[\0\r\n]/.test(raw)) {
        throw new RconError('invalid_command', 'il comando non può contenere a capo o caratteri di controllo.');
    }
    let command = raw.trim();
    if (command.startsWith('/') && !command.startsWith('//')) {
        command = command.slice(1).trim();
    }
    if (command.length === 0) {
        throw new RconError('empty_command', 'inserisci un comando da inviare alla console.');
    }
    if (command.length > 1000) {
        throw new RconError('invalid_command', 'il comando è troppo lungo (massimo 1000 caratteri).');
    }
    return command;
}

/**
 * Invia un comando al server Minecraft via RCON e restituisce la risposta.
 *
 * Apre una connessione per ogni comando: è semplice e evita di tenere uno
 * stato di connessione da riconnettere. Il server e il bot devono stare sulla
 * stessa macchina (o su una rete fidata), perché RCON viaggia in chiaro.
 */
export async function sendRconCommand(command, options = {}) {
    const config = options.config ?? loadRconConfigFromEnv();
    if (!config) {
        throw new RconError('not_configured', 'RCON non configurato: imposta MC_RCON_PASSWORD.');
    }
    const normalized = normalizeRconCommand(command);

    return new Promise((resolve, reject) => {
        let socket;
        let buffer = Buffer.alloc(0);
        let response = '';
        let settled = false;
        let authenticated = false;
        let receivedResponse = false;
        let commandId = 0;
        let idleTimer;
        let timeout;

        function cleanup() {
            clearTimeout(timeout);
            if (idleTimer) {
                clearTimeout(idleTimer);
            }
            socket?.destroy();
        }

        function fail(error) {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(error instanceof RconError
                ? error
                : new RconError('connection_failed', 'Connessione RCON fallita.'));
        }

        function succeed() {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(response);
        }

        function scheduleIdle() {
            if (idleTimer) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(succeed, RESPONSE_IDLE_MS);
            idleTimer.unref?.();
        }

        function handlePacket(packet) {
            if (packet.type === RCON_PACKET_TYPE.AUTH_RESPONSE) {
                if (packet.id === -1) {
                    fail(new RconError('auth_failed', 'Password RCON errata.'));
                    return;
                }
                if (authenticated) {
                    return;
                }
                authenticated = true;
                commandId = packet.id === 0x7fffffff ? 1 : Math.max(1, packet.id + 1);
                socket.write(encodePacket(commandId, RCON_PACKET_TYPE.COMMAND, normalized));
                return;
            }
            if (packet.type === RCON_PACKET_TYPE.RESPONSE_VALUE) {
                if (packet.id === -1) {
                    fail(new RconError('auth_failed', 'Password RCON errata.'));
                    return;
                }
                if (!authenticated || packet.id !== commandId) {
                    return;
                }
                receivedResponse = true;
                if (response.length < MAX_RESPONSE_LENGTH) {
                    response += packet.body.slice(0, MAX_RESPONSE_LENGTH - response.length);
                }
                scheduleIdle();
            }
        }

        try {
            socket = net.createConnection({ host: config.host, port: config.port });
        }
        catch (error) {
            fail(new RconError('connection_failed', `Connessione RCON fallita: ${error instanceof Error ? error.message : error}`));
            return;
        }

        timeout = setTimeout(() => {
            fail(new RconError('timeout', 'Il server Minecraft non ha risposto in tempo.'));
        }, config.timeoutMs);
        timeout.unref?.();

        socket.setNoDelay(true);
        socket.on('connect', () => {
            const authId = Math.floor(Math.random() * 0x7fffffff) || 1;
            socket.write(encodePacket(authId, RCON_PACKET_TYPE.AUTH, config.password));
        });
        socket.on('data', (chunk) => {
            if (settled) {
                return;
            }
            buffer = Buffer.concat([buffer, chunk]);
            try {
                for (;;) {
                    const packet = readPacket(buffer);
                    if (!packet) {
                        break;
                    }
                    buffer = packet.rest;
                    handlePacket(packet);
                    if (settled) {
                        break;
                    }
                }
            }
            catch (error) {
                fail(error);
            }
        });
        socket.on('error', (error) => {
            fail(new RconError('connection_failed', `Connessione RCON fallita: ${error.message}`));
        });
        socket.on('close', () => {
            if (settled) {
                return;
            }
            if (receivedResponse) {
                succeed();
            }
            else {
                fail(new RconError('connection_closed', 'Il server ha chiuso la connessione RCON.'));
            }
        });
    });
}
