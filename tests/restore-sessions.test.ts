import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import { SessionManager } from '../src/whatsapp/session-manager.js';

interface StubSocket {
  ev: EventEmitter;
  logout: () => Promise<void>;
  end: (err: Error | undefined) => Promise<void>;
}

async function tempAuthDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'ggbot-restore-'));
}

async function seedSession(authRoot: string, userId: string): Promise<string> {
  const folder = path.join(authRoot, userId);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'creds.json'), '{"noiseKey":{"private":{}},"signedIdentityKey":{"private":{}},"me":{}}');
  return folder;
}

function makeStubFactory(failFor?: (folder: string) => boolean) {
  const factory = async (authFolder: string) => {
    if (failFor && failFor(authFolder)) {
      throw new Error('boom: ' + authFolder);
    }
    const stub: StubSocket = {
      ev: new EventEmitter(),
      async logout() {
        return undefined;
      },
      async end() {
        return undefined;
      },
    };
    return stub as unknown as WASocket;
  };
  return factory;
}

test('restores a single existing authenticated session', async () => {
  const authRoot = await tempAuthDir();
  try {
    const folder = await seedSession(authRoot, 'alice');
    const created: string[] = [];
    const manager = new SessionManager({
      authRoot,
      socketFactory: makeStubFactory(),
      onSocketCreated: (sock, session) => created.push(session.userId),
    });

    const n = await manager.restoreSessions();

    assert.equal(n, 1);
    assert.equal(manager.hasSession('alice'), true);
    assert.ok(manager.getSession('alice'));
    assert.deepEqual(created, ['alice']);
    assert.equal(folder, manager.authFolderFor('alice'));
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('restores multiple sessions', async () => {
  const authRoot = await tempAuthDir();
  try {
    await seedSession(authRoot, 'alice');
    await seedSession(authRoot, 'bob');
    const created: string[] = [];
    const manager = new SessionManager({
      authRoot,
      socketFactory: makeStubFactory(),
      onSocketCreated: (sock, session) => created.push(session.userId),
    });

    const n = await manager.restoreSessions();

    assert.equal(n, 2);
    assert.equal(manager.size, 2);
    assert.equal(created.length, 2);
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('ignores main ./auth-style files at the auth root (never treated as session)', async () => {
  const authRoot = await tempAuthDir();
  try {
    // main session writes creds.json and other files directly in authRoot
    await writeFile(path.join(authRoot, 'creds.json'), '{"me":{}}');
    await writeFile(path.join(authRoot, 'app-state-sync-key-1.json'), '{}');
    const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });

    const n = await manager.restoreSessions();

    assert.equal(n, 0);
    assert.equal(manager.size, 0);
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('ignores invalid/non-self-sanitizing directories', async () => {
  const authRoot = await tempAuthDir();
  try {
    await mkdir(path.join(authRoot, 'bad dir'), { recursive: true });
    await writeFile(path.join(authRoot, 'bad dir', 'creds.json'), '{}');
    await mkdir(path.join(authRoot, 'weird.name'), { recursive: true });
    await writeFile(path.join(authRoot, 'weird.name', 'creds.json'), '{}');
    const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });

    const n = await manager.restoreSessions();

    assert.equal(n, 0);
    assert.equal(manager.size, 0);
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('does not duplicate a session already present in the map', async () => {
  const authRoot = await tempAuthDir();
  try {
    await seedSession(authRoot, 'u1');
    let socketBuilds = 0;
    const manager = new SessionManager({
      authRoot,
      socketFactory: async () => {
        socketBuilds += 1;
        const stub: StubSocket = {
          ev: new EventEmitter(),
          async logout() {
            return undefined;
          },
          async end() {
            return undefined;
          },
        };
        return stub as unknown as WASocket;
      },
    });

    await manager.createSession('u1');
    const n = await manager.restoreSessions();

    assert.equal(n, 0);
    assert.equal(manager.size, 1);
    assert.equal(socketBuilds, 1, 'no second socket for the same user');
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('a failing session does not block restoring the others', async () => {
  const authRoot = await tempAuthDir();
  try {
    await seedSession(authRoot, 'ok1');
    await seedSession(authRoot, 'bad');
    await seedSession(authRoot, 'ok2');
    const manager = new SessionManager({
      authRoot,
      socketFactory: makeStubFactory((folder) => path.basename(folder) === 'bad'),
    });

    const n = await manager.restoreSessions();

    assert.equal(n, 2);
    assert.equal(manager.hasSession('ok1'), true);
    assert.equal(manager.hasSession('ok2'), true);
    assert.equal(manager.hasSession('bad'), false);
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('restored session receives the message handler (onSocketCreated)', async () => {
  const authRoot = await tempAuthDir();
  try {
    await seedSession(authRoot, 'alice');
    const registeredSockets: WASocket[] = [];
    const manager = new SessionManager({
      authRoot,
      socketFactory: makeStubFactory(),
      onSocketCreated: (sock) => registeredSockets.push(sock),
    });

    await manager.restoreSessions();

    assert.equal(registeredSockets.length, 1);
    assert.equal(registeredSockets[0], manager.getSession('alice'));
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});

test('deleteSession can delete a restored session (folder + socket closed)', async () => {
  const authRoot = await tempAuthDir();
  try {
    const folder = await seedSession(authRoot, 'alice');
    const manager = new SessionManager({ authRoot, socketFactory: makeStubFactory() });
    await manager.restoreSessions();
    assert.equal(manager.hasSession('alice'), true);

    const deleted = await manager.deleteSession('alice');

    assert.equal(deleted, true);
    assert.equal(manager.hasSession('alice'), false);
    const leftovers = await readdir(authRoot);
    assert.ok(!leftovers.includes('alice'), 'restored session folder removed');
    assert.equal(folder, manager.authFolderFor('alice'));
  } finally {
    await rm(authRoot, { recursive: true, force: true });
  }
});
