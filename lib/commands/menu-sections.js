const CATEGORY_ORDER = ['core', 'rpg', 'ai', 'fun', 'group', 'owner'];
const CATEGORY_EMOJI = {
    core: '⚙️',
    rpg: '🎮',
    ai: '🤖',
    fun: '😂',
    group: '🛡️',
    owner: '👑',
};
const UNKNOWN_CATEGORY_EMOJI = '📂';
const OTHER_CATEGORY_KEY = 'other';
const MENU_COMMAND_NAME = 'menu';

/**
 * Groups every visible command by category and returns the sections in
 * display order. Each section carries its own rows, so the top level menu can
 * list the sections and a section view can list that section's commands.
 */
export function buildMenuSections(registry) {
    const visible = registry
        .getAll()
        .filter((command) => !command.hidden && command.name.toLowerCase() !== MENU_COMMAND_NAME);
    const grouped = new Map();
    for (const command of visible) {
        const key = command.category ?? OTHER_CATEGORY_KEY;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(command);
    }
    const remainingKeys = [...grouped.keys()]
        .filter((key) => !CATEGORY_ORDER.includes(key))
        .sort((a, b) => a.localeCompare(b));
    const orderedKeys = [
        ...CATEGORY_ORDER.filter((key) => grouped.has(key)),
        ...remainingKeys,
    ];
    return orderedKeys.map((key) => {
        const commands = grouped.get(key).sort((a, b) => a.name.localeCompare(b.name));
        const emoji = CATEGORY_EMOJI[key] ?? UNKNOWN_CATEGORY_EMOJI;
        const label = key === OTHER_CATEGORY_KEY ? 'ALTRO' : key.toUpperCase();
        return {
            key,
            emoji,
            label,
            title: `${emoji} ${label}`,
            rows: commands.map((command) => ({
                title: `${command.emoji ?? '🔹'} /${command.name}`,
                rowId: `/${command.name}`,
                description: command.description,
            })),
        };
    });
}

/** Human readable summary of how many commands a section holds. */
export function describeSectionCount(count) {
    return `${count} ${count === 1 ? 'comando' : 'comandi'} ${count === 1 ? 'disponibile' : 'disponibili'}`;
}
