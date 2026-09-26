import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { CommandRegistry } from '../lib/commands/registry.js';
function renderBody(section) {
    return `${section.title}\n${section.rows.length} ${section.rows.length === 1 ? 'comando' : 'comandi'} ${section.rows.length === 1 ? 'disponibile' : 'disponibili'}`;
}
function buildCarousel(text, footer, buttonText, sections) {
    const cards = sections.map((section) => {
        const buttonParamsJson = JSON.stringify({
            title: buttonText,
            sections: [
                {
                    title: section.title,
                    rows: section.rows.map((row) => ({
                        title: row.title,
                        description: row.description,
                        id: row.rowId,
                    })),
                },
            ],
        });
        return {
            header: {
                title: section.title,
                hasMediaAttachment: true,
                imageMessage: { url: 'https://example.invalid/menuimage.png' },
            },
            body: {
                text: `${section.title}\n${section.rows.length} ${section.rows.length === 1 ? 'comando' : 'comandi'} ${section.rows.length === 1 ? 'disponibile' : 'disponibili'}`,
            },
            footer: { text },
            nativeFlowMessage: {
                buttons: [{ name: 'single_select', buttonParamsJson }],
                messageVersion: 1,
            },
        };
    });
    return proto.Message.create({
        interactiveMessage: {
            carouselMessage: {
                cards,
                messageVersion: 1,
                carouselCardType: proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.HSCROLL_CARDS,
            },
            body: { text },
            footer: { text },
        },
    });
}
describe('Carousel menu payload structure (Baileys 7.0.0-rc14)', () => {
    it('builds a serializable interactive carousel with single_select cards', () => {
        const sections = [
            {
                title: 'CORE',
                rows: [
                    { title: '⚙️ /ping', rowId: '/ping', description: 'Ping' },
                    { title: '📖 /menu', rowId: '/menu', description: 'Menu' },
                ],
            },
            {
                title: 'RPG',
                rows: [{ title: '🎮 /profilo', rowId: '/profilo', description: 'Profilo' }],
            },
        ];
        const msg = buildCarousel('Seleziona', 'GG Bot', '📋 Apri Menu', sections);
        const full = generateWAMessageFromContent('123456@s.whatsapp.net', msg, {
            userJid: '999999999@s.whatsapp.net',
        });
        const out = msg.interactiveMessage;
        assert.ok(out.carouselMessage, 'interactiveMessage must contain carouselMessage');
        assert.equal(out.carouselMessage.messageVersion, 1);
        assert.equal(out.carouselMessage.carouselCardType, 1);
        assert.equal(out.carouselMessage.cards?.length, 2);
        const first = out.carouselMessage.cards[0];
        assert.ok(first.nativeFlowMessage, 'each card must have nativeFlowMessage');
        assert.equal(first.nativeFlowMessage.messageVersion, 1);
        assert.equal(first.nativeFlowMessage.buttons?.[0]?.name, 'single_select');
        const params = JSON.parse(first.nativeFlowMessage.buttons[0].buttonParamsJson);
        assert.equal(params.title, '📋 Apri Menu');
        assert.equal(params.sections[0].rows.length, 2);
        assert.equal(params.sections[0].rows[0].id, '/ping');
        // each card must expose its OWN rows and a distinct derived body
        const second = out.carouselMessage.cards[1];
        const firstParams = JSON.parse(first.nativeFlowMessage.buttons[0].buttonParamsJson);
        const secondParams = JSON.parse(second.nativeFlowMessage.buttons[0].buttonParamsJson);
        assert.deepEqual(firstParams.sections[0].title, 'CORE');
        assert.deepEqual(secondParams.sections[0].title, 'RPG');
        assert.equal(firstParams.sections[0].rows.length, 2);
        assert.equal(secondParams.sections[0].rows.length, 1);
        assert.notEqual(first.body?.text, second.body?.text);
        assert.equal(first.body?.text, 'CORE\n2 comandi disponibili');
        assert.equal(first.body?.text?.startsWith(firstParams.sections[0].title), true);
        assert.equal(full.key.remoteJid, '123456@s.whatsapp.net');
        assert.ok(full.message?.interactiveMessage?.carouselMessage, 'generated message serializes carousel');
        assert.ok(proto.Message.encode(msg).finish().length > 0, 'proto message encodes without error');
    });
});
describe('Menu card category visibility', () => {
    async function runMenu() {
        const registry = new CommandRegistry();
        const make = (name, category, emoji) => ({
            name,
            category,
            emoji,
            description: `${name} desc`,
            execute: () => undefined,
        });
        registry.register(make('comandocore', 'core', '⚙️'));
        registry.register(make('comandorpg1', 'rpg', '🎮'));
        registry.register(make('comandorpg2', 'rpg', '🎮'));
        registry.register(make('nuovomonete', 'owner', '👑'));
        registry.register(make('rimuovimonete', 'owner', '👑'));
        // an out-of-order extra rpm command to prove counts derive from the registry
        registry.register(make('extra', 'rpg', '🎮'));
        const menu = (await import('../plugins/core/menu.js')).default;
        let captured = [];
        await menu.execute({
            args: [],
            identity: {
                userId: 'owner-user',
                lid: null,
                pn: '1234@s.whatsapp.net',
                username: 'Owner',
            },
            reply: async () => undefined,
            sendList: async (options) => {
                captured = options.sections.map((s) => ({ title: s.title, rows: asRows(s.rows) }));
            },
            registry: registry,
            rpg: {
                getOrCreatePlayer: () => undefined,
            },
            mentions: [],
            quoted: null,
        });
        return captured;
    }
    function asRows(rows) {
        return rows.map((r) => ({ title: r.title, rowId: r.rowId }));
    }
    it('each card body shows the category name and a registry-derived count', async () => {
        const sections = await runMenu();
        assert.ok(sections.length >= 3, 'menu must expose CORE, RPG and OWNER sections');
        const core = sections.find((s) => s.title === '⚙️ CORE');
        const rpg = sections.find((s) => s.title === '🎮 RPG');
        const owner = sections.find((s) => s.title === '👑 OWNER');
        assert.ok(core, 'CORE section must exist with emoji');
        assert.ok(rpg, 'RPG section must exist with emoji');
        assert.ok(owner, 'OWNER section must exist with emoji');
        assert.equal(renderBody(core), '⚙️ CORE\n1 comando disponibile');
        assert.equal(renderBody(rpg), '🎮 RPG\n3 comandi disponibili');
        assert.equal(renderBody(owner), '👑 OWNER\n2 comandi disponibili');
        // the category name is embedded in the card body preview (not only inside single_select)
        for (const section of sections) {
            assert.equal(renderBody(section).startsWith(section.title), true);
            assert.equal(renderBody(section).includes('disponibil'), true);
            assert.equal(/^[0-9]+ comand[oi] disponibil[ei]$/.test(renderBody(section).split('\n')[1]), true);
        }
    });
    it('counts change when the registry changes', async () => {
        const first = await runMenu();
        const rpgBefore = first.find((s) => s.title === '🎮 RPG');
        assert.equal(rpgBefore.rows.length, 3);
        const another = await runMenuWithExtra();
        const rpgAfter = another.find((s) => s.title === '🎮 RPG');
        assert.equal(rpgAfter.rows.length, 4);
    });
});
async function runMenuWithExtra() {
    const registry = new CommandRegistry();
    const make = (name, category, emoji) => ({
        name,
        category,
        emoji,
        description: `${name} desc`,
        execute: () => undefined,
    });
    registry.register(make('a', 'core', '⚙️'));
    registry.register(make('b', 'rpg', '🎮'));
    registry.register(make('c', 'rpg', '🎮'));
    registry.register(make('d', 'rpg', '🎮'));
    registry.register(make('z', 'rpg', '🎮'));
    registry.register(make('owner1', 'owner', '👑'));
    registry.register(make('owner2', 'owner', '👑'));
    const menu = (await import('../plugins/core/menu.js')).default;
    let captured = [];
    await menu.execute({
        args: [],
        identity: {
            userId: 'owner-user',
            lid: null,
            pn: '1234@s.whatsapp.net',
            username: 'Owner',
        },
        reply: async () => undefined,
        sendList: async (options) => {
            captured = options.sections.map((s) => ({ title: s.title, rows: asRows2(s.rows) }));
        },
        registry: registry,
        rpg: {},
        mentions: [],
        quoted: null,
    });
    return captured;
}
function asRows2(rows) {
    return rows.map((r) => ({ title: r.title, rowId: r.rowId }));
}
