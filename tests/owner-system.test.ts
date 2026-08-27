import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityService } from '../src/services/identity/identity.service.js';
import { RpgService } from '../src/services/rpg/rpg.service.js';
import { PlayerRepository } from '../src/services/rpg/player.repository.js';
import { CommandRegistry } from '../src/commands/registry.js';
import { CommandDispatcher } from '../src/commands/dispatcher.js';
import { OwnerService } from '../src/config/owners.js';
import aggiungimoneteCommand from '../src/commands/owner/aggiungimonete.js';
import rimuovimoneteCommand from '../src/commands/owner/rimuovimonete.js';
import type { RpgServiceView } from '../src/services/rpg/types.js';
import type { WaUserIdentity } from '../src/services/identity/types.js';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers.js';

interface DispatchOptions {
  text: string;
  identity: WaUserIdentity;
  mentions?: readonly unknown[];
  quoted?: unknown;
}

function makeMention(jid: string, identity: unknown): unknown {
  return { jid, identity };
}

describe('Owner system', () => {
  let db: Database.Database;
  let identityService: IdentityService;
  let ownerIdentity: WaUserIdentity;
  let nonOwnerIdentity: WaUserIdentity;

  beforeEach(() => {
    db = createTestDb();
    identityService = new IdentityService({}, db);
    ownerIdentity = identityService.fromJid('1234@s.whatsapp.net')!;
    nonOwnerIdentity = identityService.fromJid('9999@s.whatsapp.net')!;
  });

  describe('OwnerService', () => {
    it('recognizes an owner by PN identifier', () => {
      const svc = new OwnerService({ owners: ['1234@s.whatsapp.net'] });
      assert.equal(svc.isOwner(ownerIdentity), true);
    });

    it('recognizes an owner by LID identifier', () => {
      const lidIdentity = identityService.fromJid(null, 'aaaa@lid')!;
      const svc = new OwnerService({ owners: ['AAAA@lid'] });
      assert.equal(svc.isOwner(lidIdentity), true);
    });

    it('does not recognize non-owners or null', () => {
      const svc = new OwnerService({ owners: ['1234@s.whatsapp.net'] });
      assert.equal(svc.isOwner(nonOwnerIdentity), false);
      assert.equal(svc.isOwner(null), false);
      assert.equal(svc.isOwner(undefined), false);
    });

    it('ignores empty owner lists', () => {
      const svc = new OwnerService({});
      assert.equal(svc.isOwner(ownerIdentity), false);
    });
  });

  describe('Dispatcher ownerOnly guard', () => {
    function build() {
      const registry = new CommandRegistry();
      registry.register({
        name: 'segreto',
        category: 'owner',
        ownerOnly: true,
        execute: async ({ reply }) => {
          await reply('ESEGUITO');
        },
      });
      const rpg = new RpgService(new PlayerRepository(db)) as RpgServiceView;
      const ownerService = new OwnerService({ owners: ['1234@s.whatsapp.net'] });
      const dispatcher = new CommandDispatcher(registry, rpg, ownerService);
      return { dispatcher };
    }

    async function dispatch({ dispatcher }: { dispatcher: CommandDispatcher }, opts: DispatchOptions) {
      const replies: string[] = [];
      const handled = await dispatcher.handle(opts.text, {
        identity: opts.identity,
        reply: async (t) => {
          replies.push(t);
        },
        sendList: async () => undefined,
        mentions: opts.mentions as never,
        quoted: opts.quoted as never,
      });
      return { handled, replies };
    }

    it('rejects a non-owner and does not execute the command', async () => {
      const { dispatcher } = build();
      const { handled, replies } = await dispatch({ dispatcher }, { text: '/segreto', identity: nonOwnerIdentity });
      assert.equal(handled, true);
      assert.notEqual(replies.join('\n').includes('ESEGUITO'), true);
    });

    it('executes the command for an owner', async () => {
      const { dispatcher } = build();
      const { replies } = await dispatch({ dispatcher }, { text: '/segreto', identity: ownerIdentity });
      assert.equal(replies.join('\n').includes('ESEGUITO'), true);
    });
  });

  describe('/aggiungimonete', () => {
    function build(owners: string[] = ['1234@s.whatsapp.net']) {
      const registry = new CommandRegistry();
      registry.register(aggiungimoneteCommand);
      const repo = new PlayerRepository(db);
      const rpg = new RpgService(repo) as RpgServiceView;
      const ownerService = new OwnerService({ owners });
      const dispatcher = new CommandDispatcher(registry, rpg, ownerService);
      return { registry, rpg, dispatcher, repo };
    }

    async function run(
      dispatcher: CommandDispatcher,
      text: string,
      identity: WaUserIdentity,
      mentions: unknown[] = [],
      quoted: unknown = null,
    ): Promise<{ handled: boolean; replies: string[]; walletOf?: (jid: string) => number }> {
      const replies: string[] = [];
      await dispatcher.handle(text, {
        identity,
        reply: async (t) => {
          replies.push(t);
        },
        sendList: async () => undefined,
        mentions: mentions as never,
        quoted: quoted as never,
      });
      return { handled: true, replies };
    }

    function targetIdentity(jid: string): WaUserIdentity {
      return identityService.fromJid(jid)!;
    }

    it('adds coins to a target via mention', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      await run(dispatcher, '/aggiungimonete 100', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), before + 100);
    });

    it('adds coins to a target via quoted message sender', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      await run(dispatcher, '/aggiungimonete 50', ownerIdentity, [], makeMention('5555@s.whatsapp.net', target));

      assert.equal(rpg.getWalletBalance(target.userId), before + 50);
    });

    it('mentions take precedence over quoted sender when both present', async () => {
      const { dispatcher, rpg } = build();
      const mentionTarget = targetIdentity('1111@s.whatsapp.net');
      const quotedTarget = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(mentionTarget.userId);
      rpg.getOrCreatePlayer(quotedTarget.userId);
      const mentionBefore = rpg.getWalletBalance(mentionTarget.userId);
      const quotedBefore = rpg.getWalletBalance(quotedTarget.userId);

      await run(dispatcher, '/aggiungimonete 25', ownerIdentity, [
        makeMention('1111@s.whatsapp.net', mentionTarget),
      ], makeMention('5555@s.whatsapp.net', quotedTarget));

      assert.equal(rpg.getWalletBalance(mentionTarget.userId), mentionBefore + 25);
      assert.equal(rpg.getWalletBalance(quotedTarget.userId), quotedBefore);
    });

    it('rejects 0, negative, decimal, NaN and Infinity amounts', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      for (const amount of ['0', '-10', '5.5', 'abc', 'Infinity', 'NaN']) {
        const { replies } = await run(dispatcher, `/aggiungimonete ${amount}`, ownerIdentity, [
          makeMention('5555@s.whatsapp.net', target),
        ]);
        assert.equal(rpg.getWalletBalance(target.userId), before, `amount ${amount} must not change wallet`);
        assert.notEqual(replies.join('\n').length, 0);
      }
    });

    it('shows usage when amount is missing', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      const { replies } = await run(dispatcher, '/aggiungimonete', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), before);
      assert.equal(replies.join('\n').includes('MONETE AGGIUNTE'), false);
    });

    it('does not modify a target without an existing RPG profile', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      assert.equal(rpg.getPlayer(target.userId), undefined);

      const { replies } = await run(dispatcher, '/aggiungimonete 100', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getPlayer(target.userId), undefined, 'must not create a player');
      assert.notEqual(replies.join('\n').includes('profilo'), false);
    });

    it('rejects command execution for non-owners', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      const { replies } = await run(dispatcher, '/aggiungimonete 100', nonOwnerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), before, 'non-owner must not add coins');
      assert.equal(replies.join('\n').includes('riservato'), true);
    });

    it('registers with category owner, ownerOnly and appears in the OWNER menu card', async () => {
      const { registry } = build();
      const command = registry.get('aggiungimonete');
      assert.ok(command);
      assert.equal(command.category, 'owner');
      assert.equal(command.ownerOnly, true);

      let ownerSection: { title: string; rows: readonly { title: string; rowId: string }[] } | undefined;
      const menu = (
        await import('../src/commands/core/menu.js')
      ).default;
      await menu.execute({
        args: [],
        identity: ownerIdentity,
        reply: async () => undefined,
        sendList: async (options) => {
          ownerSection = options.sections.find((s) => s.title.includes('OWNER'));
        },
        registry: registry as never,
        rpg: new RpgService(new PlayerRepository(db)) as RpgServiceView,
        mentions: [],
        quoted: null,
      });

      assert.ok(ownerSection, 'menu must contain an OWNER card');
      assert.equal(ownerSection.rows.some((r) => r.rowId === '/aggiungimonete'), true);
    });
  });

  describe('/rimuovimonete', () => {
    function build(owners: string[] = ['1234@s.whatsapp.net']) {
      const registry = new CommandRegistry();
      registry.register(aggiungimoneteCommand);
      registry.register(rimuovimoneteCommand);
      const repo = new PlayerRepository(db);
      const rpg = new RpgService(repo) as RpgServiceView;
      const ownerService = new OwnerService({ owners });
      const dispatcher = new CommandDispatcher(registry, rpg, ownerService);
      return { registry, rpg, dispatcher, repo };
    }

    async function run(
      dispatcher: CommandDispatcher,
      text: string,
      identity: WaUserIdentity,
      mentions: unknown[] = [],
      quoted: unknown = null,
    ): Promise<{ replies: string[] }> {
      const replies: string[] = [];
      await dispatcher.handle(text, {
        identity,
        reply: async (t) => {
          replies.push(t);
        },
        sendList: async () => undefined,
        mentions: mentions as never,
        quoted: quoted as never,
      });
      return { replies };
    }

    function targetIdentity(jid: string): WaUserIdentity {
      return identityService.fromJid(jid)!;
    }

    it('owner + mention performs correct subtraction', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      rpg.addCoins(target.userId, 100);
      rpg.addCoins(target.userId, 100);

      await run(dispatcher, '/rimuovimonete 40', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), 300 - 40);
    });

    it('owner + reply performs correct subtraction', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      rpg.addCoins(target.userId, 100);

      await run(dispatcher, '/rimuovimonete 30', ownerIdentity, [], makeMention('5555@s.whatsapp.net', target));

      assert.equal(rpg.getWalletBalance(target.userId), 200 - 30);
    });

    it('mention wins over quoted sender when both present', async () => {
      const { dispatcher, rpg } = build();
      const mentionTarget = targetIdentity('1111@s.whatsapp.net');
      const quotedTarget = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(mentionTarget.userId);
      rpg.getOrCreatePlayer(quotedTarget.userId);
      rpg.addCoins(mentionTarget.userId, 200);
      rpg.addCoins(quotedTarget.userId, 200);
      const mentionedBefore = rpg.getWalletBalance(mentionTarget.userId);
      const quotedBefore = rpg.getWalletBalance(quotedTarget.userId);

      await run(dispatcher, '/rimuovimonete 10', ownerIdentity, [
        makeMention('1111@s.whatsapp.net', mentionTarget),
      ], makeMention('5555@s.whatsapp.net', quotedTarget));

      assert.equal(rpg.getWalletBalance(mentionTarget.userId), mentionedBefore - 10);
      assert.equal(rpg.getWalletBalance(quotedTarget.userId), quotedBefore);
    });

    it('subtracts fully when balance is sufficient', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      assert.equal(rpg.getWalletBalance(target.userId), 100);

      await run(dispatcher, '/rimuovimonete 40', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), 60);
    });

    it('clamps balance at 0 when amount exceeds balance', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);

      await run(dispatcher, '/rimuovimonete 1000', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), 0);
    });

    for (const [label, amount] of [
      ['quantity missing', ''],
      ['quantity 0', '0'],
      ['quantity negative', '-5'],
      ['quantity decimal', '2.5'],
      ['quantity non numeric', 'abc'],
    ]) {
      it(`rejects ${label} without changing balance`, async () => {
        const { dispatcher, rpg } = build();
        const target = targetIdentity('5555@s.whatsapp.net');
        rpg.getOrCreatePlayer(target.userId);
        rpg.addCoins(target.userId, 100);
        const before = rpg.getWalletBalance(target.userId);

        const text = amount === '' ? '/rimuovimonete' : `/rimuovimonete ${amount}`;
        await run(dispatcher, text, ownerIdentity, [
          makeMention('5555@s.whatsapp.net', target),
        ]);

        assert.equal(rpg.getWalletBalance(target.userId), before);
      });
    }

    it('rejects NaN and Infinity amounts', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      rpg.addCoins(target.userId, 100);
      const before = rpg.getWalletBalance(target.userId);

      for (const amount of ['NaN', 'Infinity']) {
        await run(dispatcher, `/rimuovimonete ${amount}`, ownerIdentity, [
          makeMention('5555@s.whatsapp.net', target),
        ]);
      }

      assert.equal(rpg.getWalletBalance(target.userId), before);
    });

    it('rejects when target is missing', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      const before = rpg.getWalletBalance(target.userId);

      const { replies } = await run(dispatcher, '/rimuovimonete 10', ownerIdentity);

      assert.equal(rpg.getWalletBalance(target.userId), before);
      assert.equal(replies.join('\n').includes('MONETE RIMOSSE'), false);
    });

    it('rejects a target without a profile (does not create one)', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      assert.equal(rpg.getPlayer(target.userId), undefined);

      const { replies } = await run(dispatcher, '/rimuovimonete 10', ownerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getPlayer(target.userId), undefined, 'must not create a player');
      assert.equal(replies.join('\n').includes('non ha ancora un profilo'), true);
    });

    it('rejects a non-owner and leaves balance unchanged', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      rpg.addCoins(target.userId, 100);
      const before = rpg.getWalletBalance(target.userId);

      const { replies } = await run(dispatcher, '/rimuovimonete 10', nonOwnerIdentity, [
        makeMention('5555@s.whatsapp.net', target),
      ]);

      assert.equal(rpg.getWalletBalance(target.userId), before);
      assert.equal(replies.join('\n').includes('riservato'), true);
    });

    it('never lets the balance go negative', async () => {
      const { dispatcher, rpg } = build();
      const target = targetIdentity('5555@s.whatsapp.net');
      rpg.getOrCreatePlayer(target.userId);
      rpg.addCoins(target.userId, 5);

      for (const amount of ['3', '2', '100']) {
        await run(dispatcher, `/rimuovimonete ${amount}`, ownerIdentity, [
          makeMention('5555@s.whatsapp.net', target),
        ]);
      }

      assert.equal(rpg.getWalletBalance(target.userId), 0);
      assert.equal(rpg.getWalletBalance(target.userId) >= 0, true);
    });

    it('appears in the OWNER menu category via the registry', async () => {
      const { registry } = build();
      const command = registry.get('rimuovimonete');
      assert.ok(command);
      assert.equal(command.category, 'owner');
      assert.equal(command.ownerOnly, true);

      let ownerSection: { title: string; rows: readonly { title: string; rowId: string }[] } | undefined;
      const menu = (
        await import('../src/commands/core/menu.js')
      ).default;
      await menu.execute({
        args: [],
        identity: ownerIdentity,
        reply: async () => undefined,
        sendList: async (options) => {
          ownerSection = options.sections.find((s) => s.title.includes('OWNER'));
        },
        registry: registry as never,
        rpg: new RpgService(new PlayerRepository(db)) as RpgServiceView,
        mentions: [],
        quoted: null,
      });

      assert.ok(ownerSection, 'menu must contain an OWNER card');
      assert.equal(ownerSection.rows.some((r) => r.rowId === '/rimuovimonete'), true);
    });
  });
});
