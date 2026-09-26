import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiRepository } from '../lib/ai/ai.repository.js';
import { AIService } from '../lib/ai/ai.service.js';
import { handleAiModeMessage } from '../lib/ai/ai-mode.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { CommandDispatcher } from '../lib/commands/dispatcher.js';
import aiCommand from '../plugins/ai/ai.js';
import esciCommand from '../plugins/ai/esci-chat.js';
import pingCommand from '../plugins/core/ping.js';
import { createTestDb, insertTestIdentity } from './helpers.js';
const IMAGE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
class FakeProvider {
    calls = [];
    reply = 'Ciao! Come posso aiutarti?';
    throwError = false;
    async generateResponse(messages) {
        this.calls.push(messages.map((m) => ({ ...m, ...(m.image ? { image: { ...m.image } } : {}) })));
        if (this.throwError)
            throw new Error('boom');
        return this.reply;
    }
}
function buildDb() {
    const db = createTestDb();
    insertTestIdentity(db, 'u1');
    insertTestIdentity(db, 'u2');
    return { db };
}
function build(userId = 'u1') {
    const { db } = buildDb();
    const repo = new AiRepository(db);
    const provider = new FakeProvider();
    const service = new AIService(repo, provider);
    return { db, repo, provider, service };
}
describe('AI mode', () => {
    let db;
    let repo;
    let provider;
    let service;
    beforeEach(() => {
        const ctx = build();
        db = ctx.db;
        repo = ctx.repo;
        provider = ctx.provider;
        service = ctx.service;
    });
    it('/ai crea chat via service activates AI mode for that user', () => {
        assert.equal(service.activeChat('u1'), null);
        const res = service.createChat('u1');
        assert.equal(res.ok, true);
        assert.equal(service.activeChat('u1'), 1);
    });
    it('a normal text message during AI mode is sent to Gemini and replied', async () => {
        service.createChat('u1');
        const replies = [];
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'Ciao',
            image: null,
            reply: async (t) => {
                replies.push(t);
            },
        });
        assert.equal(routed, 'ai');
        assert.deepEqual(replies, ['Ciao! Come posso aiutarti?']);
        const last = provider.calls[provider.calls.length - 1];
        assert.equal(last[last.length - 1].text, 'Ciao');
    });
    it('saves user and assistant messages during AI mode', async () => {
        service.createChat('u1');
        await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'ciao',
            image: null,
            reply: async () => undefined,
        });
        const chat = repo.findChat('u1', 1);
        const messages = repo.listMessages(chat.id);
        assert.equal(messages.length, 2);
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[1].role, 'assistant');
        assert.equal(messages[0].content, 'ciao');
        assert.equal(messages[1].content, 'Ciao! Come posso aiutarti?');
    });
    it('two users have independent AI modes', async () => {
        service.createChat('u1');
        assert.equal(service.activeChat('u1'), 1);
        assert.equal(service.activeChat('u2'), null);
    });
    it('user A in AI mode does not affect user B', async () => {
        service.createChat('u1');
        const routedB = await handleAiModeMessage({
            ai: service,
            userId: 'u2',
            text: 'ciao',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routedB, 'none');
        assert.equal(provider.calls.length, 0);
    });
    it('/esci chat deactivates AI mode for that user', async () => {
        service.createChat('u1');
        esciCommand.execute({
            args: ['chat'],
            identity: { userId: 'u1', lid: null, pn: 'x', username: null },
            reply: async () => undefined,
            sendList: async () => undefined,
            registry: { getAll: () => [] },
            rpg: {},
            ai: service,
            mentions: [],
            quoted: null,
        });
        assert.equal(service.activeChat('u1'), null);
    });
    it('after /esci chat a normal message returns to the dispatcher (router says none)', async () => {
        service.createChat('u1');
        service.deactivate('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'ciao',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'none');
        assert.equal(provider.calls.length, 0);
    });
    it('/ping during AI mode is treated as a command, not AI text', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: '/ping',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'command');
        assert.equal(provider.calls.length, 0);
    });
    it('/menu during AI mode is treated as a command, not AI text', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: '/menu',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'command');
        assert.equal(provider.calls.length, 0);
    });
    it('/esci chat during AI mode is not sent to Gemini', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: '/esci chat',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'command');
        assert.equal(provider.calls.length, 0);
        assert.equal(service.activeChat('u1'), 1);
    });
    it('AI mode and history clear correctly after /esci chat while chat remains in DB', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, 'ciao');
        service.deactivate('u1');
        assert.equal(service.activeChat('u1'), null);
        const list = service.listChats('u1');
        assert.equal(list.ok, true);
        if (list.ok)
            assert.equal(list.chats.length, 1);
        const chat = repo.findChat('u1', 1);
        assert.equal(repo.listMessages(chat.id).length, 2);
    });
    it('a bot restart does not reactivate AI mode automatically', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, 'ciao');
        const provider2 = new FakeProvider();
        const service2 = new AIService(new AiRepository(db), provider2);
        assert.equal(service2.activeChat('u1'), null);
    });
    it('chat and history remain in the database after a restart', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, 'ciao');
        const service2 = new AIService(new AiRepository(db), new FakeProvider());
        const list = service2.listChats('u1');
        assert.equal(list.ok, true);
        if (list.ok)
            assert.equal(list.chats.length, 1);
        const chat = repo.findChat('u1', 1);
        const messages = repo.listMessages(chat.id);
        assert.equal(messages.length, 2);
        assert.equal(messages[0].content, 'ciao');
    });
    it('with no active AI chat the router returns none (normal behavior)', async () => {
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'ciao',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'none');
    });
    it('a raw /esci chat command via dispatcher deactivates AI mode and replies', async () => {
        const { db: db2 } = buildDb();
        const registry = new CommandRegistry();
        registry.register(esciCommand);
        const ai = new AIService(new AiRepository(db2), new FakeProvider());
        const dispatcher = new CommandDispatcher(registry, {}, {}, ai);
        ai.createChat('u1');
        const replies = [];
        await dispatcher.handle('/esci chat', {
            identity: { userId: 'u1', lid: null, pn: 'x', username: null },
            reply: async (t) => {
                replies.push(t);
            },
            sendList: async () => undefined,
            mentions: [],
            quoted: null,
        });
        assert.match(replies.join('\n'), /Modalità AI disattivata/);
        assert.equal(ai.activeChat('u1'), null);
    });
    it('/ai crea chat via dispatcher activates AI mode and /ping still works', async () => {
        const { db: db2 } = buildDb();
        const registry = new CommandRegistry();
        registry.register(aiCommand);
        registry.register(pingCommand);
        const ai = new AIService(new AiRepository(db2), new FakeProvider('Risposta'));
        const dispatcher = new CommandDispatcher(registry, {}, {}, ai);
        const replies1 = [];
        await dispatcher.handle('/ai crea chat', {
            identity: { userId: 'u1', lid: null, pn: 'x', username: null },
            reply: async (t) => replies1.push(t),
            sendList: async () => undefined,
            mentions: [],
            quoted: null,
        });
        assert.equal(ai.activeChat('u1'), 1);
        assert.match(replies1.join('\n'), /CHAT AI ATTIVATA/i);
        const replies2 = [];
        await dispatcher.handle('/ping', {
            identity: { userId: 'u1', lid: null, pn: 'x', username: null },
            reply: async (t) => replies2.push(t),
            sendList: async () => undefined,
            mentions: [],
            quoted: null,
        });
        assert.deepEqual(replies2, ['pong']);
    });
});
describe('AI mode images', () => {
    let repo;
    let provider;
    let service;
    beforeEach(() => {
        const ctx = build();
        repo = ctx.repo;
        provider = ctx.provider;
        service = ctx.service;
    });
    it('sends an image without caption to Gemini during AI mode', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: null,
            image: { mimeType: 'image/jpeg', data: IMAGE_JPEG },
            reply: async () => undefined,
        });
        assert.equal(routed, 'ai');
        const last = provider.calls[provider.calls.length - 1];
        const msg = last[last.length - 1];
        assert.ok(msg.image, 'the last message should carry the image');
        assert.equal(msg.text, '');
        assert.deepEqual(Array.from(msg.image.data), Array.from(IMAGE_JPEG));
    });
    it('sends an image with caption to Gemini during AI mode', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'Cosa vedi?',
            image: { mimeType: 'image/png', data: IMAGE_JPEG },
            reply: async () => undefined,
        });
        assert.equal(routed, 'ai');
        const last = provider.calls[provider.calls.length - 1];
        const msg = last[last.length - 1];
        assert.ok(msg.image);
        assert.equal(msg.image.mimeType, 'image/png');
        assert.equal(msg.text, 'Cosa vedi?');
    });
    it('GeminiProvider receives the real multimodal content', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, '', {
            mimeType: 'image/jpeg',
            data: IMAGE_JPEG,
        });
        const last = provider.calls[provider.calls.length - 1];
        const msg = last[last.length - 1];
        assert.ok(msg.image);
        // raw bytes are passed through (not a bot-generated description)
        assert.equal(msg.image.mimeType, 'image/jpeg');
        assert.deepEqual(Array.from(msg.image.data), Array.from(IMAGE_JPEG));
    });
    it('preserves the image MIME type end to end', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, 'desc', { mimeType: 'image/webp', data: IMAGE_JPEG });
        const last = provider.calls[provider.calls.length - 1];
        assert.equal(last[last.length - 1].image.mimeType, 'image/webp');
    });
    it('handles a download error gracefully (provider not called)', async () => {
        // Simulate an unavailable download: no image is passed, so the router
        // falls back to normal behavior rather than fabricating content.
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: null,
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'none');
        assert.equal(provider.calls.length, 0);
    });
    it('stores an image-only message as a marker in the DB (not binary)', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, '', { mimeType: 'image/jpeg', data: IMAGE_JPEG });
        const chat = repo.findChat('u1', 1);
        const messages = repo.listMessages(chat.id);
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[0].content, '[Immagine]');
    });
    it('stores the caption for an image+caption message in the DB', async () => {
        service.createChat('u1');
        await service.sendMessage('u1', 1, 'Che bella foto', {
            mimeType: 'image/jpeg',
            data: IMAGE_JPEG,
        });
        const chat = repo.findChat('u1', 1);
        const messages = repo.listMessages(chat.id);
        assert.equal(messages[0].content, 'Che bella foto');
    });
    it('text-only messages continue to work as before during AI mode', async () => {
        service.createChat('u1');
        const routed = await handleAiModeMessage({
            ai: service,
            userId: 'u1',
            text: 'come stai?',
            image: null,
            reply: async () => undefined,
        });
        assert.equal(routed, 'ai');
        const last = provider.calls[provider.calls.length - 1];
        const msg = last[last.length - 1];
        assert.equal(msg.text, 'come stai?');
        assert.ok(!msg.image);
    });
});
