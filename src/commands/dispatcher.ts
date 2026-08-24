import type { Command, CommandContext } from './types.js';
import type { WaUserIdentity } from '../services/identity/types.js';

const COMMAND_PREFIX = '/';

export interface CommandInvocation {
  identity: WaUserIdentity;
  reply: CommandContext['reply'];
}

export class CommandDispatcher {
  private readonly commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name.toLowerCase(), command);
    for (const alias of command.aliases ?? []) {
      this.commands.set(alias.toLowerCase(), command);
    }
  }

  async handle(text: string, context: CommandInvocation): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed.startsWith(COMMAND_PREFIX)) return false;

    const [rawName, ...args] = trimmed
      .slice(COMMAND_PREFIX.length)
      .split(/\s+/)
      .filter((part) => part.length > 0);
    if (!rawName) return false;

    const command = this.commands.get(rawName.toLowerCase());
    if (!command) return false;

    await command.execute({ args, ...context });
    return true;
  }
}
