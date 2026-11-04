const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 25575;
const DEFAULT_TIMEOUT_MS = 5000;

function readInteger(raw, fallback, min, max) {
    const value = Number.parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(value) || value < min || value > max) {
        return fallback;
    }
    return value;
}

/**
 * Legge la configurazione RCON dall'ambiente.
 *
 * Ritorna null se la password non è impostata: il comando /mc resta
 * registrato, ma risponde con un avviso invece di provare a connettersi.
 */
export function loadRconConfigFromEnv(env = process.env) {
    const password = typeof env.MC_RCON_PASSWORD === 'string' ? env.MC_RCON_PASSWORD : '';
    if (password.trim().length === 0) {
        return null;
    }
    const host = String(env.MC_RCON_HOST ?? '').trim() || DEFAULT_HOST;
    return {
        host,
        port: readInteger(env.MC_RCON_PORT, DEFAULT_PORT, 1, 65535),
        password,
        timeoutMs: readInteger(env.MC_RCON_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 500, 60000),
    };
}
