import { randomInt } from 'node:crypto';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const JOKES = [
    'Perché i programmatori preferiscono il buio? Perché la luce attira i bug.',
    'Cosa dice un byte timido quando incontra un altro byte? «Scusa, mi sono appena... bit.»',
    'Perché il libro di matematica era triste? Perché aveva troppi problemi.',
    'Come si chiama un pesce senza occhi? Pesce.',
    'Perché lo spaventapasseri ha vinto un premio? Perché era eccezionale nel suo campo.',
    'Perché il computer ha preso freddo? Perché aveva le finestre aperte.',
    'Un mattone dice a un altro: «Ci vediamo al muro.»',
    'Perché l\'orologio è andato dal medico? Perché perdeva sempre un secondo.',
    'Cosa fa una nuvola quando ha sonno? Fa un pisolino... e poi piove.',
    'Perché la scopa è andata dal dottore? Perché si sentiva un po\' giù.',
    'Qual è il colmo per un elettricista? Non sapere dove attaccarsi.',
    'Perché il gatto ha portato un libro in biblioteca? Perché cercava una storia... a lieto miao.',
];

export default {
    name: 'barzelletta',
    category: 'fun',
    emoji: '😂',
    description: 'Racconta una barzelletta a caso',
    execute: async ({ reply }) => {
        const joke = JOKES[randomInt(JOKES.length)];
        await reply(['😂 *BARZELLETTA*', '', joke, '', SIGNATURE].join('\n'));
    },
};
