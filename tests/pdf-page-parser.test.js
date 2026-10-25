import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMandapagArgs, parsePageSpec, countRangePages } from '../lib/pdf/page-parser.js';

test('parsePageSpec: single page', () => {
    assert.deepEqual(parsePageSpec('125'), { start: 125, end: 125 });
});

test('parsePageSpec: trailing punctuation is ignored', () => {
    assert.deepEqual(parsePageSpec('125.'), { start: 125, end: 125 });
});

test('parsePageSpec: range', () => {
    assert.deepEqual(parsePageSpec('125-128'), { start: 125, end: 128 });
});

test('parsePageSpec: single-digit singleton in range form', () => {
    assert.deepEqual(parsePageSpec('5-5'), { start: 5, end: 5 });
});

test('parsePageSpec: inverted range', () => {
    assert.deepEqual(parsePageSpec('10-3'), { error: 'inverted', start: 10, end: 3 });
});

test('parsePageSpec: non page tokens return null', () => {
    assert.equal(parsePageSpec('abc'), null);
    assert.equal(parsePageSpec('12-'), null);
    assert.equal(parsePageSpec('-3'), null);
    assert.equal(parsePageSpec('0'), null);
    assert.equal(parsePageSpec(''), null);
    assert.equal(parsePageSpec(undefined), null);
});

test('parsePageSpec: overflow is rejected', () => {
    assert.equal(parsePageSpec('9999999999999999999999'), null);
    assert.equal(parsePageSpec('1-9999999999999999999999'), null);
});

test('parseMandapagArgs: no args', () => {
    assert.deepEqual(parseMandapagArgs([]), { kind: 'usage' });
});

test('parseMandapagArgs: book without page', () => {
    assert.deepEqual(parseMandapagArgs(['matematica']), { kind: 'missingPage', bookQuery: 'matematica' });
});

test('parseMandapagArgs: book name with spaces, single page', () => {
    assert.deepEqual(parseMandapagArgs(['matematica', 'verde', '125']), {
        kind: 'ok',
        bookQuery: 'matematica verde',
        spec: { start: 125, end: 125 },
    });
});

test('parseMandapagArgs: range', () => {
    assert.deepEqual(parseMandapagArgs(['matematica', '125-128']), {
        kind: 'ok',
        bookQuery: 'matematica',
        spec: { start: 125, end: 128 },
    });
});

test('parseMandapagArgs: page only -> missing book', () => {
    assert.deepEqual(parseMandapagArgs(['125']), { kind: 'missingBook', spec: { start: 125, end: 125 } });
});

test('parseMandapagArgs: inverted range', () => {
    assert.deepEqual(parseMandapagArgs(['matematica', '10-3']), { kind: 'inverted', start: 10, end: 3 });
});

test('parseMandapagArgs: malformed page', () => {
    assert.deepEqual(parseMandapagArgs(['matematica', '12-']), { kind: 'malformed' });
    assert.deepEqual(parseMandapagArgs(['matematica', 'abc']), { kind: 'missingPage', bookQuery: 'matematica abc' });
});

test('parseMandapagArgs: mentions are stripped', () => {
    assert.deepEqual(parseMandapagArgs(['matematica', '@Utente', '125']), {
        kind: 'ok',
        bookQuery: 'matematica',
        spec: { start: 125, end: 125 },
    });
});

test('parseMandapagArgs: book name that ends with a number keeps the page', () => {
    assert.deepEqual(parseMandapagArgs(['libro', '2', '10-12']), {
        kind: 'ok',
        bookQuery: 'libro 2',
        spec: { start: 10, end: 12 },
    });
});

test('countRangePages', () => {
    assert.equal(countRangePages({ start: 125, end: 128 }), 4);
    assert.equal(countRangePages({ start: 5, end: 5 }), 1);
    assert.equal(countRangePages({ error: 'inverted' }), 0);
    assert.equal(countRangePages(null), 0);
});