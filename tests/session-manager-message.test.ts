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
  relayed: Array<{ jid: string; content: unknown; options: Record<string, unknown> }>;
  relayMessage: (jid: string, content: unknown, options?: Record<string, unknown>) => Promise<void>;
}

const JID = '123456789@s.whatsapp.net';

function makeStubFactory() {
  const factory = async () => {
    const stub: StubSocket = {
      ev: new EventEmitter(),
      user: { id: '999999@s.whatsapp.net' },
      sent: [],
      relayed: [],
      async sendMessage(jid: string, content: unknown) {
        stub.sent.push({ jid, content });
        return {} as WAMessage;
      },
      async relayMessage(jid: string, content: unknown, options: Record<string, unknown> = {}) {
        stub.relayed.push({ jid, content, options });
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

function emitInteractiveResponse(
  sock: WASocket,
  paramsJson: string,
  opts: { name?: string; version?: number; fromMe?: boolean; type?: string } = {},
): void {
  const stub = sock as unknown as StubSocket;
  const message: WAMessage = {
    key: { remoteJid: JID, id: `r-${Math.random()}`, fromMe: opts.fromMe ?? false },
    message: {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: opts.name ?? 'quick_reply',
          paramsJson,
          version: opts.version ?? 1,
        },
      },
    },
  };
  stub.ev.emit('messages.upsert', {
    messages: [message],
    type: opts.type ?? 'notify',
  });
}

function emitTemplateButtonReply(
  sock: WASocket,
  selectedId: string,
  selectedDisplayText: string,
  opts: { fromMe?: boolean; type?: string } = {},
): void {
  const stub = sock as unknown as StubSocket;
  const message: WAMessage = {
    key: { remoteJid: JID, id: `t-${Math.random()}`, fromMe: opts.fromMe ?? false },
    message: {
      templateButtonReplyMessage: {
        selectedId,
        selectedDisplayText,
      },
    },
  };
  stub.ev.emit('messages.upsert', {
    messages: [message],
    type: opts.type ?? 'notify',
  });
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

test('sendButtons relays a well-formed quick_reply native-flow payload with biz nodes', async () => {
  const manager = new SessionManager({
    socketFactory: makeStubFactory(),
    onSocketCreated: (sock) => {
      const id = new IdentityService({}, undefined);
      const dispatcher: Pick<CommandDispatcher, 'handle'> = {
        handle: async (_text: string, context: CommandContext) => {
          await context.sendButtons!({
            text: '🛒 Tocca un bottone.',
            title: '🛒 NEGOZIO RPG',
            footer: 'Usa /negozio per aggiornare',
            buttons: [
              { displayText: '🧪 Compra Pozione', id: '/acquista pozione' },
              { displayText: '⚔️ Compra Spada', id: '/acquista spada' },
            ],
          });
          return true;
        },
      };
      registerMessageLogger(sock, id, dispatcher as unknown as CommandDispatcher);
    },
  });

  const session = await manager.createSession('quickreply');
  emitMessage(session.sock, '/negozio');
  await new Promise((r) => setImmediate(r));

  const stub = session.sock as unknown as StubSocket;
  assert.equal(stub.relayed.length, 1, 'one native-flow message must be relayed');
  const { content, options } = stub.relayed[0];

  const interactive = (content as { interactiveMessage: unknown }).interactiveMessage as {
    body?: { text?: string };
    footer?: { text?: string };
    nativeFlowMessage?: {
      messageVersion?: number;
      messageParamsJson?: string;
      buttons?: Array<{ name?: string; buttonParamsJson?: string }>;
    };
  };

  assert.ok(interactive, 'must relay an interactiveMessage');
  assert.equal(interactive.body?.text, '🛒 Tocca un bottone.');
  assert.equal(interactive.footer?.text, 'Usa /negozio per aggiornare');

  const nf = interactive.nativeFlowMessage;
  assert.ok(nf, 'must contain nativeFlowMessage');
  assert.equal(nf.messageVersion, 1);
  assert.equal(nf.messageParamsJson, '{}');
  assert.equal(nf.buttons?.length, 2);

  const first = nf.buttons![0];
  assert.equal(first.name, 'quick_reply');
  const paramsFirst = JSON.parse(first.buttonParamsJson!);
  assert.deepEqual(paramsFirst, { display_text: '🧪 Compra Pozione', id: '/acquista pozione' });

  const second = nf.buttons![1];
  assert.equal(second.name, 'quick_reply');
  const paramsSecond = JSON.parse(second.buttonParamsJson!);
  assert.deepEqual(paramsSecond, { display_text: '⚔️ Compra Spada', id: '/acquista spada' });

  // JID is a private chat -> must include both biz and bot nodes, with biz FIRST
  const additionalNodes = options.additionalNodes as Array<{
    tag: string;
    attrs: Record<string, string>;
    content?: unknown[];
  }>;
  assert.ok(Array.isArray(additionalNodes), 'must provide additionalNodes for native flow');
  assert.equal(additionalNodes.length, 2, 'private chat must carry two nodes');
  assert.equal(additionalNodes[0]?.tag, 'biz', 'biz node must be injected first');
  assert.equal(additionalNodes[1]?.tag, 'bot', 'bot node must follow biz');
  assert.equal(additionalNodes[1]?.attrs?.biz_bot, '1');
  const biz = additionalNodes[0];
  assert.ok(biz, 'must include a biz node');
  assert.deepEqual(biz.attrs, {}, 'biz node must carry no extra attributes');
  assert.ok(
    Array.isArray(biz.content) &&
      (biz.content as Array<{ tag: string }>)[0]?.tag === 'interactive' &&
      (biz.content as Array<{ tag: string }>)[1] === undefined,
    'biz node must carry only the interactive/native_flow child',
  );

  // the click id must route to /acquista and never embed a user identifier
  assert.equal(paramsFirst.id, '/acquista pozione');
  assert.equal(paramsSecond.id.includes('@'), false);
});

function createClickHarness() {
  const dispatches: Array<{ text: string; context: CommandContext }> = [];
  const manager = new SessionManager({
    socketFactory: makeStubFactory(),
    onSocketCreated: (sock) => {
      const id = new IdentityService({}, undefined);
      const dispatcher: Pick<CommandDispatcher, 'handle'> = {
        handle: async (text: string, context: CommandContext) => {
          dispatches.push({ text, context });
          return true;
        },
      };
      registerMessageLogger(sock, id, dispatcher as unknown as CommandDispatcher);
    },
  });
  return { dispatches, manager };
}

test('A. quick_reply click on "Compra Pozione" routes /acquista pozione to the dispatcher', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('click-pozione');

  emitInteractiveResponse(session.sock, JSON.stringify({ id: '/acquista pozione' }), {
    name: 'quick_reply',
  });
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1, 'one click must reach the dispatcher');
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('B. quick_reply click on another product extracts the matching command', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('click-spada');

  emitInteractiveResponse(session.sock, JSON.stringify({ id: '/acquista spada' }), {
    name: 'quick_reply',
  });
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/acquista spada');
});

test('C. single_select response (used by /menu) still reaches the dispatcher', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('click-menu');

  emitInteractiveResponse(
    session.sock,
    JSON.stringify({ selected_id: '/ping', selected_display_text: 'Ping' }),
    { name: 'single_select' },
  );
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1, 'single_select click must reach the dispatcher');
  assert.equal(dispatches[0].text, '/ping');
});

test('D. textual /acquista pozione still reaches the dispatcher', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('text-acquista');

  emitMessage(session.sock, '/acquista pozione');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('F. quick_reply click wrapped in viewOnceMessage still routes the command', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('click-wrapped');

  const stub = session.sock as unknown as StubSocket;
  stub.ev.emit('messages.upsert', {
    messages: [
      {
        key: { remoteJid: JID, id: `r-${Math.random()}`, fromMe: false },
        message: {
          viewOnceMessage: {
            message: {
              interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                  name: 'quick_reply',
                  paramsJson: JSON.stringify({ id: '/acquista pozione' }),
                  version: 1,
                },
              },
            },
          },
        },
      },
    ],
    type: 'notify',
  });
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1, 'wrapped click must reach the dispatcher');
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('E. button id never contains a user identifier (jid/key)', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('click-noid');

  emitInteractiveResponse(
    session.sock,
    JSON.stringify({ id: '/acquista pozione' }),
    { name: 'quick_reply' },
  );
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  const text = dispatches[0].text;
  assert.ok(!text.includes('@'), 'button-triggered command must not embed a jid');
  assert.equal(text, '/acquista pozione');
});

test('T-A. templateButtonReplyMessage with selectedId="/acquista pozione" routes the command', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-pozione');

  emitTemplateButtonReply(session.sock, '/acquista pozione', '🧪 Compra Pozione');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1, 'template button click must reach the dispatcher');
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('T-B. templateButtonReplyMessage for another product routes its own selectedId', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-spada');

  emitTemplateButtonReply(session.sock, '/acquista spada', '⚔️ Compra Spada');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/acquista spada');
});

test('T-C. selectedId is the source of truth, never the display text', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-idtruth');

  emitTemplateButtonReply(session.sock, '/acquista pozione', 'Compra Pozione');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.notEqual(dispatches[0].text, 'Compra Pozione');
  assert.notEqual(dispatches[0].text, '🧪 Compra Pozione');
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('T-D. /menu single_select still produces /ping', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-menu');

  emitInteractiveResponse(
    session.sock,
    JSON.stringify({ selected_id: '/ping', selected_display_text: 'Ping' }),
    { name: 'single_select' },
  );
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/ping');
});

test('T-E. nativeFlow quick_reply still works', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-nf');

  emitInteractiveResponse(session.sock, JSON.stringify({ id: '/acquista pozione' }), {
    name: 'quick_reply',
  });
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/acquista pozione');
});

test('T-F. normal text messages still work', async () => {
  const { dispatches, manager } = createClickHarness();
  const session = await manager.createSession('tpl-text');

  emitMessage(session.sock, '/ping');
  await new Promise((r) => setImmediate(r));

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].text, '/ping');
});
