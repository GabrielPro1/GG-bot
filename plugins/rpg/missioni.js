const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
function renderProgressBar(progress, target) {
    const segments = 5;
    const filled = Math.min(segments, Math.floor((progress / target) * segments + 0.0001));
    return `${'▰'.repeat(filled)}${'▱'.repeat(segments - filled)} ${progress}/${target}`;
}
function renderMission(mission) {
    const status = mission.claimed
        ? '🎁 Ricompensa riscattata'
        : mission.ready
            ? '✅ Pronta da riscattare'
            : '🎯 In corso';
    return [
        `${mission.emoji} ${mission.name}`,
        `   ${mission.description}`,
        `   ${renderProgressBar(mission.progress, mission.target)}`,
        `   🪙 +${mission.rewardCoins} · ✨ +${mission.rewardXp} XP`,
        `   ${status}`,
    ];
}
function renderMissionsBox(missions) {
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃    📜 MISSIONI RPG    ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        ...missions.flatMap((mission, index) => index === 0 ? renderMission(mission) : ['', ...renderMission(mission)]),
        '',
        '💡 Usa /missioni riscatta <id>',
        '',
        SIGNATURE,
    ].join('\n');
}
function renderClaimResult(result) {
    if (result.ok) {
        return [
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃     🎉 RISCATTO     ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            '✅ Missione completata!',
            '',
            `🪙 Monete: +${result.rewardCoins}`,
            `✨ Esperienza: +${result.rewardXp} XP`,
            '',
            `👛 Wallet: 🪙 ${result.walletCoins}`,
            '',
            SIGNATURE,
        ].join('\n');
    }
    const messages = {
        unknown_mission: ['❓ SCONOSCIUTA', '❌ Questa missione non esiste.'],
        not_active_today: [
            '📅 NON DISPONIBILE',
            '❌ Questa missione non è attiva oggi.',
            '',
            '📜 Controlla le missioni del giorno con /missioni',
        ],
        incomplete: [
            '⏳ ANCORA IN CORSO',
            '❌ Non hai ancora completato questa missione.',
            '',
            '💡 Continua a giocare e riprova!',
        ],
        already_claimed: [
            '🎁 GIÀ RISCATTATA',
            '❌ Hai già riscattato questa missione oggi.',
            '',
            '⏳ Torna domani per nuove missioni!',
        ],
    };
    const lines = messages[result.reason] ?? ['❓ ERRORE', '❌ Operazione non riuscita.'];
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        `┃   ${lines[0]}   ┃`,
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        ...lines.slice(1),
        '',
        SIGNATURE,
    ].join('\n');
}
export default {
    name: 'missioni',
    category: 'rpg',
    emoji: '📜',
    description: 'Visualizza le missioni giornaliere',
    execute: async ({ args, identity, rpg, reply }) => {
        if (args[0]?.toLowerCase() === 'riscatta') {
            const missionId = args.slice(1).join(' ').trim();
            if (!missionId) {
                await reply([
                    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                    '┃     📜 MISSIONI RPG     ┃',
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                    '',
                    '⚠️ Devi indicare la missione da riscattare.',
                    '',
                    'Uso: /missioni riscatta <id>',
                    '',
                    SIGNATURE,
                ].join('\n'));
                return;
            }
            await reply(renderClaimResult(rpg.claimMission(identity.userId, missionId)));
            return;
        }
        await reply(renderMissionsBox(rpg.getDailyMissions(identity.userId)));
    },
};
