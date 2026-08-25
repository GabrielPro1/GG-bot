import type { WaUserIdentity } from '../services/identity/types.js';
import type { RpgServiceView } from '../services/rpg/types.js';

export interface CommandContext {
  args: readonly string[];
  identity: WaUserIdentity;
  reply: (text: string) => Promise<void>;
  registry: CommandRegistryView;
  rpg: RpgServiceView;
  mentions: readonly MentionedUser[];
}

export interface Command {
  name: string;
  aliases?: readonly string[];
  category?: string;
  emoji?: string;
  description?: string;
  hidden?: boolean;
  execute: (context: CommandContext) => void | Promise<void>;
}

export interface CommandRegistryView {
  getAll(): readonly Command[];
}

export interface MentionedUser {
  readonly jid: string;
  readonly identity: WaUserIdentity | null;
}
