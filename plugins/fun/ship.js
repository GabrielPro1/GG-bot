import { createHash } from 'node:crypto';

const MAX_NAME_LENGTH = 24;
const BAR_BLOCKS = 10;

function cleanName(value) {
    return String(value ?? '')
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME_LENGTH);
}

function mentionName(mention) {
    return mention?.identity?.username
        ?? mention?.identity?.userId
        ?? mention?.jid?.split('@')[0]
        ?? null;
}

/**
 * Accetta due menzioni oppure due nomi nel testo. Nel secondo caso tutto ciò
 * che segue il primo nome viene considerato il secondo nome, così funzionano
 * anche nomi composti come "Mario Rossi".
 */
function resolveNames(args, mentions) {
    const mentioned = (mentions ?? []).map(mentionName).filter(Boolean);
    if (mentioned.length >= 2) {
        return [cleanName(mentioned[0]), cleanName(mentioned[1])];
    }
    if (mentioned.length === 1 && args.length > 0) {
        return [cleanName(mentioned[0]), cleanName(args.join(' '))];
    }
    if (args.length < 2)
        return null;
    return [cleanName(args[0]), cleanName(args.slice(1).join(' '))];
}

/** La percentuale dipende solo dalla coppia di nomi, quindi non cambia a ogni /ship. */
function percentageFor(first, second) {
    const pair = [first.toLowerCase(), second.toLowerCase()].sort().join('|');
    const digest = createHash('sha256').update(pair).digest();
    return digest.readUInt32BE(0) % 101;
}

function renderBar(percentage) {
    const filled = Math.round((percentage / 100) * BAR_BLOCKS);
    return `${'█'.repeat(filled)}${'░'.repeat(BAR_BLOCKS - filled)}`;
}

function moodFor(percentage) {
    if (percentage >= 90)
        return '💍 Anime gemelle!';
    if (percentage >= 75)
        return '💞 Amore quasi perfetto!';
    if (percentage >= 60)
        return '💖 Scintille nell\'aria!';
    if (percentage >= 40)
        return '😊 C\'è una bella intesa.';
    if (percentage >= 20)
        return '🤝 Amicizia con potenziale.';
    return '💔 Per ora non c\'è chimica.';
}

export default {
    name: 'ship',
    category: 'fun',
    emoji: '💘',
    description: 'Calcola la compatibilità tra due persone',
    execute: async ({ args, mentions, reply }) => {
        const names = resolveNames(args, mentions ?? []);
        if (!names || names[0].length === 0 || names[1].length === 0) {
            await reply([
                '💘 *SHIP*',
                '',
                'Scrivi due nomi: /ship Mario Giulia',
                'Oppure menziona due persone.',
            ].join('\n'));
            return;
        }
        const [first, second] = names;
        const percentage = percentageFor(first, second);
        await reply([
            '💘 *SHIP*',
            '',
            `*${first}* ❤️ *${second}*`,
            '',
            `[${renderBar(percentage)}] ${percentage}%`,
            moodFor(percentage),
        ].join('\n'));
    },
};
