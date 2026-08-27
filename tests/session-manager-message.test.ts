import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { SessionManager } from '../src/whatsapp/session-manager.js';
import { registerMessageLogger } from '../src/events/messages.js';
import { IdentityService } from '../src/services/identity/identity.service.js';
import type { CommandDispatcher } from '../src/commands/dispatcher.js';
import type { CommandContext } from '../src/commands/types.js';

interface StubSocket {
  ev: EventEmitter;
  user?: { id: string };
  waUploadToServer?: unknown;
  sent: Array<{ jid: string; content: unknown }>;
  sendMessage: (jid: string, content: unknown) => Promise<WAMessage>;
}

const JID = '123456789@s.whatsapp.net';

function makeStubFactory() {
  const factory = async () => {
    const stub: StubSocket = {
      ev: new EventEmitter(),
      user: { id: '999999@s.whatsapp.net' },
      sent: [],
      async sendMessage(jid: string, content: unknown) {
        stub.sent.push({ jid, content });
        return {} as WAMessage;
      },
    };
    return stub as unknown as WASocket;
  };
  return factory;
}

function emitMessage(sock: WASocket, text: string): void {
  const stub = sock as unknown as StubSocket;
  const message: WAMessage = {
    key: { remoteJid: JID, id: `m-${Math.random()}`, fromMe: false },
    message: { conversation: text },
  };
  stub.ev.emit('messages.upsert', { messages: [message], type: 'notify' });
}

test('registers the message handler on every managed session socket', async () => {
  const registered: WASocket[] = [];
  const manager = new SessionManager({
    socketFactory: makeStubFactory(),
    onSocketCreated: (sock) => {
      registered.push(sock);
      const id = new IdentityService({}, undefined);
      const dispatcher: Pick<CommandDispatcher, 'handle'> = {
        handle: async () => false,
      };
      registerMessageLogger(sock, id, dispatcher as unknown as CommandDispatcher);
    },
  });

  await manager.createSession('alice');
  await manager.createSession('bob');

  assert.equal(registered.length, 2);
  assert.ok(registered.some((s) => s === manager.getSession('alice')));
  assert.ok(registered.some((s) => s === manager.getSession('bob')));
});

test('routes a message to the dispatcher and replies through the owning session socket', async () => {
  const dispatches: Array<{ text: string; sock: WASocket }> = [];
  const manager = new SessionManager({
    socketFactory: makeStubFactory(),
    onSocketCreated: (sock) => {
      const id = new IdentityService({}, undefined);
      const dispatcher: Pick<CommandDispatcher, 'handle'> = {
        handle: async (text: string, context: CommandContext) => {
          dispatches.push({ text, sock });
          // simulate a command that replies -> must go through this session's socket
          await context.reply('pong');
          return true;
        },
      };
      registerMessageLogger(sock, id, dispatcher as unknown as CommandDispatcher);
    },
  });

  const session = await manager.createSession('alice');
  emitMessage(session.sock, '/ping');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/ping');
  assert.equal(dispatches[0].sock, session.sock);

  const stub = session.sock as unknown as StubSocket;
  assert.equal(stub.sent.length, 1);
  assert.equal(stub.sent[0].jid, JID);
  assert.deepEqual(stub.sent[0].content, { text: 'pong' });
});

test('a session does not double-register its message handler', async () => {
  let dispatches = 0;
  const manager = new SessionManager({
    socketFactory: makeStubFactory(),
    onSocketCreated: (sock) => {
      const id = new IdentityService({}, undefined);
      const dispatcher: Pick<CommandDispatcher, 'handle'> = {
        handle: async () => {
          dispatches += 1;
          return true;
        },
      };
      registerMessageLogger(sock, id, dispatcher as unknown as CommandDispatcher);
    },
  });

  const session = await manager.createSession('u1');
  emitMessage(session.sock, '/ping');
  emitMessage(session.sock, '/menu');
  await new Promise((r) => setImmediate(r));

  // 2 messages -> exactly 2 dispatches (would be 4 if the handler were registered twice)
  assert.equal(dispatches, 2);
});
