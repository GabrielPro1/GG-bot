import { randomInt } from 'node:crypto';

const MAX_NAME_LENGTH = 30;
const COMPLIMENTS = [
    'Hai un\'energia che rende migliore ogni conversazione.',
    'Il tuo sorriso vale più di mille emoji.',
    'Sei la persona che tutti vorrebbero avere nella propria squadra.',
    'Hai un modo di parlare che mette subito a proprio agio.',
    'La tua gentilezza è una delle cose più belle che si incontrano qui.',
    'Hai un talento raro: far sentire gli altri importanti.',
    'Con te anche una giornata grigia trova un raggio di sole.',
    'Sei più forte di quanto pensi e più speciale di quanto immagini.',
    'Il mondo sarebbe un posto migliore con più persone come te.',
    'Hai una risata contagiosa che migliora la giornata.',
    'Non hai idea di quanto bene faccia la tua presenza.',
    'Sei un piccolo capolavoro quotidiano.',
];

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

function resolveName(args, mentions) {
    const explicit = cleanName(args.join(' '));
    if (explicit.length > 0)
        return explicit;
    return cleanName(mentions.map(mentionName).find(Boolean));
}

export default {
    name: 'complimento',
    category: 'fun',
    emoji: '💌',
    description: 'Dedica un complimento a qualcuno',
    execute: async ({ args, mentions, reply }) => {
        const name = resolveName(args, mentions ?? []);
        const compliment = COMPLIMENTS[randomInt(COMPLIMENTS.length)];
        const title = name.length > 0 ? `💌 *COMPLIMENTO PER ${name}*` : '💌 *UN COMPLIMENTO PER TE*';
        await reply([title, '', compliment].join('\n'));
    },
};
