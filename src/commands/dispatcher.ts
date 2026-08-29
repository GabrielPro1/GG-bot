import type { WaUserIdentity } from '../services/identity/types.js';
import type { RpgServiceView } from '../services/rpg/types.js';
import type { AIServiceView } from '../services/ai/types.js';
import { disabledAiView } from '../services/ai/ai.service.js';
import type { CommandContext, MentionedUser } from './types.js';
import type { CommandRegistry } from './registry.js';
import type { OwnerService } from '../config/owners.js';

const COMMAND_PREFIX = '/';

export interface CommandInvocation {
  identity: WaUserIdentity;
  reply: CommandContext['reply'];
  sendList: CommandContext['sendList'];
  mentions?: readonly MentionedUser[];
  quoted?: MentionedUser | null;
}

export class CommandDispatcher {
  private readonly registry: CommandRegistry;
  private readonly rpg: RpgServiceView;
  private readonly ai: AIServiceView;
  private readonly ownerService: OwnerService;

  constructor(
    registry: CommandRegistry,
    rpg: RpgServiceView,
    ownerService: OwnerService,
    ai: AIServiceView = disabledAiView(),
  ) {
    this.registry = registry;
    this.rpg = rpg;
    this.ai = ai;
    this.ownerService = ownerService;
  }

  async handle(text: string, context: CommandInvocation): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed.startsWith(COMMAND_PREFIX)) return false;

    const [rawName, ...args] = trimmed
      .slice(COMMAND_PREFIX.length)
      .split(/\s+/)
      .filter((part) => part.length > 0);
    if (!rawName) return false;

    const command = this.registry.get(rawName);
    if (!command) return false;

    if (command.ownerOnly && !this.ownerService.isOwner(context.identity)) {
      await context.reply(
        '🔒 Comando riservato agli owner.',
      );
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
