const NOT_ACTIVE = '⚠️ Non sei in modalità AI. Usa `/ai crea chat` per attivarla.';
export default {
    name: 'esci',
    category: 'ai',
    emoji: '🚪',
    description: 'Esce dalla modalità AI (mantiene la chat)',
    execute: async ({ ai, identity, reply }) => {
        if (!ai.enabled) {
            await reply('⚠️ Il servizio AI non è configurato.');
            return;
        }
        if (ai.activeChat(identity.userId) === null) {
            await reply(NOT_ACTIVE);
            return;
        }
        ai.deactivate(identity.userId);
        await reply('🤖 Modalità AI disattivata. Sei tornato alla modalità normale.');
    },
};
