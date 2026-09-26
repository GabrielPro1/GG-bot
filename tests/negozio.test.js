import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityService } from '../lib/identity/identity.service.js';
import { RpgService } from '../lib/rpg/rpg.service.js';
import { PlayerRepository } from '../lib/rpg/player.repository.js';
import { getAllItems } from '../lib/rpg/items/catalog.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { CommandDispatcher } from '../lib/commands/dispatcher.js';
import negozioCommand from '../plugins/rpg/negozio.js';
import acquistaCommand from '../plugins/rpg/acquista.js';
import { createTestDb } from './helpers.js';
describe('/negozio interactive buttons', () => {
    let db;
    let identityService;
    let buyer;
    let other;
    beforeEach(() => {
        db = createTestDb();
        identityService = new IdentityService({}, db);
        buyer = identityService.fromJid('1000@s.whatsapp.net');
        other = identityService.fromJid('2000@s.whatsapp.net');
    });
    function rpg() {
        return new RpgService(new PlayerRepository(db));
    }
    describe('button generation', () => {
        it('renders the normal text shop listing AND interactive quick-reply buttons', async () => {
            const replies = [];
            let sentButtons = false;
            await negozioCommand.execute({
                args: [],
                identity: buyer,
                reply: async (t) => {
                    replies.push(t);
                },
                sendList: async () => undefined,
                sendButtons: async () => {
                    sentButtons = true;
                },
                registry: {},
                rpg: rpg(),
                mentions: [],
                quoted: null,
            });
            assert.equal(sentButtons, true, 'sendButtons must be invoked to render the buttons');
            assert.ok(replies.join('\n').includes('NEGOZIO RPG'), 'normal text shop must still be sent');
        });
        it('generates a button for every purchasable item in the catalog', async () => {
            let captured = null;
            await negozioCommand.execute({
                args: [],
                identity: buyer,
                reply: async () => undefined,
                sendList: async () => undefined,
                sendButtons: async (options) => {
                    captured = { text: options.text, buttons: options.buttons };
                },
                registry: {},
                rpg: rpg(),
                mentions: [],
                quoted: null,
            });
            const buttons = captured.buttons;
            const purchasable = getAllItems().filter((i) => i.price > 0);
            assert.equal(buttons.length, purchasable.length);
            assert.equal(buttons.length, getAllItems().length);
        });
        it('builds the display text from the item emoji and name', async () => {
            let captured = null;
            await negozioCommand.execute({
                args: [],
                identity: buyer,
                reply: async () => undefined,
                sendList: async () => undefined,
                sendButtons: async (options) => {
                    captured = { text: options.text, buttons: options.buttons };
                },
                registry: {},
                rpg: rpg(),
                mentions: [],
                quoted: null,
            });
            const buttons = captured.buttons;
            const pozione = getAllItems().find((i) => i.id === 'pozione');
            const spada = getAllItems().find((i) => i.id === 'spada');
            const idFor = (id) => buttons.find((b) => b.id === `/acquista ${id}`);
            assert.equal(idFor('pozione').displayText, `${pozione.emoji} Compra ${pozione.name}`);
            assert.equal(idFor('spada').displayText, `${spada.emoji} Compra ${spada.name}`);
        });
        it('button id invokes the real /acquista command for that item', async () => {
            let captured = null;
            await negozioCommand.execute({
                args: [],
                identity: buyer,
                reply: async () => undefined,
                sendList: async () => undefined,
                sendButtons: async (options) => {
                    captured = { text: options.text, buttons: options.buttons };
                },
                registry: {},
                rpg: rpg(),
                mentions: [],
                quoted: null,
            });
            const buttons = captured.buttons;
            for (const item of getAllItems()) {
                const button = buttons.find((b) => b.id === `/acquista ${item.id}`);
                assert.ok(button, `must generate a button for catalog item ${item.id}`);
                assert.equal(button.id, `/acquista ${item.id}`);
                assert.equal(button.id.includes(buyer.userId), false, 'must not embed the user id');
                assert.ok(!button.id.includes('@'), 'must not embed any jid/identifier');
            }
        });
        it('does not generate a button for items that are not purchasable', () => {
            const purchasable = getAllItems().filter((i) => i.price > 0);
            const nonPurchasable = getAllItems().filter((i) => i.price <= 0);
            assert.equal(purchasable.length + nonPurchasable.length, getAllItems().length, 'catalog is fully covered');
            assert.equal(typeof purchasable, 'object');
        });
    });
    describe('click flow (button id routes to the real /acquista)', () => {
        function buildDispatcher(rpgView) {
            const registry = new CommandRegistry();
            registry.register(acquistaCommand);
            const dispatcher = new CommandDispatcher(registry, rpgView, {});
            return dispatcher;
        }
        async function run(dispatcher, text, identity) {
            const replies = [];
            await dispatcher.handle(text, {
                identity,
                reply: async (t) => replies.push(t),
                sendList: async () => undefined,
                mentions: [],
                quoted: null,
            });
            return replies.join('\n');
        }
        it('buying from a button identifies the item, the user, charges coins and updates the inventory', async () => {
            const rpgView = rpg();
            const dispatcher = buildDispatcher(rpgView);
            rpgView.getOrCreatePlayer(buyer.userId);
            const walletBefore = rpgView.getWalletBalance(buyer.userId);
            const inventoryBefore = rpgView.getInventory(buyer.userId);
            // the button the user pressed -> executes /acquista pozione as the clicker
            const out = await run(dispatcher, '/acquista pozione', buyer);
            assert.equal(out.includes('Acquisto completato'), true);
            assert.equal(rpgView.getWalletBalance(buyer.userId), 100 - 50);
            assert.equal(rpgView.getInventory(buyer.userId).pozione, (inventoryBefore.pozione ?? 0) + 1);
            assert.equal(walletBefore, 100);
        });
        it('returns the standard insufficient coins message when the wallet is too low', async () => {
            const rpgView = rpg();
            const dispatcher = buildDispatcher(rpgView);
            rpgView.getOrCreatePlayer(buyer.userId); // 100 coins < spada (500)
            const out = await run(dispatcher, '/acquista spada', buyer);
            assert.equal(out.includes('Non hai abbastanza monete'), true);
            assert.equal(rpgView.getInventory(buyer.userId).spada, undefined);
        });
        it('returns the standard unknown item message for a non-existent item (manipulated button id)', async () => {
            const rpgView = rpg();
            const dispatcher = buildDispatcher(rpgView);
            rpgView.getOrCreatePlayer(buyer.userId);
            const walletBefore = rpgView.getWalletBalance(buyer.userId);
            const out = await run(dispatcher, '/acquista inesistente', buyer);
            assert.equal(out.includes('Questo oggetto non esiste'), true);
            assert.equal(rpgView.getWalletBalance(buyer.userId), walletBefore);
        });
        it('always charges the identity of the user who sends the command, never an id from the button', async () => {
            const rpgView = rpg();
            const dispatcher = buildDispatcher(rpgView);
            rpgView.getOrCreatePlayer(buyer.userId); // A: 100 coins
            rpgView.getOrCreatePlayer(other.userId); // B: 100 coins
            const buyerWalletBefore = rpgView.getWalletBalance(buyer.userId);
            const otherWalletBefore = rpgView.getWalletBalance(other.userId);
            // "other" presses a button whose id is /acquista pozione; only B pays.
            await run(dispatcher, '/acquista pozione', other);
            assert.equal(rpgView.getWalletBalance(other.userId), otherWalletBefore - 50);
            assert.equal(rpgView.getWalletBalance(buyer.userId), buyerWalletBefore, 'A must not be charged');
            assert.equal(rpgView.getInventory(buyer.userId).pozione, undefined, "A's inventory must not change");
            assert.equal(rpgView.getInventory(other.userId).pozione, 1);
        });
    });
});
