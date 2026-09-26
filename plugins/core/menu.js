import { buildMenuSections, describeSectionCount } from '../../lib/commands/menu-sections.js';
export default {
    name: 'menu',
    category: 'core',
    emoji: '📖',
    description: 'Mostra il menu di GG Bot',
    execute: async ({ registry, sendList }) => {
        const sections = buildMenuSections(registry);
        await sendList({
            text: 'Seleziona una categoria per vedere i comandi disponibili.',
            title: '✨ GG BOT — COMMAND CENTER ✨',
            footer: 'Usa /menu per aggiornare',
            buttonText: '📋 Scegli Categoria',
            rows: sections.map((section) => ({
                title: section.title,
                description: describeSectionCount(section.rows.length),
                rowId: `/sezione ${section.key}`,
            })),
        });
    },
};
