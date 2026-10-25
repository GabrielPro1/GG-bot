import { describeSectionCount } from './menu-sections.js';

// Bold Matematico, il font usato dalle liste del menu: U+1D41A+ per le lettere
// minuscole (𝐚-𝐳), U+1D400+ per le maiuscole (𝐀-𝐙), U+1D7CE+ per le cifre.
const BOLD_CAPITAL_START = 0x1d400;
const BOLD_SMALL_START = 0x1d41a;
const BOLD_DIGIT_START = 0x1d7ce;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

const FANCY_CHARS = new Map();
for (const [index, letter] of [...LETTERS].entries()) {
    FANCY_CHARS.set(letter, String.fromCodePoint(BOLD_SMALL_START + index));
    FANCY_CHARS.set(letter.toUpperCase(), String.fromCodePoint(BOLD_CAPITAL_START + index));
}
for (const [index, digit] of [...DIGITS].entries()) {
    FANCY_CHARS.set(digit, String.fromCodePoint(BOLD_DIGIT_START + index));
}

const SIDE = '┃';
const BULLET = '⮕';
// WhatsApp rifiuta le didascalie oltre i ~1024 caratteri e la lista condivide
// un solo messaggio con l'immagine di testa, quindi la coda di una lista lunga viene tagliata.
const MAX_CAPTION_LENGTH = 1000;

/** Riscrive una stringa nel font decorativo, lasciando invariato tutto il resto. */
export function toFancyFont(value) {
    return [...String(value)].map((char) => FANCY_CHARS.get(char) ?? char).join('');
}

/**
 * Renderizza una sezione come lista di testo semplice, così aprire una
 * categoria dà all'utente qualcosa da leggere invece di un secondo prompt da
 * toccare.
 */
export function renderSectionList({ emoji, label, rows, footer }) {
    const total = rows.length;
    const head = [
        `${SIDE} ${emoji} ${toFancyFont('MENU')} ${toFancyFont(label)} ${toFancyFont(describeSectionCount(total))}`,
    ];
    const tail = footer ? [`${SIDE} 💡 ${footer}`] : [];
    const render = (lines) => [...head, ...lines, ...tail].join('\n');
    const bullet = (rowId) => `${SIDE} ${BULLET} ${toFancyFont(rowId)}`;

    const full = render(rows.map((row) => bullet(row.rowId)));
    if (full.length <= MAX_CAPTION_LENGTH) {
        return full;
    }
    for (let visible = total - 1; visible >= 1; visible -= 1) {
        const hidden = total - visible;
        const trimmed = render([
            ...rows.slice(0, visible).map((row) => bullet(row.rowId)),
            bullet(`…e altri ${hidden} comandi`),
        ]);
        if (trimmed.length <= MAX_CAPTION_LENGTH) {
            return trimmed;
        }
    }
    return render([bullet(rows[0].rowId)]);
}
