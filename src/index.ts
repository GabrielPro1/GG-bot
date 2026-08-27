import 'dotenv/config';
import { connectWhatsApp } from './whatsapp/connection.js';
import { SessionManager } from './whatsapp/session-manager.js';
import { registerMessageLogger } from './events/messages.js';
import { startTelegramBot } from './telegram/bot.js';
import { IdentityService } from './services/identity/identity.service.js';
import { RpgService } from './services/rpg/rpg.service.js';
import { PlayerRepository } from './services/rpg/player.repository.js';
import { CommandRegistry } from './commands/registry.js';
import { CommandDispatcher } from './commands/dispatcher.js';
import { CommandLoader } from './commands/loader.js';
import { loadOwnerServiceFromEnv } from './config/owners.js';
import { openDatabase } from './db/index.js';
import { startHttpServer } from './http/server.js';

console.log('GG Bot starting...');

const db = openDatabase();
const playerRepo = new PlayerRepository(db);

const registry = new CommandRegistry();
const rpgService = new RpgService(playerRepo);
const ownerService = loadOwnerServiceFromEnv();
const dispatcher = new CommandDispatcher(registry, rpgService, ownerService);
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
    registerMessageLogger(sock, identityService, dispatcher);
  },
});

try {
  await sessionManager.restoreSessions();
} catch (error) {
  console.error('[sessions] restore failed at boot:', error);
}

const http = await startHttpServer();
console.log(
  `[http] health server listening on 0.0.0.0:${(http.server.address() as { port?: number })?.port ?? '?'}`,
);

let telegramBot: Awaited<ReturnType<typeof startTelegramBot>> | null = null;
try {
  void startTelegramBot(sessionManager)
    .then((bot) => {
      telegramBot = bot;
    })
    .catch((error) => {
      console.error('[telegram] failed to start Telegram bot:', error);
    });
} catch (error) {
  console.error('Failed to start Telegram bot:', error);
}

try {
  await connectWhatsApp({ identityService, dispatcher });
} catch (error) {
  console.error('Failed to start GG Bot:', error);
  process.exitCode = 1;
}

function shutdown(signal: string): void {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  void (async () => {
    try {
      telegramBot?.stop();
    } catch (error) {
      console.error('[shutdown] failed to stop Telegram bot:', error);
    }
    try {
      await sessionManager.shutdown();
    } catch (error) {
      console.error('[shutdown] failed to close sessions:', error);
    }
    try {
      await http.close();
    } catch (error) {
      console.error('[shutdown] failed to close HTTP server:', error);
    }
    try {
      db.close();
    } catch {
      /* DB already closed */
    }
    process.exit(0);
  })();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
