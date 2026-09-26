import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { CommandRegistry } from '../lib/commands/registry.js';

/** Mirrors the payload built by sendList() in handler.js. */
function buildList({ text, title, footer, buttonText, rows }) {
    return proto.Message.create({
        interactiveMessage: {
            header: {
                title,
                hasMediaAttachment: true,
                imageMessage: { url: 'https://example.invalid/menu.png' },
            },
            body: { text },
            footer: { text: footer },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: buttonText,
                            sections: [
                                {
                                    title,
                                    rows: rows.map((row) => ({
                                        title: row.title,
                                        description: row.description,
                                        id: row.rowId,
                                    })),
                                },
                            ],
                        }),
                    },
                ],
                messageVersion: 1,
            },
        },
    });
}

function makeCommand(name, category, emoji = '🔹') {
    return {
        name,
        category,
        emoji,
        description: `${name} desc`,
        execute: () => undefined,
    };
}

function makeRegistry(extra = []) {
    const registry = new CommandRegistry();
    registry.register(makeCommand('comandocore', 'core', '⚙️'));
    registry.register(makeCommand('comandorpg1', 'rpg', '🎮'));
    registry.register(makeCommand('comandorpg2', 'rpg', '🎮'));
    registry.register(makeCommand('nuovomonete', 'owner', '👑'));
    registry.register(makeCommand('rimuovimonete', 'owner', '👑'));
    for (const command of extra) {
        registry.register(command);
    }
    return registry;
}

async function callPlugin(path, registry, args = []) {
    const plugin = (await import(path)).default;
    const captured = { lists: [], replies: [] };
    await plugin.execute({
        args,
        registry,
        rpg: {},
        reply: async (text) => {
            captured.replies.push(text);
        },
        sendList: async (options) => {
            captured.lists.push(options);
        },
        mentions: [],
        quoted: null,
    });
    return captured;
}

const MENU = '../plugins/core/menu.js';
const SEZIONE = '../plugins/core/sezione.js';

describe('Menu native flow payload structure (Baileys 7.0.0-rc14)', () => {
    it('serialises a single_select list with a header image and no carousel', () => {
        const msg = buildList({
            text: 'Seleziona una categoria',
            title: '✨ GG BOT — COMMAND CENTER ✨',
            footer: 'Usa /menu per aggiornare',
            buttonText: '📋 Scegli Categoria',
            rows: [{ title: '⚙️ CORE', description: '1 comando disponibile', rowId: '/sezione core' }],
        });
        const full = generateWAMessageFromContent('123456@s.whatsapp.net', msg, { userJid: '' });
        const im = full.message.interactiveMessage;

        assert.ok(im, 'message must contain interactiveMessage');
        assert.equal(im.carouselMessage ?? null, null, 'the menu must not be a carousel anymore');
        assert.ok(im.header, 'message must carry a header');
        assert.equal(im.header.hasMediaAttachment, true);
        assert.equal(im.header.title, '✨ GG BOT — COMMAND CENTER ✨');
        assert.equal(im.body.text, 'Seleziona una categoria');
        assert.equal(im.footer.text, 'Usa /menu per aggiornare');
        assert.equal(im.nativeFlowMessage.messageVersion, 1);
        assert.equal(im.nativeFlowMessage.buttons[0].name, 'single_select');

        const params = JSON.parse(im.nativeFlowMessage.buttons[0].buttonParamsJson);
        assert.equal(params.title, '📋 Scegli Categoria');
        assert.equal(params.sections[0].rows[0].id, '/sezione core');
        assert.ok(proto.Message.encode(msg).finish().length > 0, 'proto message encodes without error');
    });
});

describe('Menu lists sections, not commands', () => {
    it('exposes one row per category, each pointing at /sezione', async () => {
        const { lists } = await callPlugin(MENU, makeRegistry());
        assert.equal(lists.length, 1, 'menu must send a single list');

        const rows = lists[0].rows;
        const core = rows.find((r) => r.title === '⚙️ CORE');
        const rpg = rows.find((r) => r.title === '🎮 RPG');
        const owner = rows.find((r) => r.title === '👑 OWNER');
        assert.ok(core && rpg && owner, 'CORE, RPG and OWNER must all be listed');
        assert.equal(core.rowId, '/sezione core');
        assert.equal(rpg.rowId, '/sezione rpg');
        assert.equal(owner.rowId, '/sezione owner');
    });

    it('never points a top level row straight at a command', async () => {
        const { lists } = await callPlugin(MENU, makeRegistry());
        for (const row of lists[0].rows) {
            assert.match(row.rowId, /^\/sezione \w+$/, `row "${row.title}" must open a section`);
        }
        assert.ok(
            !lists[0].rows.some((row) => row.rowId === '/comandorpg1'),
            'commands must not be selectable from the top level menu',
        );
    });

    it('describes each section with a registry-derived count', async () => {
        const { lists } = await callPlugin(MENU, makeRegistry());
        const rows = lists[0].rows;
        assert.equal(rows.find((r) => r.title === '⚙️ CORE').description, '1 comando disponibile');
        assert.equal(rows.find((r) => r.title === '🎮 RPG').description, '2 comandi disponibili');
        assert.equal(rows.find((r) => r.title === '👑 OWNER').description, '2 comandi disponibili');
    });

    it('updates the counts when the registry changes', async () => {
        const before = await callPlugin(MENU, makeRegistry());
        const after = await callPlugin(MENU, makeRegistry([makeCommand('nuovorpg', 'rpg', '🎮')]));
        const pick = (result) => result.lists[0].rows.find((r) => r.title === '🎮 RPG').description;
        assert.equal(pick(before), '2 comandi disponibili');
        assert.equal(pick(after), '3 comandi disponibili');
    });
});

describe('/sezione lists the commands of one category', () => {
    it('lists the commands of the requested category', async () => {
        const { lists } = await callPlugin(SEZIONE, makeRegistry(), ['rpg']);
        assert.equal(lists.length, 1);

        const list = lists[0];
        assert.equal(list.imageKey, 'rpg', 'the section must use its own header image');
        assert.equal(list.rows.length, 2);
        assert.deepEqual(
            list.rows.map((r) => r.rowId).sort(),
            ['/comandorpg1', '/comandorpg2'],
        );
    });

    it('keeps the commands sorted and prefixed', async () => {
        const { lists } = await callPlugin(SEZIONE, makeRegistry(), ['owner']);
        assert.deepEqual(
            lists[0].rows.map((r) => r.title),
            ['👑 /nuovomonete', '👑 /rimuovimonete'],
        );
    });

    it('shows the section title and its count in the body', async () => {
        const { lists } = await callPlugin(SEZIONE, makeRegistry(), ['rpg']);
        assert.equal(lists[0].text, '🎮 RPG\n2 comandi disponibili');
    });

    it('rejects an unknown category instead of sending a list', async () => {
        const { lists, replies } = await callPlugin(SEZIONE, makeRegistry(), ['inesistente']);
        assert.equal(lists.length, 0);
        assert.equal(replies.length, 1);
        assert.match(replies[0], /sconosciuta/);
    });

    it('asks for a category when called without arguments', async () => {
        const { lists, replies } = await callPlugin(SEZIONE, makeRegistry(), []);
        assert.equal(lists.length, 0);
        assert.match(replies[0], /Indica una categoria/);
    });

    it('is reachable through its alias', async () => {
        const sezione = (await import(SEZIONE)).default;
        assert.deepEqual(sezione.aliases, ['sez']);
        assert.equal(sezione.hidden, true, 'sezione must stay out of the command lists');
    });
});
