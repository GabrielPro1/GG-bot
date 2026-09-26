export default {
    name: 'ping',
    category: 'core',
    emoji: '🏓',
    description: 'Controlla se GG Bot è online',
    execute: async ({ reply }) => {
        await reply('pong');
    },
};
