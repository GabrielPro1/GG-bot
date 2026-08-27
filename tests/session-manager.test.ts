import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  SessionManager,
  type ManagedSession,
} from '../src/whatsapp/session-manager.js';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

interface StubSocket {
  ev: EventEmitter;
  logoutCalls: number;
  endCalls: number;
  authFolder: string;
  logout: () => Promise<void>;
  end: (error: Error | undefined) => Promise<void>;
}

function makeStubFactory() {
  const sockets: StubSocket[] = [];
  const factory = async (authFolder: string) => {
    const stub: StubSocket = {
      ev: new EventEmitter(),
      logoutCalls: 0,
      endCalls: 0,
      authFolder,
      logout: async () => {
        stub.logoutCalls += 1;
      },
      end: async () => {
        stub.endCalls += 1;
      },
    };
    sockets.push(stub);
    return stub as unknown as WASocket;
  };
  return { factory, sockets };
}

function getStub(manager: SessionManager, userId: string): StubSocket {
  return manager.getSession(userId) as unknown as StubSocket;
}

test('SessionManager isolates auth folder per user', () => {
  const manager = new SessionManager({ authRoot: '/tmp/root' });
  const f1 = manager.authFolderFor('user-1');
  const f2 = manager.authFolderFor('user-2');
  assert.equal(f1, path.resolve(path.join('/tmp/root', 'user-1')));
  assert.equal(f2, path.resolve(path.join('/tmp/root', 'user-2')));
  assert.notEqual(f1, f2);
});

test('authFolderFor sanitizes unsafe user ids', () => {
  const manager = new SessionManager({ authRoot: '/tmp/root' });
  assert.equal(manager.authFolderFor('a/b:c*'), path.resolve(path.join('/tmp/root', 'a_b_c_')));
  assert.throws(() => manager.authFolderFor(''));
});

test('createSession returns same instance for the same user (no duplicate sockets)', async () => {
  const { factory, sockets } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  const a = await manager.createSession('u1');
  const b = await manager.createSession('u1');
  const c = await manager.createSession('u2');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(sockets.length, 2);
  assert.equal(manager.size, 2);
});

test('hasSession / getSession / listSessions / getManagedSession report state', async () => {
  const { factory } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  assert.equal(manager.hasSession('alice'), false);
  await manager.createSession('alice');
  assert.equal(manager.hasSession('alice'), true);
  assert.ok(manager.getSession('alice'));
  assert.equal(manager.getSession('nobody'), undefined);

  const managed = manager.getManagedSession('alice');
  assert.ok(managed);
  assert.deepEqual(managed.userId, 'alice');
  assert.deepEqual(manager.listSessions().map((s) => s.userId), ['alice']);
});

test('onQr is invoked per session with that session QR (no shared global)', async () => {
  const { factory } = makeStubFactory();
  const qrs: Array<{ userId: string; qr: string }> = [];
  const manager = new SessionManager({ socketFactory: factory, onQr: (u, q) => qrs.push({ userId: u, qr: q }) });

  await manager.createSession('alice');
  await manager.createSession('bob');

  getStub(manager, 'alice').ev.emit('connection.update', { connection: 'connecting', qr: 'QR-ALICE' } satisfies ConnectionState);
  getStub(manager, 'bob').ev.emit('connection.update', { connection: 'connecting', qr: 'QR-BOB' } satisfies ConnectionState);

  assert.deepEqual(qrs, [
    { userId: 'alice', qr: 'QR-ALICE' },
    { userId: 'bob', qr: 'QR-BOB' },
  ]);
});

test('open state triggers onOpen and resets reconnect attempts', async () => {
  const { factory } = makeStubFactory();
  const opened: string[] = [];
  const manager = new SessionManager({ socketFactory: factory, onOpen: (u) => opened.push(u) });

  const session = await manager.createSession('u1');
  session.reconnectAttempts = 3;
  getStub(manager, 'u1').ev.emit('connection.update', { connection: 'open' } satisfies ConnectionState);

  assert.deepEqual(opened, ['u1']);
  assert.deepEqual(session.state, 'open');
  assert.deepEqual(session.reconnectAttempts, 0);
});

test('close on non-recoverable status (loggedOut) does not schedule reconnect', async () => {
  const { factory } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  const session = await manager.createSession('u1');
  getStub(manager, 'u1').ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: {
      error: new Boom('logged out', { statusCode: DisconnectReason.loggedOut }),
      date: new Date(),
    },
  } satisfies ConnectionState);

  assert.deepEqual(session.state, 'close');
  assert.deepEqual(session.reconnectAttempts, 0);
});

test('closeSession removes the session and logs out its socket', async () => {
  const { factory } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  await manager.createSession('u1');
  const stub = getStub(manager, 'u1');
  await manager.closeSession('u1');

  assert.equal(manager.hasSession('u1'), false);
  assert.equal(manager.size, 0);
  assert.equal(stub.logoutCalls, 1);
  assert.equal(stub.endCalls, 1);
});

test('closeAll closes every session', async () => {
  const { factory } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  await manager.createSession('u1');
  await manager.createSession('u2');
  await manager.closeAll();

  assert.equal(manager.size, 0);
});

test('shutdown ends sockets WITHOUT logging out (preserves credentials)', async () => {
  const { factory, sockets } = makeStubFactory();
  const manager = new SessionManager({ socketFactory: factory });

  await manager.createSession('u1');
  await manager.createSession('u2');
  await manager.shutdown();

  assert.equal(manager.size, 0);
  assert.equal(manager.hasSession('u1'), false);
  assert.equal(manager.hasSession('u2'), false);
  for (const stub of sockets) {
    assert.equal(stub.endCalls, 1, 'socket must be ended');
    assert.equal(stub.logoutCalls, 0, 'shutdown must NOT logout (no credential invalidation)');
  }
});

test('default authRoot resolves to an absolute path (project ./auth)', () => {
  const manager = new SessionManager();
  const folder = manager.authFolderFor('u1');
  assert.ok(path.isAbsolute(folder));
  assert.ok(path.basename(folder) === 'u1');
});
