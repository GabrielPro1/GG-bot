import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityService } from '../lib/identity/identity.service.js';
import { RpgService } from '../lib/rpg/rpg.service.js';
import { PlayerRepository } from '../lib/rpg/player.repository.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { CommandDispatcher } from '../lib/commands/dispatcher.js';
import { OwnerService } from '../config.js';
import { resolveTargetUser } from '../lib/target.js';
import combattiCommand from '../plugins/rpg/combatti.js';
import rubaCommand from '../plugins/rpg/ruba.js';
import aggiungimoneteCommand from '../plugins/owner/aggiungimonete.js';
import rimuovimoneteCommand from '../plugins/owner/rimuovimonete.js';
import { createTestDb } from './helpers.js';
const CASES = [
    { key: 'combat', label: '/combatti', text: '/combatti', ownerOnly: false },
    { key: 'rob', label: '/ruba', text: '/ruba', ownerOnly: false },
    { key: 'add', label: '/aggiungimonete', text: '/aggiungimonete 50', ownerOnly: true },
    { key: 'rm', label: '/rimuovimonete', text: '/rimuovimonete 10', ownerOnly: true },
];
function makeMention(jid, identity) {
    return { jid, identity };
}
describe('target precedence (mention → quote → none)', () => {
    let db;
    let identityService;
    let caller;
    let owner;
    const TARGET_PN = '1111@s.whatsapp.net';
    const OTHER_PN = '5555@s.whatsapp.net';
    beforeEach(() => {
        db = createTestDb();
        identityService = new IdentityService({}, db);
        caller = identityService.fromJid('9000@s.whatsapp.net');
        owner = identityService.fromJid('1234@s.whatsapp.net');
    });
    function rpg() {
        return new RpgService(new PlayerRepository(db));
    }
    function buildDispatchers() {
        const rpgView = new RpgService(new PlayerRepository(db));
        const ownerService = new OwnerService({ owners: ['1234@s.whatsapp.net'] });
        const registryCombat = new CommandRegistry();
        registryCombat.register(combattiCommand);
        const combat = new CommandDispatcher(registryCombat, rpgView, ownerService);
        const registryRob = new CommandRegistry();
        registryRob.register(rubaCommand);
        const rob = new CommandDispatcher(registryRob, rpgView, ownerService);
        const registryAdd = new CommandRegistry();
        registryAdd.register(aggiungimoneteCommand);
        const add = new CommandDispatcher(registryAdd, rpgView, ownerService);
        const registryRm = new CommandRegistry();
        registryRm.register(rimuovimoneteCommand);
        const rm = new CommandDispatcher(registryRm, rpgView, ownerService);
        const map = { combat, rob, add, rm };
        return { rpg: rpgView, map };
    }
    async function run(dispatcher, text, identity, mentions = [], quoted = null) {
        const replies = [];
        await dispatcher.handle(text, {
            identity,
            reply: async (t) => replies.push(t),
            sendList: async () => undefined,
            mentions: mentions,
            quoted: quoted,
        });
        return replies.join('\n');
    }
    // Actor identity to use per command (owner-only commands need the owner).
    function identityFor(c) {
        return c.ownerOnly ? owner : caller;
    }
    function actorIdentityId(c) {
        return identityService.fromJid(c.ownerOnly ? '1234@s.whatsapp.net' : '9000@s.whatsapp.net').userId;
    }
    function seedPlayers(rpgView, userIds) {
        for (const userId of userIds)
            rpgView.getOrCreatePlayer(userId);
    }
    describe('resolveTargetUser helper', () => {
        const mentionA = makeMention('A@s.whatsapp.net', { userId: 'a' });
        const quoteB = makeMention('B@s.whatsapp.net', { userId: 'b' });
        it('returns the mention when only a mention is present', () => {
            assert.equal(resolveTargetUser([mentionA], null), mentionA);
        });
        it('returns the quoted sender when only a quote is present', () => {
            assert.equal(resolveTargetUser([], quoteB), quoteB);
        });
        it('prefers the mention over the quote when both are present', () => {
            assert.equal(resolveTargetUser([mentionA], quoteB), mentionA);
        });
        it('returns null when neither a mention nor a quote is present', () => {
            assert.equal(resolveTargetUser([], null), null);
        });
    });
    describe('target-user commands', () => {
        for (const c of CASES) {
            describe(c.label, () => {
                it('targets the mentioned user (case 1)', async () => {
                    const target = identityService.fromJid(TARGET_PN);
                    const { map, rpg: rpgView } = buildDispatchers();
                    seedPlayers(rpgView, [identityFor(c).userId, target.userId]);
                    const out = await run(map[c.key], c.text, identityFor(c), [makeMention(TARGET_PN, target)]);
                    assert.equal(out.includes(`@${TARGET_PN}`), true, 'reply must reference the mentioned user');
                });
                it('targets the quoted sender (case 2)', async () => {
                    const target = identityService.fromJid(TARGET_PN);
                    const { map, rpg: rpgView } = buildDispatchers();
                    seedPlayers(rpgView, [identityFor(c).userId, target.userId]);
                    const out = await run(map[c.key], c.text, identityFor(c), [], makeMention(TARGET_PN, target));
                    assert.equal(out.includes(`@${TARGET_PN}`), true, 'reply must reference the quoted sender');
                });
                it('mention wins over quoted sender (case 3)', async () => {
                    const mentionTarget = identityService.fromJid(TARGET_PN);
                    const quotedTarget = identityService.fromJid(OTHER_PN);
                    const { map, rpg: rpgView } = buildDispatchers();
                    seedPlayers(rpgView, [identityFor(c).userId, mentionTarget.userId, quotedTarget.userId]);
                    const out = await run(map[c.key], c.text, identityFor(c), [makeMention(TARGET_PN, mentionTarget)], makeMention(OTHER_PN, quotedTarget));
                    assert.equal(out.includes(`@${TARGET_PN}`), true, 'reply must reference the mentioned user (winner)');
                    assert.equal(out.includes(`@${OTHER_PN}`), false, 'reply must NOT reference the quoted sender (loser)');
                });
                it('with no mention and no quote, keeps prior behavior (case 4)', async () => {
                    const actor = identityFor(c);
                    const { map, rpg: rpgView } = buildDispatchers();
                    seedPlayers(rpgView, [actor.userId]);
                    const out = await run(map[c.key], c.text, actor);
                    // No target resolved -> the command falls back to its previous "no target" reply.
                    assert.equal(out.length > 0, true);
                    assert.equal(out.includes(`@${TARGET_PN}`), false);
                    assert.equal(out.includes(`@${OTHER_PN}`), false);
                    // It must be a usage/help response, not an executed action for a player.
                    assert.equal(out.includes(actorIdentityId(c)), false, 'reply must not reference the actor as a target change');
                });
            });
        }
    });
});
