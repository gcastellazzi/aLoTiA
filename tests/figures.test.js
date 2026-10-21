import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { figureFont, setFigureFont } from '../docs/app/js/render/fonts.js';

const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
const exportCode = app.slice(app.indexOf('function snapshotFigures(all)'), app.indexOf('async function saveSnapshots(all)'));

function harness(fail = false) {
  const axes = Array.from({ length: 4 }, () => ({
    canvas: {}, ctx: {}, syncSize() {}, width: 800, height: 500, dpr: 1,
    view: { xmin: -2, xmax: 2, ymin: -1, ymax: 1 }, margin: [52, 26, 18, 40],
    title: 'original', xlabel: 'x', ylabel: 'y', fit() {},
  }));
  const originals = axes.map(ax => ({ ...ax }));
  const modes = [];
  const context = {
    mainAx: axes[0], forceAx: axes[1], solidAx: axes[2], plotAx: axes[3],
    exportSide: null, sideView: () => 'radius', fitForceView() {},
    state: { solidFit: 'cached', plotFitKey: 'cached', solidBounds: {}, showSolidAxes: false },
    ui: { showScale: { checked: false }, plotStatus: { textContent: 'original' } },
    document: { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:image/png;base64,test' }) },
    draw() {
      if (!context.exportSide) return;
      modes.push(context.exportSide);
      assert.equal(context.ui.showScale.checked, true);
      for (const ax of axes) assert.notEqual(ax.canvas, originals[axes.indexOf(ax)].canvas);
      context.state.plotFitKey = 'changed';
      context.ui.plotStatus.textContent = 'changed';
      if (fail) throw new Error('Cannot export image');
    },
  };
  vm.createContext(context);
  vm.runInContext(exportCode, context);
  return { axes, originals, modes, context };
}

for (const fail of [false, true]) test(`snapshot restores canvases, views and options after ${fail ? 'failure' : 'success'}`, () => {
  const { axes, originals, modes, context } = harness(fail);
  if (fail) assert.throws(() => context.snapshotFigures(true), /Cannot export/);
  else {
    const files = context.snapshotFigures(true);
    assert.equal(files.length, 4);
    assert.deepEqual(modes, ['radius', 'force', 'solid', 'heyman']);
  }
  axes.forEach((ax, i) => {
    assert.equal(ax.canvas, originals[i].canvas);
    assert.equal(ax.ctx, originals[i].ctx);
    assert.equal(ax.syncSize, originals[i].syncSize);
    assert.equal(JSON.stringify(ax.view), JSON.stringify(originals[i].view));
  });
  assert.equal(context.exportSide, null);
  assert.equal(context.state.plotFitKey, 'cached');
  assert.equal(context.state.showSolidAxes, false);
  assert.equal(context.ui.showScale.checked, false);
  assert.equal(context.ui.plotStatus.textContent, 'original');
});

test('figure fonts retain weight and scale fractional sizes for the selected family', () => {
  try {
    setFigureFont(150, 'Georgia, serif');
    assert.equal(figureFont('bold 11px Helvetica, Arial, sans-serif'), 'bold 16.5px Georgia, serif');
    setFigureFont(500, 'monospace');
    assert.equal(figureFont('10px Arial'), '18px monospace');
  } finally { setFigureFont(100, 'Helvetica, Arial, sans-serif'); }
});
