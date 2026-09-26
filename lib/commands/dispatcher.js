import { disabledAiView } from '../ai/ai.service.js';
const COMMAND_PREFIX = '/';
export class CommandDispatcher {
    registry;
    rpg;
    ai;
    ownerService;
    constructor(registry, rpg, ownerService, ai = disabledAiView()) {
        this.registry = registry;
        this.rpg = rpg;
        this.ai = ai;
        this.ownerService = ownerService;
    }
    async handle(text, context) {
        const trimmed = text.trim();
        if (!trimmed.startsWith(COMMAND_PREFIX))
            return false;
        const [rawName, ...args] = trimmed
            .slice(COMMAND_PREFIX.length)
            .split(/\s+/)
            .filter((part) => part.length > 0);
        if (!rawName)
            return false;
        const command = this.registry.get(rawName);
        if (!command)
            return false;
        if (command.ownerOnly && !this.ownerService.isOwner(context.identity)) {
            await context.reply('🔒 Comando riservato agli owner.');
            return true;
        }
        await command.execute({
            args,
            ...context,
            registry: this.registry,
            rpg: this.rpg,
            ai: this.ai,
            mentions: context.mentions ?? [],
            quoted: context.quoted ?? null,
        });
        return true;
    }
}
