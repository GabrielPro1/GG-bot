import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { createAuthState } from './auth.js';
import { registerMessageLogger } from '../../handler.js';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const NON_RECOVERABLE_REASONS = new Set([
    DisconnectReason.loggedOut,
    DisconnectReason.forbidden,
    DisconnectReason.connectionReplaced,
    DisconnectReason.multideviceMismatch,
]);
let reconnectAttempts = 0;
let activeOptions;
function getDisconnectStatusCode(error) {
    return error instanceof Boom ? error.output.statusCode : undefined;
}
function scheduleReconnect(statusCode) {
    if (!activeOptions)
        return;
    if (statusCode !== undefined && NON_RECOVERABLE_REASONS.has(statusCode)) {
        console.error(`GG Bot disconnected permanently (code ${statusCode}). Not reconnecting.`);
        if (statusCode === DisconnectReason.loggedOut) {
            console.error('Session logged out. Remove the ./auth folder to link a new device.');
        }
        return;
    }
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`GG Bot gave up reconnecting after ${MAX_RECONNECT_ATTEMPTS} attempts.`);
        return;
    }
    reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
    console.log(`GG Bot disconnected (code ${statusCode ?? 'unknown'}). Reconnecting in ${delay}ms ` +
        `(attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    setTimeout(() => {
        void connectWhatsApp(activeOptions);
    }, delay);
}
export async function connectWhatsApp(options) {
    activeOptions = options;
    const logger = pino({ level: options.logLevel ?? 'warn' });
    const { state, saveCreds } = await createAuthState();
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.appropriate('GG Bot'),
        logger,
    });
    options.identityService.setLidPnResolver(sock.signalRepository.lidMapping);
    sock.ev.on('lid-mapping.update', (mapping) => {
        options.identityService.recordLidPnMapping(mapping);
    });
    sock.ev.on('creds.update', saveCreds);
    registerMessageLogger(sock, options.identityService, options.dispatcher, options.ai);
    sock.ev.on('connection.update', (update) => {
        if (update.qr) {
            console.log('Scan this QR code with WhatsApp > Linked devices:');
            qrcode.generate(update.qr, { small: true });
        }
        if (update.connection === 'open') {
            reconnectAttempts = 0;
            console.log('GG Bot connected.');
        }
        if (update.connection === 'close') {
            scheduleReconnect(getDisconnectStatusCode(update.lastDisconnect?.error));
        }
    });
    return sock;
}
