/**
 * Tests that the markup and the interface code still agree.
 *
 * WHY THIS EXISTS, AND WHAT IT COST TO LEARN. There is no build step here, on
 * purpose: `app.js` reaches for elements by id and hangs listeners on them, and
 * nothing checks that the two files describe the same page. Two failures follow
 * from that, and both are silent.
 *
 * The first is a handle for an element that is not there: `el('x')` returns
 * null, and the first line that touches it throws while the module is still
 * loading, so the WHOLE application is dead -- not the feature, the
 * application.
 *
 * The second is worse because it is quiet. A tab that no longer has a click
 * listener simply does nothing. Nothing throws, nothing is logged, the page
 * looks right, and the button is dead. That is exactly what happened when the
 * thrust-network work was lifted back out of this repository: the cut took the
 * listeners for Blocks, Heyman, t/ri, Notes and Log with it, because they sat
 * on the far side of the anchor it cut to. Four working panels became
 * unreachable and every existing test still passed.
 *
 * These are static checks -- they read the two files as text rather than
 * running them -- which is what lets them live in a suite with no browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');

/** Every id the markup defines. */
const idsInMarkup = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

/** Every id the interface asks for by hand. */
const idsWanted = [...app.matchAll(/\bel\('([^']+)'\)/g)].map((m) => m[1]);

test('every element the interface reaches for exists in the markup', () => {
  // `el(id)` is `getElementById`, so a name that is not there is null, and the
  // first property read on it throws before the page has finished loading.
  const missing = [...new Set(idsWanted)].filter((id) => !idsInMarkup.has(id));
  assert.deepEqual(missing, [],
    `app.js asks for ${missing.join(', ')}, which the markup does not define`);
});

test('every tab does something when it is clicked', () => {
  // THE ONE THAT WAS LEARNED THE HARD WAY. A tab with no listener is a button
  // that looks right and does nothing, and no other test in this suite would
  // notice: nothing throws and nothing is drawn wrong, because nothing happens
  // at all.
  const tabs = [...html.matchAll(/<button[^>]*\bclass="tab[^"]*"[^>]*>/g)]
    .map((m) => (m[0].match(/\bid="([^"]+)"/) ?? [])[1])
    .filter(Boolean);
  assert.ok(tabs.length >= 8, `only ${tabs.length} tabs found; the markup changed shape`);

  const dead = tabs.filter((id) => {
    const wired = new RegExp(`ui\\.${id}\\.addEventListener\\(\\s*'click'`);
    return !wired.test(app);
  });
  assert.deepEqual(dead, [], `these tabs have no click listener: ${dead.join(', ')}`);
});

test('the block-generation tools are reached by one delegated listener', () => {
  // These are not wired one by one: they carry `data-method` and share a
  // listener. The test is that the two halves still use the same hook.
  const methods = [...html.matchAll(/data-method="([^"]+)"/g)].map((m) => m[1]);
  const panes = [...html.matchAll(/data-method-pane="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(methods.length >= 5, 'the block-generation strip lost a tool');
  assert.deepEqual([...methods].sort(), [...panes].sort(),
    'a tool has no pane, or a pane has no tool');
  assert.ok(app.includes(".querySelectorAll('.methodtabs button')"),
    'nothing listens to the block-generation strip');
});

test('every pane a tab switches to exists', () => {
  for (const id of ['paneGeom', 'paneLot', 'paneMech']) {
    assert.ok(idsInMarkup.has(id), `${id} is missing from the markup`);
  }
  // The side views: each is either a canvas or a pane, and `showSide` hides
  // every one of them but the chosen one.
  for (const id of ['force', 'solid', 'plot', 'notesPane', 'logPane', 'blockTablePane']) {
    assert.ok(idsInMarkup.has(id), `${id} is missing from the markup`);
    assert.ok(app.includes(`'${id}'`) || app.includes(id),
      `${id} is in the markup but nothing shows or hides it`);
  }
});

test('nothing in the markup is left with no code behind it', () => {
  // The reverse direction: an input or a button in the panel that nothing
  // reads is either dead weight or a feature that was half-removed.
  const controls = [...html.matchAll(
    /<(?:button|input|select|textarea)[^>]*\bid="([^"]+)"[^>]*>/g,
  )].map((m) => m[1]);
  const orphans = controls.filter((id) => !app.includes(`'${id}'`));
  assert.deepEqual(orphans, [],
    `nothing in app.js mentions ${orphans.join(', ')}`);
});
