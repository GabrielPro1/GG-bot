import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RpgService } from '../src/services/rpg/rpg.service.js';
import { PlayerRepository } from '../src/services/rpg/player.repository.js';
import { IdentityService } from '../src/services/identity/identity.service.js';
import { CommandRegistry } from '../src/commands/registry.js';
import { CommandDispatcher } from '../src/commands/dispatcher.js';
import { COMMAND_ALIASES } from '../src/commands/aliases.js';
import negozioCommand from '../src/commands/rpg/negozio.js';
import acquistaCommand from '../src/commands/rpg/acquista.js';
import type { RpgServiceView } from '../src/services/rpg/types.js';
import type { WaUserIdentity } from '../src/services/identity/types.js';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers.js';

let db: Database.Database;
let buyer: WaUserIdentity;

beforeEach(() => {
  db = createTestDb();
  buyer = new IdentityService({}, db).fromJid('1000@s.whatsapp.net')!;
});

function rpg(): RpgServiceView {
  return new RpgService(new PlayerRepository(db)) as RpgServiceView;
}

test('COMMAND_ALIASES is a non-empty map of command -> alias lists', () => {
  assert.ok(COMMAND_ALIASES);
  assert.equal(typeof COMMAND_ALIASES, 'object');
  assert.ok(Object.keys(COMMAND_ALIASES).length > 0);
});

test('every configured alias resolves to its owning command (no dangling keys)', () => {
  const registry = new CommandRegistry(COMMAND_ALIASES);
  for (const commandName of Object.keys(COMMAND_ALIASES)) {
    registry.register({ name: commandName, execute: async () => undefined });
  }
  for (const [commandName, aliases] of Object.entries(COMMAND_ALIASES)) {
    assert.ok(registry.has(commandName), `missing command "${commandName}"`);
    for (const alias of aliases) {
      assert.equal(
        registry.get(alias)?.name,
        commandName,
        `alias "${alias}" should route to "${commandName}"`,
      );
    }
  }
});

test('a command without aliases still resolves by its own name', () => {
  const registry = new CommandRegistry(COMMAND_ALIASES);
  registry.register({ name: 'ping', execute: async () => undefined });
  assert.ok(registry.has('ping'));
  assert.equal(registry.get('ping')!.name, 'ping');
});

test('alias is resolved together with the main command to the same handler', () => {
  const registry = new CommandRegistry({ negozio: ['shop', 'store'] });
  registry.register(negozioCommand);
  for (const trigger of ['negozio', 'shop', 'store']) {
    assert.equal(registry.get(trigger)?.name, 'negozio');
  }
});

test('removing an alias from the config makes it unrecognised (without touching the command)', () => {
  const registry = new CommandRegistry({ negozio: ['store'] });
  registry.register(negozioCommand);
  assert.equal(registry.get('negozio')?.name, 'negozio');
  assert.equal(registry.get('store')?.name, 'negozio');
  assert.equal(registry.get('shop'), null);
});

test('aliases pass arguments to the handler exactly like the main command', async () => {
  const registry = new CommandRegistry({ acquista: ['buy'] });
  registry.register(acquistaCommand);
  const rpgView = rpg();
  rpgView.getOrCreatePlayer(buyer.userId);
  const dispatcher = new CommandDispatcher(registry, rpgView, {} as never);

  const makeRunner = () => {
    const replies: string[] = [];
    return {
      run: async (text: string) => {
        await dispatcher.handle(text, {
          identity: buyer,
          reply: async (t) => replies.push(t),
          sendList: async () => undefined,
          mentions: [],
          quoted: null,
        });
        return replies.join('\n');
      },
    };
  };

  const mainOut = await makeRunner().run('/acquista pozione');
  assert.equal(mainOut.includes('Acquisto completato'), true);

  const aliasOut = await makeRunner().run('/buy pozione');
  assert.equal(aliasOut.includes('Acquisto completato'), true);
});

test('duplicate aliases within the same config are normalised, not double-registered', () => {
  const registry = new CommandRegistry({ negozio: ['shop', 'shop', 'store'] });
  const result = registry.register(negozioCommand);
  assert.equal(result.ok, true);
  assert.equal(registry.get('shop')?.name, 'negozio');
  assert.equal(registry.get('store')?.name, 'negozio');
  // "shop" is claimed exactly once: another command cannot reuse it.
  const conflict = registry.register(
    { name: 'acquista', aliases: ['shop'], execute: async () => undefined },
  );
  assert.equal(conflict.ok, false);
  assert.match(conflict.error ?? '', /in use/);
});

test('conflicting aliases across two commands are rejected with a clear error', () => {
  const registry = new CommandRegistry({ negozio: ['shop'] });
  registry.register(negozioCommand);
  // another command declares the same alias inline -> its registration is rejected.
  const result = registry.register(
    { name: 'combatti', aliases: ['shop'], execute: async () => undefined },
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /in use/);
});

test('both main name and aliases are case-insensitive', () => {
  const registry = new CommandRegistry({ negozio: ['shop'] });
  registry.register(negozioCommand);
  for (const trigger of ['negozio', 'NEGOZIO', 'NeGoZiO', 'SHOP', 'Shop', 'sHoP']) {
    assert.equal(registry.get(trigger)?.name, 'negozio', `"${trigger}" should resolve`);
  }
});

test('regression: full dispatch flow works for main, alias and unknown command', async () => {
  const registry = new CommandRegistry({ negozio: ['shop'] });
  registry.register(negozioCommand);
  const dispatcher = new CommandDispatcher(registry, rpg(), {} as never);

  async function run(text: string): Promise<boolean> {
    return dispatcher.handle(text, {
      identity: buyer,
      reply: async () => undefined,
      sendList: async () => undefined,
      mentions: [],
      quoted: null,
    });
  }

  assert.equal(await run('/negozio'), true);
  assert.equal(await run('/Shop'), true);
  assert.equal(await run('/unknowncmd'), false);
});
