import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_PAGE_OFFSETS, offsetForBook } from '../lib/pdf/book-offsets.js';

test('offsetForBook: normalizza maiuscole/minuscole del nome file', () => {
    assert.equal(offsetForBook({ 'ge-lb.pdf': 2 }, { fileName: 'GE-LB.pdf' }), 2);
    assert.equal(offsetForBook({ 'ge-lb.pdf': 2 }, { fileName: 'ge-lb.pdf' }), 2);
});

test('offsetForBook: libro sconosciuto non ha scostamento', () => {
    assert.equal(offsetForBook({ 'ge-lb.pdf': 2 }, { fileName: 'altro.pdf' }), 0);
});

test('offsetForBook: mappa o libro mancanti non danno scostamento', () => {
    assert.equal(offsetForBook(undefined, { fileName: 'GE-LB.pdf' }), 0);
    assert.equal(offsetForBook({ 'ge-lb.pdf': 2 }, undefined), 0);
    assert.equal(offsetForBook({ 'ge-lb.pdf': 2 }, {}), 0);
});

test('offsetForBook: valori non interi vengono ignorati', () => {
    assert.equal(offsetForBook({ 'a.pdf': '2' }, { fileName: 'a.pdf' }), 0);
    assert.equal(offsetForBook({ 'a.pdf': 1.5 }, { fileName: 'a.pdf' }), 0);
    assert.equal(offsetForBook({ 'a.pdf': null }, { fileName: 'a.pdf' }), 0);
});

test('offsetForBook: la mappa reale assegna +1 a Mathematics-Workbook.pdf', () => {
    assert.equal(offsetForBook(BOOK_PAGE_OFFSETS, { fileName: 'Mathematics-Workbook.pdf' }), 1);
    assert.equal(offsetForBook(BOOK_PAGE_OFFSETS, { fileName: 'mathematics-workbook.pdf' }), 1);
    // Gli altri libri restano senza scostamento.
    assert.equal(offsetForBook(BOOK_PAGE_OFFSETS, { fileName: 'GE-LB.pdf' }), 0);
});
