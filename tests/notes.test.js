/**
 * Tests for the little markup the project notes are written in.
 *
 * TWO THINGS ARE BEING PINNED. The first is that the markers mean what the
 * buttons say they mean, and that pressing a button twice takes the marker off
 * again -- a button that only ever adds fills the text with markers nobody
 * asked for.
 *
 * The second matters more. The notes arrive inside a session file, which is
 * something one student hands another, and the application renders them. So the
 * question is not whether the parser is tidy but whether anything in a note can
 * become MARKUP or an ACTION. It cannot, by construction: this module returns a
 * description and never a string of HTML, and the one attribute ever written
 * from a note -- a link's address -- is checked here against a list of three
 * schemes. The tests below are the ones that would fail if that stopped being
 * true.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNotes, safeHref, toggleWrap, setBlockStyle, insertLink,
} from '../docs/app/js/core/notes.js';

const flat = (text) => parseNotes(text)[0].spans;

// ------------------------------------------------------------------ blocks --

test('a line says which kind of block it is', () => {
  assert.equal(parseNotes('# Poleni')[0].kind, 'title');
  assert.equal(parseNotes('## The dome')[0].kind, 'heading');
  assert.equal(parseNotes('- one')[0].kind, 'bullet');
  assert.equal(parseNotes('* one')[0].kind, 'bullet');
  assert.equal(parseNotes('just writing')[0].kind, 'body');
  assert.equal(parseNotes('')[0].kind, 'blank');
  assert.equal(parseNotes('   ')[0].kind, 'blank');
});

test('the marker itself is not part of what is written', () => {
  assert.equal(parseNotes('# Poleni')[0].spans[0].text, 'Poleni');
  assert.equal(parseNotes('- one')[0].spans[0].text, 'one');
});

test('a note is as many blocks as it has lines', () => {
  const b = parseNotes('# T\n\nbody\n- a\n- b');
  assert.deepEqual(b.map((x) => x.kind),
    ['title', 'blank', 'body', 'bullet', 'bullet']);
});

// ------------------------------------------------------------------ inline --

test('the three markers carry the three flags', () => {
  assert.equal(flat('**heavy**')[0].bold, true);
  assert.equal(flat('*leaning*')[0].emph, true);
  assert.equal(flat('_under_')[0].underline, true);
});

test('text outside the markers keeps its place, and its order', () => {
  const s = flat('before **middle** after');
  assert.deepEqual(s.map((x) => x.text), ['before ', 'middle', ' after']);
  assert.equal(s[0].bold, undefined);
  assert.equal(s[1].bold, true);
});

test('markers nest', () => {
  const s = flat('**_both_**');
  assert.equal(s.length, 1);
  assert.equal(s[0].bold, true);
  assert.equal(s[0].underline, true);
});

test('a lone marker is just a character', () => {
  assert.deepEqual(flat('2 * 3 = 6').map((x) => x.text), ['2 * 3 = 6']);
  assert.deepEqual(flat('snake_case').map((x) => x.text), ['snake_case']);
});

// ------------------------------------------------------------------- links --

test('a link carries its address, and its text can still be emphasised', () => {
  const s = flat('[**the plate**](https://example.org/p)');
  assert.equal(s[0].href, 'https://example.org/p');
  assert.equal(s[0].bold, true);
  assert.equal(s[0].text, 'the plate');
});

test('only three schemes are followed, and a bare host is helped', () => {
  assert.equal(safeHref('https://example.org'), 'https://example.org');
  assert.equal(safeHref('http://example.org'), 'http://example.org');
  assert.equal(safeHref('mailto:a@b.it'), 'mailto:a@b.it');
  assert.equal(safeHref('www.example.org/x'), 'https://www.example.org/x');
});

test('a scheme that could run something is refused', () => {
  // THE TEST THIS FILE EXISTS FOR. A session file is passed from hand to hand;
  // following a link in one must not be able to run anything.
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.equal(safeHref(bad), null, bad);
  }
  assert.equal(safeHref(''), null);
  assert.equal(safeHref(null), null);
});

test('a refused address is left on the page exactly as it was typed', () => {
  // Not silently dropped: the writer has to be able to see that it did not
  // become a link, and why. What is asserted is the property that matters --
  // no address survives anywhere, and every character the writer typed is
  // still on the page -- rather than how many spans it happens to come out as.
  for (const line of [
    '[click](javascript:alert(1))',
    '[click](data:text/html,<script>alert(1)</script>)',
    'see [here](vbscript:msgbox(1)) for it',
  ]) {
    const s = flat(line);
    assert.ok(s.every((x) => x.href === undefined), line);
    assert.equal(s.map((x) => x.text).join(''), line, line);
  }
});

test('a note that looks like markup is text, and stays text', () => {
  // The parser returns a description; the caller builds elements with
  // textContent. There is no path from here to markup at all -- which this
  // test states by showing that the angle brackets survive as characters.
  const line = '<img src=x onerror="alert(1)"> and <b>bold</b>';
  const s = flat(line);
  assert.equal(s.map((x) => x.text).join(''), line);
  assert.ok(s.every((x) => x.href === undefined));
});

// ----------------------------------------------------------- the buttons --

test('a marker goes on, and pressing again takes it off', () => {
  const on = toggleWrap('one two', 0, 3, '**');
  assert.equal(on.text, '**one** two');
  assert.deepEqual([on.start, on.end], [2, 5]);

  // The selection is now inside the markers: pressing again must undo it.
  const off = toggleWrap(on.text, on.start, on.end, '**');
  assert.equal(off.text, 'one two');
  assert.deepEqual([off.start, off.end], [0, 3]);
});

test('a marker comes off when the selection includes it', () => {
  const off = toggleWrap('**one** two', 0, 7, '**');
  assert.equal(off.text, 'one two');
});

test('with nothing selected the button writes somewhere to type', () => {
  const got = toggleWrap('', 0, 0, '*');
  assert.equal(got.text, '*text*');
  // and leaves the word selected, so typing replaces it
  assert.equal(got.text.slice(got.start, got.end), 'text');
});

test('a block style takes every line the selection touches', () => {
  const got = setBlockStyle('one\ntwo\nthree', 1, 5, '- ');
  assert.equal(got.text, '- one\n- two\nthree');
});

test('a block style replaces the one that was there, rather than stacking', () => {
  assert.equal(setBlockStyle('# one', 0, 0, '## ').text, '## one');
  assert.equal(setBlockStyle('- one', 0, 0, '').text, 'one');
  assert.equal(setBlockStyle('## one', 0, 0, '').text, 'one');
});

test('the link button leaves the cursor in the address', () => {
  const got = insertLink('see the plate', 4, 13);
  assert.equal(got.text, 'see [the plate](https://)');
  assert.equal(got.text.slice(got.start, got.end), 'https://');
});

// ------------------------------------------------------------ round trip --

test('what the buttons write is what the parser reads', () => {
  let t = { text: '', start: 0, end: 0 };
  t = setBlockStyle(t.text, 0, 0, '# ');
  t = { ...t, text: `${t.text}Poleni's plate\n`, start: 16, end: 16 };
  t = toggleWrap(t.text, 16, 16, '**');
  const blocks = parseNotes(t.text);
  assert.equal(blocks[0].kind, 'title');
  assert.equal(blocks[0].spans[0].text, "Poleni's plate");
});
