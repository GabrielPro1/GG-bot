import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { AiRepository } from '../src/services/ai/ai.repository.js';
import { AIService, disabledAiView } from '../src/services/ai/ai.service.js';
import type { AiProvider } from '../src/services/ai/ai.provider.js';
import type { AiRequestMessage, AIServiceView } from '../src/services/ai/types.js';
import { CommandRegistry } from '../src/commands/registry.js';
import { CommandDispatcher } from '../src/commands/dispatcher.js';
import type { Command } from '../src/commands/types.js';
import aiCommand from '../src/commands/ai/ai.js';
import { createTestDb, insertTestIdentity } from './helpers.js';

class FakeProvider implements AiProvider {
  public calls: AiRequestMessage[][] = [];
  public reply: string;
  public throwError: boolean = false;

  constructor(reply = 'Ciao! Come posso aiutarti?') {
    this.reply = reply;
  }

  async generateResponse(messages: readonly AiRequestMessage[]): Promise<string> {
    this.calls.push(messages.map((m) => ({ ...m })));
    if (this.throwError) throw new Error('boom');
    if (!this.reply) return '';
    return this.reply;
  }
}

function build(userId = 'u1') {
  const db = createTestDb();
  insertTestIdentity(db, userId);
  const repo = new AiRepository(db);
  const provider = new FakeProvider();
  const service = new AIService(repo, provider);
  return { db, repo, provider, service };
}

describe('AI service', () => {
  let db: Database.Database;
  let repo: AiRepository;
  let provider: FakeProvider;
  let service: AIService;

  beforeEach(() => {
    const ctx = build();
    db = ctx.db;
    repo = ctx.repo;
    provider = ctx.provider;
    service = ctx.service;
  });

  it('creates a chat with per-user progressive ids (1, 2, ...)', () => {
    const first = service.createChat('u1');
    const second = service.createChat('u1');
    const third = service.createChat('u1');
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.chatNumber, 1);
    if (second.ok) assert.equal(second.chatNumber, 2);
    if (third.ok) assert.equal(third.chatNumber, 3);
  });

  it('keeps chat ids independent per user', () => {
    insertTestIdentity(db, 'u2');
    const a1 = service.createChat('u1');
    const b1 = service.createChat('u2');
    const a2 = service.createChat('u1');
    assert.equal(a1.ok, true);
    assert.equal(b1.ok, true);
    if (a1.ok) assert.equal(a1.chatNumber, 1);
    if (b1.ok) assert.equal(b1.chatNumber, 1);
    if (a2.ok) assert.equal(a2.chatNumber, 2);
  });

  it('can send a message to the user own chat and returns a reply', async () => {
    service.createChat('u1');
    const result = await service.sendMessage('u1', 1, 'Ciao, come stai?');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reply, 'Ciao! Come posso aiutarti?');
      assert.equal(result.chatNumber, 1);
    }
  });

  it('cannot access a chat belonging to another user', async () => {
    insertTestIdentity(db, 'u2');
    service.createChat('u1'); // user1 owns chat 1
    const result = await service.sendMessage('u2', 1, 'hi');
    assert.deepEqual(result, { ok: false, error: 'not_found' });
  });

  it('responds chat-not-found for unknown chats', async () => {
    const result = await service.sendMessage('u1', 99, 'hi');
    assert.deepEqual(result, { ok: false, error: 'not_found' });
  });

  it('sends the full reconstructed history to the provider', async () => {
    service.createChat('u1');
    await service.sendMessage('u1', 1, 'primo messaggio');
    await service.sendMessage('u1', 1, 'secondo messaggio');

    const lastCall = provider.calls[provider.calls.length - 1];
    // Gemini role mapping: assistant -> model
    assert.deepEqual(
      lastCall.map((m) => m.role),
      ['user', 'model', 'user'],
    );
    assert.deepEqual(
      lastCall.map((m) => m.text),
      ['primo messaggio', 'Ciao! Come posso aiutarti?', 'secondo messaggio'],
    );
  });

  it('saves the user message and the assistant message to the DB', async () => {
    service.createChat('u1');
    await service.sendMessage('u1', 1, 'ciao');

    const chat = repo.findChat('u1', 1)!;
    const messages = repo.listMessages(chat.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[0].content, 'ciao');
    assert.equal(messages[1].role, 'assistant');
    assert.equal(messages[1].content, 'Ciao! Come posso aiutarti?');
  });

  it('persists the conversation across a service rebuild (no RAM reliance)', async () => {
    service.createChat('u1');
    await service.sendMessage('u1', 1, 'come mi chiamo?');

    // Rebuild a fresh service/provider on the same DB.
    const provider2 = new FakeProvider('Sei Neo.');
    const service2 = new AIService(new AiRepository(db), provider2);
    const result = await service2.sendMessage('u1', 1, 'continua');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.reply, 'Sei Neo.');

    // Provider saw the whole history, proving it was rebuilt from the DB.
    const call = provider2.calls[0];
    assert.equal(call.length, 3);
    assert.deepEqual(
      call.map((m) => m.text),
      ['come mi chiamo?', 'Ciao! Come posso aiutarti?', 'continua'],
    );
  });

  it('does not save an assistant message when the provider throws', async () => {
    service.createChat('u1');
    provider.throwError = true;
    const result = await service.sendMessage('u1', 1, 'ciao');
    assert.deepEqual(result, { ok: false, error: 'provider_error' });

    const chat = repo.findChat('u1', 1)!;
    const messages = repo.listMessages(chat.id);
    // user message recorded, no assistant message fabricated
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'user');
  });

  it('returns empty_response and does not save an assistant message for empty replies', async () => {
    service.createChat('u1');
    provider.reply = '';
    const result = await service.sendMessage('u1', 1, 'ciao');
    assert.deepEqual(result, { ok: false, error: 'empty_response' });

    const chat = repo.findChat('u1', 1)!;
    assert.equal(repo.listMessages(chat.id).length, 1);
    assert.equal(repo.listMessages(chat.id)[0].role, 'user');
  });

  it('rejects empty messages', async () => {
    service.createChat('u1');
    assert.deepEqual(await service.sendMessage('u1', 1, '   '), {
      ok: false,
      error: 'empty_message',
    });
    assert.deepEqual(await service.sendMessage('u1', 1, ''), {
      ok: false,
      error: 'empty_message',
    });
  });

  it('rejects invalid chat ids', async () => {
    assert.deepEqual(await service.sendMessage('u1', 0, 'hi'), {
      ok: false,
      error: 'invalid_id',
    });
    assert.deepEqual(await service.sendMessage('u1', -3, 'hi'), {
      ok: false,
      error: 'invalid_id',
    });
  });

  it('lists the user chats', () => {
    service.createChat('u1');
    service.createChat('u1');
    const result = service.listChats('u1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.chats.map((c) => c.chatNumber),
        [1, 2],
      );
    }
  });

  it('lists zero chats for a user with none', () => {
    const result = service.listChats('u1');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.chats.length, 0);
  });

  it('deletes a chat and its messages', async () => {
    service.createChat('u1');
    await service.sendMessage('u1', 1, 'ciao');
    const del = service.deleteChat('u1', 1);
    assert.deepEqual(del, { ok: true, chatNumber: 1 });

    const chat = repo.findChat('u1', 1);
    assert.equal(chat, undefined);
    const list = service.listChats('u1');
    if (list.ok) assert.equal(list.chats.length, 0);
  });

  it('returns not_found when deleting a chat that does not exist', () => {
    assert.deepEqual(service.deleteChat('u1', 42), { ok: false, error: 'not_found' });
  });

  it('is disabled when no provider is configured', () => {
    const disabled = new AIService(repo, null);
    assert.equal(disabled.enabled, false);
    assert.deepEqual(disabled.createChat('u1'), { ok: false, error: 'disabled' });
    assert.deepEqual(disabled.listChats('u1'), { ok: false, error: 'disabled' });
    assert.deepEqual(disabled.deleteChat('u1', 1), { ok: false, error: 'disabled' });
  });

  it('disabled view and disabled service surface the same behaviour', async () => {
    const disabled = disabledAiView();
    assert.equal(disabled.enabled, false);
    await assert.rejects(async () => {
      const r = await disabled.sendMessage('u1', 1, 'hi');
      assert.deepEqual(r, { ok: false, error: 'disabled' });
      throw new Error('stop');
    });
  });
});

describe('AI command integration via dispatcher', () => {
  function buildWithCommands() {
    const db = createTestDb();
    insertTestIdentity(db, 'u1');
    insertTestIdentity(db, 'u2');
    const registry = new CommandRegistry();
    registry.register(aiCommand as Command);
    const ai: AIServiceView = new AIService(new AiRepository(db), new FakeProvider('Risposta AI'));
    const dispatcher = new CommandDispatcher(registry, {} as never, {} as never, ai);
    return { dispatcher };
  }

  async function run(dispatcher: CommandDispatcher, text: string) {
    const replies: string[] = [];
    await dispatcher.handle(text, {
      identity: { userId: 'u1', lid: null, pn: '1234@s.whatsapp.net', username: null },
      reply: async (t) => {
        replies.push(t);
      },
      sendList: async () => undefined,
      mentions: [],
      quoted: null,
    });
    return replies.join('\n');
  }

  it('creates a chat and replies with its id', async () => {
    const { dispatcher } = buildWithCommands();
    const out = await run(dispatcher, '/ai crea chat');
    assert.match(out, /CHAT AI ATTIVATA/i);
    assert.match(out, /ID: 1/);
  });

  it('sends a chat message to the provider', async () => {
    const { dispatcher } = buildWithCommands();
    await run(dispatcher, '/ai crea chat');
    const out = await run(dispatcher, '/ai chat 1 ciao');
    assert.match(out, /Risposta AI/);
  });

  it('lists chats', async () => {
    const { dispatcher } = buildWithCommands();
    await run(dispatcher, '/ai crea chat');
    await run(dispatcher, '/ai crea chat');
    const out = await run(dispatcher, '/ai chats');
    assert.match(out, /1 — Chat AI/);
    assert.match(out, /2 — Chat AI/);
  });

  it('reports chat not found for another user chat', async () => {
    const { dispatcher } = buildWithCommands();
    await run(dispatcher, '/ai crea chat');
    const out = await run(dispatcher, '/ai chat 5 ciao');
    assert.match(out, /Chat AI non trovata/);
  });
});
