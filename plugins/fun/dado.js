import { randomInt } from 'node:crypto';

const DEFAULT_FACES = 6;
const MIN_FACES = 2;
const MAX_FACES = 1000;
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Accetta sia `/dado 20` sia `/dado d20`; null se il valore non è utilizzabile. */
function parseFaces(raw) {
    if (raw === undefined)
        return DEFAULT_FACES;
    const value = raw.toLowerCase().replace(/^d/, '');
    if (!/^\d+$/.test(value))
        return null;
    const faces = Number(value);
    if (!Number.isSafeInteger(faces) || faces < MIN_FACES || faces > MAX_FACES)
        return null;
    return faces;
}

export default {
    name: 'dado',
    category: 'fun',
    emoji: '🎲',
    description: `Lancia un dado da 2 a ${MAX_FACES} facce`,
    execute: async ({ args, reply }) => {
        const faces = parseFaces(args[0]);
        if (faces === null) {
            await reply(`🎲 Numero di facce non valido. Scegli un valore tra ${MIN_FACES} e ${MAX_FACES}.`);
            return;
        }
        const result = randomInt(1, faces + 1);
        const visual = faces === 6 ? `${DIE_FACES[result - 1]} ` : '';
        await reply([`🎲 *DADO A ${faces} FACCE*`, '', `${visual}🎯 Risultato: *${result}*`].join('\n'));
    },
};
