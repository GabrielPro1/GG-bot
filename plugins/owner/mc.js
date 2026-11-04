import { loadRconConfigFromEnv } from '../../lib/minecraft/config.js';
import { normalizeRconCommand, RconError, sendRconCommand } from '../../lib/minecraft/rcon.js';

const MAX_REPLY_LENGTH = 3500;
const DEFAULT_RCON = {
    loadConfig: loadRconConfigFromEnv,
    send: sendRconCommand,
};

function errorMessage(error) {
    const code = error instanceof RconError ? error.code : null;
    switch (code) {
        case 'not_configured':
            return '⚠️ RCON non configurato. Imposta MC_RCON_PASSWORD nel file .env e abilita RCON nel server.';
        case 'auth_failed':
            return '❌ Password RCON errata. Controlla MC_RCON_PASSWORD e rcon.password nel server.properties.';
        case 'timeout':
            return '❌ Il server Minecraft non ha risposto in tempo. Controlla che sia online e che RCON sia abilitato.';
        case 'connection_failed':
            return '❌ Non riesco a connettermi alla console RCON. Controlla MC_RCON_HOST, MC_RCON_PORT e che il server sia acceso.';
        case 'connection_closed':
            return '❌ Il server ha chiuso la connessione RCON. Se hai eseguito /stop è normale; altrimenti controlla il server.';
        case 'empty_command':
            return '⚠️ Uso: /mc <comando>\nEsempio: /mc list';
        case 'invalid_command':
            return `❌ Comando non valido: ${error.message}`;
        case 'protocol_error':
            return '❌ Il server ha inviato una risposta RCON non valida.';
        default:
            return '❌ Errore imprevisto nella comunicazione con il server Minecraft.';
    }
}

function truncate(text) {
    if (text.length <= MAX_REPLY_LENGTH) {
        return text;
    }
    return `${text.slice(0, MAX_REPLY_LENGTH - 1)}…`;
}

export async function executeMcCommand({ args = [], reply, rcon = DEFAULT_RCON } = {}) {
    const raw = Array.isArray(args) ? args.join(' ') : String(args ?? '');
    let command;
    try {
        command = normalizeRconCommand(raw);
    }
    catch (error) {
        await reply(errorMessage(error));
        return;
    }

    let config;
    try {
        config = rcon.loadConfig();
    }
    catch (error) {
        console.error('[mc] config failed:', error instanceof Error ? error.message : error);
        await reply('❌ Configurazione RCON non valida.');
        return;
    }
    if (!config) {
        await reply(errorMessage(new RconError('not_configured', 'RCON non configurato.')));
        return;
    }

    try {
        const response = await rcon.send(command, config);
        const body = String(response ?? '').trim();
        const lines = [
            '🎮 *Console Minecraft*',
            `> ${command}`,
            '',
            body.length > 0 ? truncate(body) : '✅ Comando eseguito (nessuna risposta).',
        ];
        await reply(lines.join('\n'));
    }
    catch (error) {
        const code = error instanceof RconError ? error.code : 'unexpected';
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[mc] RCON command failed (${code}): ${detail}`);
        await reply(errorMessage(error));
    }
}

export default {
    name: 'mc',
    category: 'owner',
    emoji: '🎮',
    ownerOnly: true,
    description: 'Invia un comando alla console del server Minecraft (RCON)',
    execute: executeMcCommand,
};
