import type { Command } from '../types.js';

const CATEGORY_ORDER: readonly string[] = ['core', 'rpg', 'fun', 'group', 'owner'];
const CATEGORY_EMOJI: Record<string, string> = {
  core: '⚙️',
  rpg: '🎮',
  fun: '😂',
  group: '🛡️',
  owner: '👑',
};
const UNKNOWN_CATEGORY_EMOJI = '📂';
const DEFAULT_COMMAND_EMOJI = '🔹';
const OTHER_CATEGORY_KEY = 'other';
const MENU_COMMAND_NAME = 'menu';

const HEADER = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃     ✨  GG BOT  ✨     ┃',
  '┃   ⚡ COMMAND CENTER ⚡   ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
].join('\n');

const TIP_BOX = [
  '╭─────────────────────────────╮',
  '│ 💡 Usa /menu per tenere    │',
  '│     sempre aggiornato il   │',
  '│     tuo menu               │',
  '╰─────────────────────────────╯',
].join('\n');

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

interface Section {
  label: string;
  emoji: string;
  commands: Command[];
}

function buildSections(commands: readonly Command[]): Section[] {
  const grouped = new Map<string, Command[]>();
  for (const command of commands) {
    const key = command.category ?? OTHER_CATEGORY_KEY;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(command);
    } else {
      grouped.set(key, [command]);
    }
  }

  const remainingKeys = [...grouped.keys()]
    .filter((key) => !CATEGORY_ORDER.includes(key))
    .sort((a, b) => a.localeCompare(b));
  const orderedKeys = [
    ...CATEGORY_ORDER.filter((key) => grouped.has(key)),
    ...remainingKeys,
  ];

  return orderedKeys.map((key) => ({
    label: key === OTHER_CATEGORY_KEY ? 'ALTRO' : key.toUpperCase(),
    emoji: CATEGORY_EMOJI[key] ?? UNKNOWN_CATEGORY_EMOJI,
    commands: (grouped.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function renderCommandLine(command: Command): string {
  const emoji = command.emoji ?? DEFAULT_COMMAND_EMOJI;
  const description = command.description ? ` — ${command.description}` : '';
  return `┃ ${emoji} /${command.name}${description}`;
}

function renderSection(section: Section): string {
  return [
    `┏━━ ${section.emoji} ${section.label} ━━━━━━━━━━━━━━━━━━━┓`,
    ...section.commands.map(renderCommandLine),
    '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
  ].join('\n');
}

export default {
  name: 'menu',
  category: 'core',
  emoji: '📖',
  description: 'Mostra il menu di GG Bot',
  execute: async ({ registry, reply }) => {
    const visibleCommands = registry
      .getAll()
      .filter((command) => !command.hidden && command.name.toLowerCase() !== MENU_COMMAND_NAME);

    const parts: string[] = [HEADER];
    for (const section of buildSections(visibleCommands)) {
      parts.push('');
      parts.push(renderSection(section));
    }
    parts.push('');
    parts.push(TIP_BOX);
    parts.push('');
    parts.push(SIGNATURE);

    await reply(parts.join('\n'));
  },
} satisfies Command;
