import { randomInt } from 'node:crypto';

const MAX_QUESTION_LENGTH = 160;
const ANSWERS = [
    'Sì, senza dubbio.',
    'È certo.',
    'Direi di sì.',
    'Puoi contarci.',
    'Molto probabilmente.',
    'Le prospettive sono buone.',
    'Sì, ma con calma.',
    'Chiedi più tardi.',
    'Non posso dirlo ora.',
    'Meglio non contarci.',
    'Direi di no.',
    'Le mie fonti dicono di no.',
    'Molto improbabile.',
    'Senza dubbio no.',
    'Il destino è ancora indeciso.',
];

function normalizeQuestion(args) {
    const question = args.join(' ').replace(/\s+/g, ' ').trim();
    return question.length > MAX_QUESTION_LENGTH
        ? `${question.slice(0, MAX_QUESTION_LENGTH - 1)}…`
        : question;
}

export default {
    name: '8ball',
    category: 'fun',
    emoji: '🎱',
    description: 'Fai una domanda alla sfera di cristallo',
    execute: async ({ args, reply }) => {
        const question = normalizeQuestion(args);
        if (question.length === 0) {
            await reply([
                '🎱 *SFERA DI CRISTALLO*',
                '',
                'Fai una domanda insieme al comando.',
                'Esempio: /8ball Sono destinato alla gloria?',
            ].join('\n'));
            return;
        }
        const answer = ANSWERS[randomInt(ANSWERS.length)];
        await reply([
            '🎱 *SFERA DI CRISTALLO*',
            '',
            `❓ ${question}`,
            '',
            `💬 ${answer}`,
        ].join('\n'));
    },
};
