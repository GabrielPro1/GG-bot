import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from '../lib/whatsapp/session-manager.js';
import { TelegramLinker } from '../lib/telegram/link.js';
function makeStubFactory() {
    const factory = async () => {
        const stub = {
            ev: new EventEmitter(),
            logoutCalls: 0,
            endCalls: 0,
            async logout() {
                stub.logoutCalls += 1;
            },
            async end() {
                stub.endCalls += 1;
            },
        };
        return stub;
    };
    return factory;
}
async function tempAuthDir() {
    return mkdtemp(path.join(os.tmpdir(), 'ggbot-auth-'));
}
async function exists(p) {
    try {
        await stat(p);
        return true;
    }
    catch {
        return false;
    }
}
async function seedAuthFiles(authRoot, userId) {
    const folder = path.join(authRoot, userId);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'creds.json'), '{}');
    return folder;
}
test('deleteSession deletes the auth folder and closes the active socket', async () => {
    const authRoot = await tempAuthDir();
    try {
        const folder = await seedAuthFiles(authRoot, 'alice');
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        const session = await manager.createSession('alice');
        const sock = session.sock;
        const result = await manager.deleteSession('alice');
        assert.equal(result, true);
        assert.equal(await exists(folder), false);
        assert.equal(manager.hasSession('alice'), false);
        assert.equal(sock.logoutCalls, 1);
        assert.equal(sock.endCalls, 1);
        assert.equal(await exists(authRoot), true, 'global auth root must be preserved');
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
test('deleteSession for A does not touch B or the auth root', async () => {
    const authRoot = await tempAuthDir();
    try {
        const folderA = await seedAuthFiles(authRoot, 'alice');
        const folderB = await seedAuthFiles(authRoot, 'bob');
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        await manager.createSession('alice');
        await manager.createSession('bob');
        const result = await manager.deleteSession('alice');
        assert.equal(result, true);
        assert.equal(await exists(folderA), false);
        assert.equal(await exists(folderB), true);
        assert.equal(manager.hasSession('bob'), true);
        assert.equal(await exists(authRoot), true);
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
test('nonexistent session returns false (and never deletes the auth root)', async () => {
    const authRoot = await tempAuthDir();
    try {
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        const result = await manager.deleteSession('nobody');
        assert.equal(result, false);
        assert.equal(await exists(authRoot), true);
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
test('reconnect does not recreate a session after deleteSession', async () => {
    const authRoot = await tempAuthDir();
    try {
        await seedAuthFiles(authRoot, 'alice');
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        const session = await manager.createSession('alice');
        await manager.deleteSession('alice');
        assert.equal(manager.hasSession('alice'), false);
        // A late connection.update.close must NOT schedule a reconnect
        session.sock.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: new Error('x'), date: new Date() },
        });
        assert.equal(session.reconnectAttempts, 0);
        assert.equal(manager.hasSession('alice'), false);
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
test('already-disconnected session with leftover files is still deleted', async () => {
    const authRoot = await tempAuthDir();
    try {
        const folder = await seedAuthFiles(authRoot, 'carol');
        // no active socket for carol at all
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        const result = await manager.deleteSession('carol');
        assert.equal(result, true);
        assert.equal(await exists(folder), false);
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
test('TelegramLinker.deleteSession clears linking state', async () => {
    const authRoot = await tempAuthDir();
    try {
        await seedAuthFiles(authRoot, 'dave');
        const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
        const linker = new TelegramLinker({
            sessionManager: manager,
            qrToPng: async (qr) => Buffer.from(qr),
        });
        const { chat } = makeChat();
        await linker.start('987', chat);
        assert.equal(linker.isLinking('987'), true);
        const deleted = await linker.deleteSession('987');
        assert.equal(deleted, true);
        assert.equal(linker.isLinking('987'), false);
    }
    finally {
        await rm(authRoot, { recursive: true, force: true });
    }
});
function makeChat() {
    const chat = {
        sendText: async () => undefined,
        sendQr: async () => undefined,
    };
    return { chat };
}
