import type { WaUserIdentity } from '../services/identity/types.js';

export interface CommandContext {
  args: readonly string[];
  identity: WaUserIdentity;
  reply: (text: string) => Promise<void>;
}

export interface Command {
  name: string;
  aliases?: readonly string[];
  category?: string;
  execute: (context: CommandContext) => void | Promise<void>;
}
