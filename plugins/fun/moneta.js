import { randomInt } from 'node:crypto';

const SIDES = [
    { name: 'Testa', emoji: '🌞' },
    { name: 'Croce', emoji: '🌙' },
];

export default {
    name: 'moneta',
    category: 'fun',
    emoji: '🪙',
    description: 'Lancia una moneta e scegli testa o croce',
    execute: async ({ reply }) => {
        const side = SIDES[randomInt(SIDES.length)];
        await reply(['🪙 *LANCIO DELLA MONETA*', '', `${side.emoji} È uscito: *${side.name}*`].join('\n'));
    },
};
