import { describeSectionCount } from './menu-sections.js';

// Mathematical Bold, the font the menu lists use: U+1D41A+ for the small
// letters (𝐚-𝐳), U+1D400+ for the capitals (𝐀-𝐙), U+1D7CE+ for the digits.
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
// WhatsApp rejects a caption past roughly 1024 characters, and the list shares
// one message with the header image, so the tail of a long list gets cut.
const MAX_CAPTION_LENGTH = 1000;

/** Rewrites a plain string in the decorative font, leaving anything else alone. */
export function toFancyFont(value) {
    return [...String(value)].map((char) => FANCY_CHARS.get(char) ?? char).join('');
}

/**
 * Renders a section as a plain text list, so opening a category gives the user
 * something to read instead of a second prompt to tap.
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
