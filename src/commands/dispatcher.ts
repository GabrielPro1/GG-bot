import type { WaUserIdentity } from '../services/identity/types.js';
import type { RpgServiceView } from '../services/rpg/types.js';
import type { CommandContext, MentionedUser } from './types.js';
import type { CommandRegistry } from './registry.js';

const COMMAND_PREFIX = '/';

export interface CommandInvocation {
  identity: WaUserIdentity;
  reply: CommandContext['reply'];
  mentions?: readonly MentionedUser[];
}

export class CommandDispatcher {
  private readonly registry: CommandRegistry;
  private readonly rpg: RpgServiceView;

  constructor(registry: CommandRegistry, rpg: RpgServiceView) {
    this.registry = registry;
    this.rpg = rpg;
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

    await command.execute({
      args,
      ...context,
      registry: this.registry,
      rpg: this.rpg,
      mentions: context.mentions ?? [],
    });
    return true;
  }
}
