const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BOX_TITLE = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃   🔓 DISEQUIPAGGIA   ┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
];
function renderFailure(result) {
    switch (result.error) {
        case 'unknown_item':
            return [
                ...BOX_TITLE,
                '',
                '❌ Questo oggetto non esiste.',
                '',
                '💡 Controlla il /negozio e riprova!',
                '',
                SIGNATURE,
            ].join('\n');
        case 'not_equippable':
            return [
                ...BOX_TITLE,
                '',
                `${result.item.emoji} ${result.item.name} non occupa uno slot di equipaggiamento.`,
                '',
                SIGNATURE,
            ].join('\n');
        case 'not_equipped':
            return [
                ...BOX_TITLE,
                '',
                `${result.item.emoji} Non hai ${result.item.name} equipaggiata.`,
                '',
                '🎒 Consulta il tuo /equipaggiamento.',
                '',
                SIGNATURE,
            ].join('\n');
    }
}
export default {
    name: 'disequipaggia',
    category: 'rpg',
    emoji: '🔓',
    description: 'Rimuovi un oggetto equipaggiato',
    execute: async ({ args, identity, rpg, reply }) => {
        const itemId = args[0];
        if (!itemId) {
            await reply([
                ...BOX_TITLE,
                '',
                '🔓 Usa:',
                '',
                '/disequipaggia <oggetto>',
                '',
                '💡 Consulta il tuo /equipaggiamento.',
                '',
                SIGNATURE,
            ].join('\n'));
            return;
        }
        const result = rpg.unequipItem(identity.userId, itemId);
        if (!result.ok) {
            await reply(renderFailure(result));
            return;
        }
        await reply([
            ...BOX_TITLE,
            '',
            '✅ Rimosso dall\'equipaggiamento:',
            `   ${result.item.emoji} ${result.item.name}`,
            '',
            '🎒 L\'oggetto resta nel tuo inventario.',
            '',
            SIGNATURE,
        ].join('\n'));
    },
};
