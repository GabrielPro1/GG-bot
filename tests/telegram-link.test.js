import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { SessionManager } from '../lib/whatsapp/session-manager.js';
import { TelegramLinker, QR_INSTRUCTIONS, SUCCESS_TEXT, } from '../lib/telegram/link.js';
function makeStubFactory() {
    const factory = async () => {
        const stub = {
            ev: new EventEmitter(),
            logout: async () => undefined,
            end: async () => undefined,
        };
        return stub;
    };
    return factory;
}
function emit(manager, userId, update) {
    const sock = manager.getSession(userId);
    sock.ev.emit('connection.update', update);
}
function makeChat() {
    const record = { texts: [], images: [] };
    const chat = {
        ...record,
        sendText: async (t) => {
            record.texts.push(t);
        },
        sendQr: async (b) => {
            record.images.push(b);
        },
    };
    return { chat };
}
function makeLinker(manager, timeoutMs = 60_000) {
    const rendered = [];
    const linker = new TelegramLinker({
        sessionManager: manager,
        timeoutMs,
        qrToPng: async (qr) => {
            rendered.push(qr);
            return Buffer.from('png-' + qr);
        },
    });
    return { linker, rendered };
}
test('start + onQr sends a PNG (never the raw QR as text)', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker, rendered } = makeLinker(manager);
    const { chat } = makeChat();
    await linker.start('123', chat);
    emit(manager, '123', { connection: 'connecting', qr: 'RAW-QR-STRING' });
    await sleep(5);
    assert.equal(chat.images.length, 1);
    assert.deepEqual(chat.images[0].toString(), 'png-RAW-QR-STRING');
    assert.deepEqual(rendered, ['RAW-QR-STRING']);
    assert.ok(!chat.texts.some((t) => t.includes('RAW-QR-STRING')));
});
test('onOpen sends success text and settles the run', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker } = makeLinker(manager);
    const { chat } = makeChat();
    await linker.start('123', chat);
    emit(manager, '123', { connection: 'open' });
    assert.ok(chat.texts.includes(SUCCESS_TEXT));
    assert.equal(linker.isLinking('123'), false);
    assert.equal(manager.hasSession('123'), true);
});
test('start refuses a second link while one is in progress', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker } = makeLinker(manager);
    const { chat } = makeChat();
    await linker.start('123', chat);
    await linker.start('123', chat);
    assert.ok(chat.texts.some((t) => t.includes('già in corso')));
});
test('start refuses when a session already exists for the user (no duplicate socket)', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker } = makeLinker(manager);
    const { chat } = makeChat();
    await linker.start('555', chat);
    emit(manager, '555', { connection: 'open' });
    // session now exists and is open
    await linker.start('555', chat);
    assert.ok(chat.texts.some((t) => t.includes('già collegato')));
    assert.equal(manager.size, 1);
});
test('timeout closes the session and informs the user (no orphan)', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker } = makeLinker(manager, 20);
    const { chat } = makeChat();
    await linker.start('999', chat);
    await sleep(60);
    assert.ok(chat.texts.some((t) => t.includes('Tempo scaduto')));
    assert.equal(manager.hasSession('999'), false);
    assert.equal(linker.isLinking('999'), false);
});
test('connection close before completion informs the user', async () => {
    const manager = new SessionManager({ socketFactory: makeStubFactory() });
    const { linker } = makeLinker(manager);
    const { chat } = makeChat();
    await linker.start('777', chat);
    emit(manager, '777', { connection: 'close' });
    assert.ok(chat.texts.some((t) => t.includes('Connessione chiusa')));
});
test('QR instructions message is exposed for the Telegram caption', () => {
    assert.ok(QR_INSTRUCTIONS.includes('Scansiona questo QR'));
});
