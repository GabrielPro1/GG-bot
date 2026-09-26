import { resolveTargetUser } from '../../lib/target.js';
const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const USAGE = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃       🥷 RAPINA       ┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '⚠️ Devi indicare una vittima.',
    '',
    'Uso: /ruba @utente',
    '',
    '💡 Puoi indicare l\'utente:',
    '   • menzionandolo  (vince se presente)',
    '   • rispondendo a un suo messaggio',
    '',
    SIGNATURE,
].join('\n');
function formatCooldown(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    if (totalSeconds < 60)
        return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}
function renderVictimError(title, message) {
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        `┃   ${title}   ┃`,
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        message,
        '',
        SIGNATURE,
    ];
}
function renderRobResult(result, victimDisplay) {
    switch (result.outcome) {
        case 'success':
            return [
                '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                '┃       🥷 RAPINA       ┃',
                '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                '',
                `🎯 Vittima: ${victimDisplay}`,
                '',
                '😈 La rapina è riuscita!',
                '',
                `🪙 Bottino: ${result.loot}`,
                `💰 Il tuo wallet: 🪙 ${result.thiefWalletCoins}`,
                '',
                `⏳ Prossima rapina tra: ${formatCooldown(result.cooldownMs)}`,
                '',
                SIGNATURE,
            ].join('\n');
        case 'jailed':
            return [
                '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                '┃      🚔 ARRESTATO      ┃',
                '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                '',
                `🎯 Vittima: ${victimDisplay}`,
                '',
                '💀 La rapina è fallita!',
                '',
                '👮 Sei stato arrestato.',
                '',
                `⛓️ Prigione: ${formatCooldown(result.prisonMs)}`,
                '',
                '🚫 Non puoi effettuare altre rapine fino alla scarcerazione.',
                '',
                SIGNATURE,
            ].join('\n');
        case 'cooldown':
            return renderVictimError('⏳ ASPETTA', result.jailed
                ? [
                    '⛓️ Sei ancora in prigione!',
                    '',
                    `🚪 Uscirai tra: ${formatCooldown(result.remainingMs)}`,
                ].join('\n')
                : [
                    '😴 Devi aspettare prima di rubare di nuovo.',
                    '',
                    `⏳ Prossima rapina tra: ${formatCooldown(result.remainingMs)}`,
                ].join('\n')).join('\n');
        case 'broke_victim':
            return renderVictimError('🕸️ MANCATO', [
                `🎯 Vittima: ${victimDisplay}`,
                '',
                '💸 Il wallet della vittima è vuoto...',
                'Niente da rubare questa volta!',
            ].join('\n')).join('\n');
        case 'self_target':
            return renderVictimError('😅 ATTENTO', "Non puoi rubare te stesso!").join('\n');
        case 'unknown_victim':
            return renderVictimError('❓ SCONOSCIUTO', [
                'Questa persona non ha ancora un profilo RPG.',
                '',
                "💡 Chiedile di usare /profilo per entrare nel gioco!",
            ].join('\n')).join('\n');
    }
}
export default {
    name: 'ruba',
    category: 'rpg',
    emoji: '🥷',
    description: 'Tenta di rubare monete da un utente menzionato',
    execute: async ({ identity, rpg, mentions, quoted, reply }) => {
        const target = resolveTargetUser(mentions, quoted);
        if (!target) {
            await reply(USAGE);
            return;
        }
        if (!target.identity) {
            await reply(renderVictimError('❓ NON TROVATO', 'Non riesco a identificare l\'utente menzionato.').join('\n'));
            return;
        }
        const thiefIdentity = identity;
        const victimIdentity = target.identity;
        const result = rpg.rob(thiefIdentity.userId, victimIdentity.userId);
        if (result.outcome === 'self_target') {
            await reply(renderVictimError('😅 ATTENTO', 'Non puoi rubare te stesso!').join('\n'));
            return;
        }
        if (result.outcome === 'unknown_victim') {
            await reply(renderVictimError('❓ SCONOSCIUTO', [
                'Questa persona non ha ancora un profilo RPG.',
                '',
                '💡 Chiedile di usare /profilo per entrare nel gioco!',
            ].join('\n')).join('\n'));
            return;
        }
        const victimDisplay = victimIdentity.username ?? victimIdentity.lid ?? victimIdentity.pn ?? 'giocatore misterioso';
        await reply(renderRobResult(result, `@${victimDisplay}`));
    },
};
