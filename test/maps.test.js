const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'maps.js'), 'utf8');
const floors = vm.runInNewContext(source + '\nFLOORS');

test('povo1-1 center rooms and study areas have aligned corridor gaps', () => {
  const floor = floors.find((entry) => entry.id === 'povo1-1');
  const room = (label) => floor.rooms.find((entry) => entry.label === label);
  const area = (label) => floor.areas.find((entry) => entry.label === label);
  const bottom = (entry) => entry.y + entry.h;

  for (const label of ['A212', 'A211', 'A210', 'A209']) {
    assert.strictEqual(bottom(room(label)), bottom(room('A204')));
    assert.strictEqual(bottom(room(label)), bottom(room('A203')));
  }

  const topCorridor = room('A220').y - bottom(room('A221'));
  const bottomCorridor = room('A212').y - bottom(room('A213'));
  assert.ok(topCorridor > 0);
  assert.strictEqual(topCorridor, bottomCorridor);

  const upperCortileGap = area('Cortile interno').y - bottom(room('A220'));
  const lowerCortileGap = room('A213').y - bottom(area('Cortile interno'));
  assert.strictEqual(upperCortileGap, 5);
  assert.strictEqual(lowerCortileGap, upperCortileGap);

  const cortileCenterY = area('Cortile interno').y + area('Cortile interno').h / 2;
  for (const label of ['Uff. Rappr.', 'Studio PC']) {
    const sideArea = area(label);
    assert.strictEqual(sideArea.y + sideArea.h / 2, cortileCenterY);
  }
});

test('povo1-1 central corridor masks horizontal stroke behind bottom rooms', () => {
  const floor = floors.find((entry) => entry.id === 'povo1-1');
  const room = (label) => floor.rooms.find((entry) => entry.label === label);
  const centralCorridor = floor.corridors.find((entry) => entry.x === 235 && entry.y === 70);
  const horizontalCorridor = floor.corridors.find((entry) => entry.x === 110 && entry.y === 350);
  const bottomRow = ['A212', 'A211', 'A210', 'A209'].map(room);
  const alignedRooms = [...bottomRow, room('A204'), room('A203')];

  assert.ok(bottomRow.every((entry) =>
    centralCorridor.y <= entry.y && centralCorridor.y + centralCorridor.h >= entry.y + entry.h
  ));
  assert.ok(alignedRooms.every((entry) =>
    centralCorridor.y + centralCorridor.h === entry.y + entry.h
  ));
  assert.ok(bottomRow.every((entry) =>
    horizontalCorridor.y > entry.y && horizontalCorridor.y < entry.y + entry.h
  ));
  assert.ok(horizontalCorridor.x <= Math.min(...bottomRow.map((entry) => entry.x)));
  assert.ok(horizontalCorridor.x + horizontalCorridor.w >= Math.max(...bottomRow.map((entry) => entry.x + entry.w)));
  assert.ok(centralCorridor.y <= horizontalCorridor.y && centralCorridor.y + centralCorridor.h >= horizontalCorridor.y);
  assert.ok(floor.corridors.indexOf(centralCorridor) > floor.corridors.indexOf(horizontalCorridor));
});
