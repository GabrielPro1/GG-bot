import 'dotenv/config';
import { connectWhatsApp } from './whatsapp/connection.js';
import { SessionManager } from './whatsapp/session-manager.js';
import { registerMessageLogger } from './events/messages.js';
import { startTelegramBot } from './telegram/bot.js';
import { IdentityService } from './services/identity/identity.service.js';
import { RpgService } from './services/rpg/rpg.service.js';
import { PlayerRepository } from './services/rpg/player.repository.js';
import { CommandRegistry } from './commands/registry.js';
import { COMMAND_ALIASES } from './commands/aliases.js';
import { CommandDispatcher } from './commands/dispatcher.js';
import { CommandLoader } from './commands/loader.js';
import { loadOwnerServiceFromEnv } from './config/owners.js';
import { openDatabase } from './db/index.js';
import { AiRepository } from './services/ai/ai.repository.js';
import { AIService } from './services/ai/ai.service.js';
import { createGeminiProviderFromEnv } from './services/ai/gemini.provider.js';

console.log('GG Bot starting...');

const db = openDatabase();
const playerRepo = new PlayerRepository(db);

const registry = new CommandRegistry(COMMAND_ALIASES);
const rpgService = new RpgService(playerRepo);
const ownerService = loadOwnerServiceFromEnv();
const aiService = new AIService(
  new AiRepository(db),
  createGeminiProviderFromEnv(),
);
const dispatcher = new CommandDispatcher(registry, rpgService, ownerService, aiService);
const loader = new CommandLoader(registry);

try {
  await loader.start();
} catch (error) {
  console.error('[commands] initial load failed:', error);
}

const identityService = new IdentityService({}, db);

rpgService.setNameResolver((userId) => {
  const identity = identityService.getById(userId);
  return identity?.username ?? null;
});

const sessionManager = new SessionManager({
  onSocketCreated: (sock) => {
    registerMessageLogger(sock, identityService, dispatcher, aiService);
  },
});

try {
  await sessionManager.restoreSessions();
} catch (error) {
  console.error('[sessions] restore failed at boot:', error);
}

try {
  void startTelegramBot(sessionManager).catch((error) => {
    console.error('[telegram] failed to start Telegram bot:', error);
  });
} catch (error) {
  console.error('Failed to start Telegram bot:', error);
}

try {
  await connectWhatsApp({ identityService, dispatcher, ai: aiService });
} catch (error) {
  console.error('Failed to start GG Bot:', error);
  process.exitCode = 1;
}
