import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSectionList, toFancyFont } from '../lib/commands/menu-text.js';

const rowsOf = (names) => names.map((name) => ({ rowId: `/${name}` }));

describe('Decorative menu font', () => {
    it('uses mathematical bold for the letters', () => {
        assert.equal(toFancyFont('sorta'), '𝐬𝐨𝐫𝐭𝐚');
        assert.equal(toFancyFont('RPG'), '𝐑𝐏𝐆');
    });

    it('transforms the digits too', () => {
        assert.equal(toFancyFont('v10'), '𝐯𝟏𝟎');
    });

    it('leaves the slash and the other symbols alone, so the prefix stays readable', () => {
        assert.equal(toFancyFont('/esci-chat'), '/𝐞𝐬𝐜𝐢-𝐜𝐡𝐚𝐭');
    });

    it('keeps emoji and accents out of the mapping', () => {
        assert.equal(toFancyFont('città 🎮'), '𝐜𝐢𝐭𝐭à 🎮');
    });
});

describe('Section text list', () => {
    it('spends one line on the header and one on the footer', () => {
        const text = renderSectionList({ emoji: '🎮', label: 'RPG', rows: rowsOf(['ruba', 'uso']), footer: 'Usa /menu' });
        const lines = text.split('\n');
        assert.equal(lines[0], `┃ 🎮 𝐌𝐄𝐍𝐔 𝐑𝐏𝐆 ${toFancyFont('2 comandi disponibili')}`);
        assert.equal(lines[1], `┃ ${'⮕'} ${toFancyFont('/ruba')}`);
        assert.equal(lines[2], `┃ ${'⮕'} ${toFancyFont('/uso')}`);
        assert.equal(lines[3], '┃ 💡 Usa /menu');
        assert.equal(lines.length, 4, 'header, two rows and the footer, nothing else');
    });

    it('bullets every command with the slash prefix', () => {
        const text = renderSectionList({
            emoji: '🎮',
            label: 'RPG',
            rows: rowsOf(['acquista', 'deposita']),
        });
        assert.ok(text.includes('┃ ⮕ /𝐚𝐜𝐪𝐮𝐢𝐬𝐭𝐚'), text);
        assert.ok(text.includes('┃ ⮕ /𝐝𝐞𝐩𝐨𝐬𝐢𝐭𝐚'), text);
    });

    it('keeps the footer hint outside the decorative font so it stays typable', () => {
        const text = renderSectionList({ emoji: '🎮', label: 'RPG', rows: rowsOf(['ruba']), footer: 'Usa /menu' });
        assert.ok(text.includes('┃ 💡 Usa /menu'), text);
    });

    it('omits the footer line when there is no footer', () => {
        const text = renderSectionList({ emoji: '🎮', label: 'RPG', rows: rowsOf(['ruba']) });
        assert.ok(!text.includes('💡'), text);
    });

    it('stays inside the caption limit WhatsApp accepts', () => {
        const names = Array.from({ length: 60 }, (_, index) => `comando_very_lungo_numero_${index}`);
        const text = renderSectionList({ emoji: '🎮', label: 'RPG', rows: rowsOf(names), footer: 'Usa /menu' });
        assert.ok(text.length <= 1000, `caption too long: ${text.length}`);
        assert.ok(text.includes(`…${toFancyFont('e altri')} `), 'the hidden commands must be announced');
        assert.ok(text.includes('/𝐜𝐨𝐦𝐚𝐧𝐝𝐨_𝐯𝐞𝐫𝐲_𝐥𝐮𝐧𝐠𝐨_𝐧𝐮𝐦𝐞𝐫𝐨_𝟎'));
    });
});
