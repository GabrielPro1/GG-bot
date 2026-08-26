import { connectWhatsApp } from './whatsapp/connection.js';
import { IdentityService } from './services/identity/identity.service.js';
import { RpgService } from './services/rpg/rpg.service.js';
import { PlayerRepository } from './services/rpg/player.repository.js';
import { CommandRegistry } from './commands/registry.js';
import { CommandDispatcher } from './commands/dispatcher.js';
import { CommandLoader } from './commands/loader.js';
import { openDatabase } from './db/index.js';

console.log('GG Bot starting...');

const db = openDatabase();
const playerRepo = new PlayerRepository(db);

const registry = new CommandRegistry();
const rpgService = new RpgService(playerRepo);
const dispatcher = new CommandDispatcher(registry, rpgService);
const loader = new CommandLoader(registry);

try {
  await loader.start();
} catch (error) {
  console.error('[commands] initial load failed:', error);
}

const identityService = new IdentityService();

rpgService.setNameResolver((userId) => {
  const identity = identityService.getById(userId);
  return identity?.username ?? null;
});

try {
  await connectWhatsApp({ identityService, dispatcher });
} catch (error) {
  console.error('Failed to start GG Bot:', error);
  process.exitCode = 1;
}
