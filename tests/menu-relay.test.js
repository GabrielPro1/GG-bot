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
    const images = [];
    const harness = { relayFailTimes: 0, imageSendShouldThrow: false, uploadShouldThrow: false };

    const sock = {
        user: { id: '393516059068:1@s.whatsapp.net' },
        ev: { on: (event, cb) => listeners.set(event, cb) },
        waUploadToServer: async () => {
            if (harness.uploadShouldThrow) {
                throw new Error('simulated upload failure');
            }
            return {
                mediaKey: Buffer.alloc(32, 1).toString('base64'),
                directPath: '/v/t62.0-24/1_1234567890',
                fileEncSha256: Buffer.alloc(32, 7).toString('base64'),
                fileSha256: Buffer.alloc(32, 8).toString('base64'),
                fileLength: '2048',
                mimetype: 'image/png',
            };
        },
        relayMessage: async (jid, message, opts) => {
            if (harness.relayFailTimes > 0) {
                harness.relayFailTimes -= 1;
                throw new Error('simulated relay failure');
            }
            relayed.push({ jid, message, opts });
            return { key: { id: 'FAKE' } };
        },
        sendMessage: async (jid, content) => {
            if (content.image) {
                if (harness.imageSendShouldThrow) {
                    throw new Error('simulated image send failure');
                }
                images.push(content);
            }
            else {
                texts.push(content);
            }
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

    // The handler is fire and forget, so poll until the command produced its
    // single message instead of guessing a fixed delay.
    const total = () => relayed.length + texts.length + images.length;
    const send = async (text) => {
        const base = total();
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
        const deadline = Date.now() + 10_000;
        while (total() === base) {
            if (Date.now() > deadline) {
                throw new Error('timed out waiting for the handler to answer');
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        // give any trailing output a chance to land
        await new Promise((resolve) => setTimeout(resolve, 50));
    };

    return Object.assign(harness, { send, relayed, texts, images });
}

/** Reads the single_select rows out of either interactive shape. */
function readRows(entry) {
    const im = entry.message.interactiveMessage;
    const card = im.carouselMessage ? im.carouselMessage.cards[0] : im;
    const flow = card.nativeFlowMessage;
    const params = JSON.parse(flow.buttons[0].buttonParamsJson);
    return {
        im,
        card,
        flow,
        buttonName: flow.buttons[0].name,
        sectionTitle: params.sections[0].title,
        rows: params.sections[0].rows,
    };
}

function hasBizNode(opts) {
    return (opts.additionalNodes ?? []).some((node) => node.tag === 'biz');
}

function isCarousel(entry) {
    return Boolean(entry.message.interactiveMessage.carouselMessage);
}

describe('Menu rides on one carousel with the biz node', () => {
    let harness;

    beforeEach(() => {
        harness = createHarness();
    });

    it('sends a single carousel, so nobody sees the list twice', async () => {
        await harness.send('/menu');
        assert.equal(harness.relayed.length, 1, 'one message must be enough for every client');
        assert.equal(harness.texts.length, 0);
        assert.equal(harness.images.length, 0, 'the image lives in the carousel header, not on its own message');
    });

    it('relays with the biz node, without which Android drops the carousel', async () => {
        await harness.send('/menu');
        assert.equal(hasBizNode(harness.relayed[0].opts), true);
    });

    it('keeps the mixed native flow name and version 1, the only combination that survives', async () => {
        await harness.send('/menu');
        const { flow } = readRows(harness.relayed[0]);
        assert.equal(flow.buttons[0].name, 'single_select');
        assert.equal(flow.messageVersion, 1);
        assert.equal(flow.messageParamsJson, '{}');
        const node = harness.relayed[0].opts.additionalNodes.find((n) => n.tag === 'biz');
        assert.equal(node.content[0].content[0].attrs.name, 'mixed');
    });

    it('carries the header image inside the card', async () => {
        await harness.send('/menu');
        const { card } = readRows(harness.relayed[0]);
        assert.equal(card.header.title, '✨ GG BOT — COMMAND CENTER ✨');
        assert.equal(card.header.hasMediaAttachment, true);
        assert.ok(card.header.imageMessage, 'the card must carry the uploaded image');
    });

    it('lists the sections for /menu', async () => {
        await harness.send('/menu');
        assert.deepEqual(
            readRows(harness.relayed[0]).rows.map((r) => r.id),
            ['/sezione core', '/sezione rpg', '/sezione owner'],
        );
    });

    it('never relays a section, so there is no second prompt to tap', async () => {
        await harness.send('/sezione rpg');
        assert.equal(harness.relayed.length, 0, 'a section is a text list, not an interactive message');
        assert.equal(harness.texts.length, 0);
        assert.equal(harness.images.length, 1);
    });

    it('puts the section image and the list in one message', async () => {
        await harness.send('/sezione rpg');
        const [section] = harness.images;
        assert.equal(section.mimetype, 'image/png');
        assert.match(section.caption, /🎮/);
        assert.match(section.caption, /𝐑𝐏𝐆/, 'the section name goes in the decorative font');
        assert.ok(!/Scegli/.test(section.caption), 'no selection button may be advertised');
    });

    it('lists the commands of a section in the decorative font', async () => {
        await harness.send('/sezione rpg');
        const { caption } = harness.images[0];
        assert.ok(caption.includes('/𝐫𝐮𝐛𝐚'), `ruba missing from:\n${caption}`);
        assert.ok(caption.includes('/𝐮𝐬𝐨'), `uso missing from:\n${caption}`);
        assert.ok(caption.includes('⮕'), 'the bullets come from the menu style');
    });

    it('falls back to a plain text list when the image cannot be sent', async () => {
        harness.imageSendShouldThrow = true;
        await harness.send('/sezione rpg');
        assert.equal(harness.images.length, 0);
        assert.equal(harness.texts.length, 1);
        assert.match(harness.texts[0].text, /𝐑𝐏𝐆/);
    });

    it('drops to the plain native flow only when the carousel cannot be relayed', async () => {
        harness.relayFailTimes = 1;
        await harness.send('/menu');
        assert.equal(harness.relayed.length, 1, 'the fallback replaces the carousel, it does not follow it');
        assert.equal(isCarousel(harness.relayed[0]), false);
        assert.equal(harness.texts.length, 0);
    });

    it('falls back to plain text when neither shape can be relayed', async () => {
        harness.relayFailTimes = 2;
        await harness.send('/menu');
        assert.equal(harness.relayed.length, 0);
        assert.equal(harness.texts.length, 1, 'the user must still get an answer');
        assert.match(harness.texts[0].text, /\/sezione core/);
    });

    it('still answers with a card without image when the upload fails', async () => {
        harness.uploadShouldThrow = true;
        await harness.send('/menu');
        assert.equal(harness.relayed.length, 1);
        const { card } = readRows(harness.relayed[0]);
        assert.equal(card.header.hasMediaAttachment ?? false, false);
        assert.ok(card.header.title, 'the title must survive a failed upload');
    });
});
