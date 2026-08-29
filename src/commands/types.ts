import type { WaUserIdentity } from '../services/identity/types.js';
import type { RpgServiceView } from '../services/rpg/types.js';
import type { AIServiceView } from '../services/ai/types.js';

export interface ListRow {
  readonly title: string;
  readonly rowId: string;
  readonly description?: string;
}

export interface ListSection {
  readonly title: string;
  readonly rows: readonly ListRow[];
}

export interface CommandContext {
  args: readonly string[];
  identity: WaUserIdentity;
  reply: (text: string) => Promise<void>;
  sendList: (options: {
    readonly text: string;
    readonly title: string;
    readonly footer: string;
    readonly buttonText: string;
    readonly sections: readonly ListSection[];
  }) => Promise<void>;
  registry: CommandRegistryView;
  rpg: RpgServiceView;
  ai: AIServiceView;
  mentions: readonly MentionedUser[];
  quoted: MentionedUser | null;
}

export interface Command {
  name: string;
  aliases?: readonly string[];
  category?: string;
  emoji?: string;
  description?: string;
  hidden?: boolean;
  ownerOnly?: boolean;
  execute: (context: CommandContext) => void | Promise<void>;
}

export interface CommandRegistryView {
  getAll(): readonly Command[];
}

export interface MentionedUser {
  readonly jid: string;
  readonly identity: WaUserIdentity | null;
}
