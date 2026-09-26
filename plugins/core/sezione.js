import { buildMenuSections, describeSectionCount } from '../../lib/commands/menu-sections.js';
const USAGE_HINT = 'Usa /menu per scegliere una categoria.';

/**
 * Shows the commands of a single category. Reached from the top level menu,
 * where every row points at `/sezione <category>`.
 */
export default {
    name: 'sezione',
    category: 'core',
    hidden: true,
    aliases: ['sez'],
    description: 'Mostra i comandi di una categoria',
    execute: async ({ registry, args, sendList, reply }) => {
        const key = (args[0] ?? '').trim().toLowerCase();
        if (key.length === 0) {
            await reply(`📂 Indica una categoria. ${USAGE_HINT}`);
            return;
        }
        const section = buildMenuSections(registry).find((entry) => entry.key === key);
        if (!section) {
            await reply(`📂 Categoria «${key}» sconosciuta. ${USAGE_HINT}`);
            return;
        }
        if (section.rows.length === 0) {
            await reply(`${section.title}\nNessun comando disponibile. ${USAGE_HINT}`);
            return;
        }
        await sendList({
            text: [section.title, describeSectionCount(section.rows.length)].join('\n'),
            title: section.title,
            footer: 'Usa /menu per tornare indietro',
            buttonText: '📋 Scegli Comando',
            imageKey: section.key,
            rows: section.rows,
        });
    },
};
