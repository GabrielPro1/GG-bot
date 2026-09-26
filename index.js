import 'dotenv/config';
import { connectWhatsApp } from './lib/whatsapp/connection.js';
import { SessionManager } from './lib/whatsapp/session-manager.js';
import { registerMessageLogger } from './handler.js';
import { startTelegramBot } from './lib/telegram/bot.js';
import { IdentityService } from './lib/identity/identity.service.js';
import { RpgService } from './lib/rpg/rpg.service.js';
import { PlayerRepository } from './lib/rpg/player.repository.js';
import { CommandRegistry } from './lib/commands/registry.js';
import { COMMAND_ALIASES } from './lib/commands/aliases.js';
import { CommandDispatcher } from './lib/commands/dispatcher.js';
import { CommandLoader } from './lib/commands/loader.js';
import { loadOwnerServiceFromEnv } from './config.js';
import { openDatabase } from './lib/db/index.js';
import { AiRepository } from './lib/ai/ai.repository.js';
import { AIService } from './lib/ai/ai.service.js';
import { createGeminiProviderFromEnv } from './lib/ai/gemini.provider.js';
console.log('GG Bot starting...');
const db = openDatabase();
const playerRepo = new PlayerRepository(db);
const registry = new CommandRegistry(COMMAND_ALIASES);
const rpgService = new RpgService(playerRepo);
const ownerService = loadOwnerServiceFromEnv();
const aiService = new AIService(new AiRepository(db), createGeminiProviderFromEnv());
const dispatcher = new CommandDispatcher(registry, rpgService, ownerService, aiService);
const loader = new CommandLoader(registry);
try {
    await loader.start();
}
catch (error) {
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
}
catch (error) {
    console.error('[sessions] restore failed at boot:', error);
}
try {
    void startTelegramBot(sessionManager).catch((error) => {
        console.error('[telegram] failed to start Telegram bot:', error);
    });
}
catch (error) {
    console.error('Failed to start Telegram bot:', error);
}
try {
    await connectWhatsApp({ identityService, dispatcher, ai: aiService });
}
catch (error) {
    console.error('Failed to start GG Bot:', error);
    process.exitCode = 1;
}
