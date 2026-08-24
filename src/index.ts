import { connectWhatsApp } from './whatsapp/connection.js';
import { IdentityService } from './services/identity/identity.service.js';
import { CommandRegistry } from './commands/registry.js';
import { CommandDispatcher } from './commands/dispatcher.js';
import { CommandLoader } from './commands/loader.js';

console.log('GG Bot starting...');

const registry = new CommandRegistry();
const dispatcher = new CommandDispatcher(registry);
const loader = new CommandLoader(registry);

try {
  await loader.start();
} catch (error) {
  console.error('[commands] initial load failed:', error);
}

const identityService = new IdentityService();

try {
  await connectWhatsApp({ identityService, dispatcher });
} catch (error) {
  console.error('Failed to start GG Bot:', error);
  process.exitCode = 1;
}
