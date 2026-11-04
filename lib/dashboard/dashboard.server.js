import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { DASHBOARD_HTML } from './dashboard.page.js';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';

const SECURITY_HEADERS = {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
};

function normalizeToken(raw) {
    const token = typeof raw === 'string' ? raw.trim() : '';
    return token.length > 0 ? token : '';
}

function parsePort(raw, fallback) {
    if (raw === undefined || raw === null || raw === '') {
        return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 65_535) {
        return fallback;
    }
    return value;
}

function urlHost(host) {
    if (host === '0.0.0.0' || host === '::' || host === '[::]') {
        return 'localhost';
    }
    if (host.includes(':') && !host.startsWith('[')) {
        return `[${host}]`;
    }
    return host;
}

function bearerToken(request) {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
        return '';
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1]?.trim() ?? '';
}

function tokenMatches(expected, provided) {
    if (!expected || !provided) {
        return false;
    }
    const expectedHash = createHash('sha256').update(expected).digest();
    const providedHash = createHash('sha256').update(provided).digest();
    return timingSafeEqual(expectedHash, providedHash);
}

function send(response, statusCode, contentType, body, headOnly = false) {
    const payload = Buffer.from(body, 'utf8');
    response.writeHead(statusCode, {
        ...SECURITY_HEADERS,
        'Content-Type': contentType,
        'Content-Length': payload.byteLength,
    });
    if (headOnly) {
        response.end();
        return;
    }
    response.end(payload);
}

function sendJson(response, statusCode, value, headOnly = false) {
    send(response, statusCode, 'application/json; charset=utf-8', JSON.stringify(value), headOnly);
}

async function handleRequest(request, response, service, token, logger) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD' });
        response.end();
        return;
    }
    const headOnly = method === 'HEAD';
    let pathname;
    try {
        pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    }
    catch {
        sendJson(response, 400, { error: 'bad_request' }, headOnly);
        return;
    }

    if (pathname === '/' || pathname === '/index.html') {
        send(response, 200, 'text/html; charset=utf-8', DASHBOARD_HTML, headOnly);
        return;
    }
    if (pathname === '/favicon.ico') {
        response.writeHead(204, SECURITY_HEADERS);
        response.end();
        return;
    }
    if (pathname === '/api/stats') {
        if (!tokenMatches(token, bearerToken(request))) {
            sendJson(response, 401, { error: 'unauthorized' }, headOnly);
            return;
        }
        try {
            const snapshot = await service.getSnapshot();
            sendJson(response, 200, snapshot, headOnly);
        }
        catch (error) {
            logger.error('[dashboard] failed to build stats:', error);
            sendJson(response, 500, { error: 'internal_error' }, headOnly);
        }
        return;
    }
    send(response, 404, 'text/plain; charset=utf-8', 'Not found', headOnly);
}

function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

/**
 * Avvia la dashboard web. La password è obbligatoria: senza
 * DASHBOARD_PASSWORD (o DASHBOARD_TOKEN come fallback) la dashboard non parte.
 * Ritorna null se non può partire.
 */
export async function startDashboardServer(options = {}) {
    const service = options.service ?? options.dashboard;
    if (!service || typeof service.getSnapshot !== 'function') {
        throw new Error('dashboard service with getSnapshot() is required');
    }
    const token = normalizeToken(
        options.token ?? process.env.DASHBOARD_PASSWORD ?? process.env.DASHBOARD_TOKEN,
    );
    const host = (options.host ?? process.env.DASHBOARD_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
    const requestedPort = parsePort(options.port ?? process.env.DASHBOARD_PORT, DEFAULT_PORT);
    const logger = options.logger ?? console;

    if (!token) {
        const info = {
            enabled: false,
            authRequired: false,
            url: null,
            host,
            port: requestedPort,
            reason: 'token_required',
        };
        service.setWebInfo?.(info);
        logger.warn('[dashboard] DASHBOARD_PASSWORD non impostata: dashboard disattivata.');
        return null;
    }

    const server = createServer((request, response) => {
        void handleRequest(request, response, service, token, logger).catch((error) => {
            logger.error('[dashboard] request failed:', error);
            if (!response.headersSent) {
                sendJson(response, 500, { error: 'internal_error' });
            }
            else {
                response.destroy();
            }
        });
    });

    try {
        await listen(server, requestedPort, host);
    }
    catch (error) {
        service.setWebInfo?.({
            enabled: false,
            authRequired: true,
            url: null,
            host,
            port: requestedPort,
            reason: 'listen_failed',
        });
        throw error;
    }

    const address = server.address();
    const actualPort = typeof address === 'object' && address !== null ? address.port : requestedPort;
    const url = `http://${urlHost(host)}:${actualPort}`;
    const info = {
        enabled: true,
        authRequired: true,
        url,
        host,
        port: actualPort,
        reason: null,
    };
    service.setWebInfo?.(info);
    logger.log(`[dashboard] web dashboard attiva su ${url} (password richiesta)`);

    return {
        url,
        host,
        port: actualPort,
        server,
        async stop() {
            if (!server.listening) {
                return;
            }
            server.closeIdleConnections?.();
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
}
