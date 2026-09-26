import { resolveTargetUser } from '../../lib/target.js';
const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const USAGE = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃      ⚔️ DUELLO PvP      ┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '⚠️ Devi indicare un avversario:',
    '',
    '⚔️ Usa:',
    '',
    '/combatti <utente>',
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
function renderError(title, message) {
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        `┃   ${title}   ┃`,
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        message,
        '',
        SIGNATURE,
    ].join('\n');
}
const FAILURE_RENDERERS = {
    invalid_target: () => renderError('❓ ERRORE', 'Non riesco a identificare questo giocatore.'),
    attacker_not_found: () => renderError('👤 NESSUN PROFILO', [
        '❌ Devi prima creare il tuo profilo con:',
        '',
        '/profilo',
    ].join('\n')),
    target_not_found: () => renderError('❓ SCONOSCIUTO', '❌ Questo giocatore non ha ancora un profilo RPG.'),
    self_target: () => renderError('😅 ATTENTO', '😅 Non puoi combattere contro te stesso!'),
    cooldown: (result) => renderError('⏳ ASPETTA', [
        '⏳ Sei ancora in cooldown!',
        '',
        '⚔️ Potrai combattere di nuovo tra:',
        formatCooldown(result.remainingMs ?? 0),
    ].join('\n')),
    insufficient_energy: (result) => renderError('😴 TROPPO STANCO', [
        '❌ Non hai abbastanza energia!',
        '',
        `❤️ Energia richiesta: 20`,
        `⚡ Energia disponibile: ${result.energy ?? 0}`,
        '',
        '💡 Recupera energia oppure usa una 🧪 pozione.',
    ].join('\n')),
};
function renderCombatOutcome(result, attackerDisplay, defenderDisplay) {
    const outcomeTitle = result.outcome === 'win' ? '🏆 VITTORIA!' : result.outcome === 'loss' ? '💀 SCONFITTA' : '🤝 PAREGGIO!';
    const winnerDisplay = result.outcome === 'loss' ? defenderDisplay : attackerDisplay;
    const loserDisplay = result.outcome === 'loss' ? attackerDisplay : defenderDisplay;
    const participants = result.outcome === 'draw'
        ? [`👤 ${attackerDisplay}`, `👤 ${defenderDisplay}`]
        : [`👤 Vincitore: ${winnerDisplay}`, `💀 Sconfitto: ${loserDisplay}`];
    const criticalNote = result.attackerCritical || result.defenderCritical
        ? ['💥 Colpo critico!', '']
        : [];
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃      ⚔️ DUELLO PvP      ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        outcomeTitle,
        '',
        ...participants,
        '',
        '⚔️ Danno:',
        `   ${stripMentionPrefix(attackerDisplay)}: ${result.attackerDamage}`,
        `   ${stripMentionPrefix(defenderDisplay)}: ${result.defenderDamage}`,
        '',
        ...criticalNote,
        '🎁 Ricompense',
        `   ⭐ +${result.xp} XP`,
        `   🪙 +${result.coins} monete`,
        '',
        `❤️ Energia rimasta: ${result.energy}/${result.maxEnergy}`,
        '',
        `⏳ Prossimo combattimento tra: ${formatCooldown(result.cooldownUntil - Date.now())}`,
        '',
        SIGNATURE,
    ].join('\n');
}
function stripMentionPrefix(display) {
    return display.startsWith('@') ? display.slice(1) : display;
}
export default {
    name: 'combatti',
    category: 'rpg',
    emoji: '⚔️',
    description: 'Sfida un altro giocatore',
    execute: async ({ identity, rpg, mentions, quoted, reply }) => {
        const target = resolveTargetUser(mentions, quoted);
        if (!target) {
            await reply(USAGE);
            return;
        }
        if (!target.identity) {
            await reply(renderError('❓ NON TROVATO', '❌ Non riesco a identificare questo giocatore.'));
            return;
        }
        const attackerIdentity = identity;
        const defenderIdentity = target.identity;
        if (defenderIdentity.userId === attackerIdentity.userId) {
            await reply(renderError('😅 ATTENTO', '😅 Non puoi combattere contro te stesso!'));
            return;
        }
        const result = rpg.startCombat(attackerIdentity.userId, defenderIdentity.userId);
        if (!result.ok) {
            await reply(FAILURE_RENDERERS[result.reason](result));
            return;
        }
        const attackerDisplay = `@${attackerIdentity.username ?? 'sfidante'}`;
        const defenderDisplay = `@${defenderIdentity.username ?? defenderIdentity.lid ?? defenderIdentity.pn ?? 'giocatore misterioso'}`;
        await reply(renderCombatOutcome(result, attackerDisplay, defenderDisplay));
    },
};
