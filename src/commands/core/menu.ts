import type { Command, ListRow, ListSection } from '../types.js';

const CATEGORY_ORDER: readonly string[] = ['core', 'rpg', 'fun', 'group', 'owner'];
const CATEGORY_EMOJI: Record<string, string> = {
  core: '⚙️',
  rpg: '🎮',
  fun: '😂',
  group: '🛡️',
  owner: '👑',
};
const UNKNOWN_CATEGORY_EMOJI = '📂';
const OTHER_CATEGORY_KEY = 'other';
const MENU_COMMAND_NAME = 'menu';
const COMING_SOON = 'Prossimamente...';

export default {
  name: 'menu',
  category: 'core',
  emoji: '📖',
  description: 'Mostra il menu di GG Bot',
  execute: async ({ registry, sendList }) => {
    const visibleCommands = registry
      .getAll()
      .filter((command) => !command.hidden && command.name.toLowerCase() !== MENU_COMMAND_NAME);

    const grouped = new Map<string, Command[]>();
    for (const command of visibleCommands) {
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

    const placeholderKeys = CATEGORY_ORDER.filter((key) => !grouped.has(key));

    const sections: ListSection[] = [];

    for (const key of orderedKeys) {
      const emoji = CATEGORY_EMOJI[key] ?? UNKNOWN_CATEGORY_EMOJI;
      const label = key === OTHER_CATEGORY_KEY ? 'ALTRO' : key.toUpperCase();
      const commands = (grouped.get(key) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      const rows: ListRow[] = commands.map((cmd) => ({
        title: `${cmd.emoji ?? '🔹'} /${cmd.name}`,
        rowId: `/${cmd.name}`,
        description: cmd.description,
      }));

      sections.push({ title: `${emoji} ${label}`, rows });
    }

    for (const key of placeholderKeys) {
      const emoji = CATEGORY_EMOJI[key] ?? UNKNOWN_CATEGORY_EMOJI;
      const label = key.toUpperCase();
      sections.push({
        title: `${emoji} ${label}`,
        rows: [{ title: COMING_SOON, rowId: '/menu', description: 'Nessun comando disponibile' }],
      });
    }

    await sendList({
      text: 'Seleziona una categoria per vedere i comandi disponibili.',
      title: '✨ GG BOT — COMMAND CENTER ✨',
      footer: 'Usa /menu per aggiornare',
      buttonText: '📋 Apri Menu',
      sections,
    });
  },
} satisfies Command;
