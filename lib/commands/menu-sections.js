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
 * Raggruppa ogni comando visibile per categoria e ritorna le sezioni in ordine
 * di visualizzazione. Ogni sezione porta le proprie righe, così il menu di
 * primo livello elenca le sezioni e la vista di sezione elenca i comandi di
 * quella sezione.
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

/** Riepilogo leggibile di quanti comandi contiene una sezione. */
export function describeSectionCount(count) {
    return `${count} ${count === 1 ? 'comando' : 'comandi'} ${count === 1 ? 'disponibile' : 'disponibili'}`;
}
