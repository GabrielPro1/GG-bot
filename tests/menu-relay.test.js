import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerMessageLogger } from '../handler.js';
import { IdentityService } from '../lib/identity/identity.service.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { CommandDispatcher } from '../lib/commands/dispatcher.js';
import { OwnerService } from '../config.js';
import menuCommand from '../plugins/core/menu.js';
import sezioneCommand from '../plugins/core/sezione.js';

const CHAT_JID = '120363000000000000@g.us';

function makeCommand(name, category, emoji) {
    return { name, category, emoji, description: `${name} desc`, execute: async () => {} };
}

/**
 * Drives the real message handler with a fake socket, so we can inspect the
 * exact payload handed to relayMessage for /menu and /sezione.
 */
function createHarness() {
    const listeners = new Map();
    const relayed = [];
    const texts = [];

    const sock = {
        user: { id: '393516059068:1@s.whatsapp.net' },
        ev: { on: (event, cb) => listeners.set(event, cb) },
        waUploadToServer: async () => ({
            mediaKey: Buffer.alloc(32, 1).toString('base64'),
            directPath: '/v/t62.0-24/1_1234567890',
            fileEncSha256: Buffer.alloc(32, 7).toString('base64'),
            fileSha256: Buffer.alloc(32, 8).toString('base64'),
            fileLength: '2048',
            mimetype: 'image/png',
        }),
        relayMessage: async (jid, message, opts) => {
            relayed.push({ jid, message, opts });
            return { key: { id: 'FAKE' } };
        },
        sendMessage: async (jid, content) => {
            texts.push(content);
            return { key: { id: 'FAKE' } };
        },
    };

    const registry = new CommandRegistry();
    registry.register(makeCommand('ping', 'core', '🏓'));
    registry.register(makeCommand('ruba', 'rpg', '💰'));
    registry.register(makeCommand('uso', 'rpg', '🎯'));
    registry.register(makeCommand('aggiungimonete', 'owner', '👑'));
    registry.register(sezioneCommand);
    registry.register(menuCommand);

    const dispatcher = new CommandDispatcher(registry, {}, new OwnerService({ owners: [] }));
    registerMessageLogger(sock, new IdentityService(), dispatcher);

    // The handler is fire and forget, so poll instead of guessing a fixed delay.
    const waitForOutput = async (timeoutMs = 10_000) => {
        const deadline = Date.now() + timeoutMs;
        while (relayed.length + texts.length === 0) {
            if (Date.now() > deadline) {
                throw new Error('timed out waiting for the handler to answer');
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        // give any trailing output a chance to land
        await new Promise((resolve) => setTimeout(resolve, 50));
    };

    const send = async (text) => {
        await listeners.get('messages.upsert')({
            messages: [
                {
                    key: { id: `MSG-${text}`, remoteJid: CHAT_JID, participant: '393516059068@s.whatsapp.net' },
                    message: { conversation: text },
                    messageTimestamp: Date.now(),
                },
            ],
            type: 'notify',
        });
        await waitForOutput();
    };

    return { send, relayed, texts };
}

/** Reads back the single_select rows out of a relayed interactive message. */
function readRows(entry) {
    const im = entry.message.interactiveMessage;
    const params = JSON.parse(im.nativeFlowMessage.buttons[0].buttonParamsJson);
    return {
        im,
        title: im.header.title,
        body: im.body.text,
        rows: params.sections[0].rows,
    };
}

describe('Menu is relayed with the context nodes WhatsApp requires', () => {
    let harness;

    beforeEach(() => {
        harness = createHarness();
    });

    it('relays exactly one message for /menu', async () => {
        await harness.send('/menu');
        assert.equal(harness.relayed.length, 1);
        assert.equal(harness.texts.length, 0);
    });

    it('passes the biz context node, without which WhatsApp drops the flow', async () => {
        await harness.send('/menu');
        const nodes = harness.relayed[0].opts.additionalNodes;
        assert.ok(Array.isArray(nodes), 'additionalNodes must be passed to relayMessage');
        assert.equal(nodes[0].tag, 'biz');
        assert.equal(nodes[0].content[0].attrs.type, 'native_flow');
        assert.equal(nodes[0].content[0].content[0].attrs.name, 'mixed');
    });

    it('sends a single_select flow with a header image and a section list', async () => {
        await harness.send('/menu');
        const { im, title, body, rows } = readRows(harness.relayed[0]);
        assert.equal(title, '✨ GG BOT — COMMAND CENTER ✨');
        assert.equal(body, 'Seleziona una categoria per vedere i comandi disponibili.');
        assert.equal(im.header.hasMediaAttachment, true);
        assert.ok(im.header.imageMessage, 'the header must carry the uploaded image');
        assert.equal(im.nativeFlowMessage.buttons[0].name, 'single_select');
        assert.equal(im.nativeFlowMessage.messageParamsJson, '{}');
        assert.deepEqual(
            rows.map((r) => r.id),
            ['/sezione core', '/sezione rpg', '/sezione owner'],
        );
    });

    it('lists the commands of a section on /sezione, with that section image', async () => {
        await harness.send('/sezione rpg');
        assert.equal(harness.relayed.length, 1);
        const { title, rows } = readRows(harness.relayed[0]);
        assert.equal(title, '🎮 RPG');
        assert.deepEqual(rows.map((r) => r.id).sort(), ['/ruba', '/uso']);
        const im = harness.relayed[0].message.interactiveMessage;
        assert.ok(im.header.imageMessage, 'a section must show its own image');
    });

    it('never leaks the raw menu payload as text', async () => {
        await harness.send('/menu');
        await harness.send('/sezione core');
        assert.equal(harness.texts.length, 0, 'both steps must stay native flows');
    });
});
