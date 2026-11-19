// What the shoulder can actually do: positions the model must allow, and ones it must refuse.
// Encodes anatomy: discuss with Nazan before changing an expectation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { armPossible, rhythmFor, maxElevation, girdlePossible, rhythm } from '../app/js/kinematics.js';

const data = JSON.parse(fs.readFileSync(new URL('../app/data/shoulder.json', import.meta.url)));
const geo = data.girdle;
const pose = (p, e, r, k = 90) => ({ p, e, r, k, girdle: { geo, ...rhythmFor(p, e) } });
const can = (...a) => armPossible(pose(...a), data);

test('range: everyday and sporting positions are possible', () => {
  for (const [p, e, r, k] of [[0, 0, 0, 90], [0, 90, 0, 90], [90, 120, 0, 90], [0, 90, 85, 90], [-75, 40, -80, 90], [80, 150, -15, 90],
    [-10, 170, -10, 80], [15, 70, -40, 90], [-30, 10, -20, 20], [-30, 35, -70, 70], [-30, 105, -10, 120], [5, 165, -20, 20]])
    assert.ok(can(p, e, r, k), `p${p} e${e} r${r} k${k}`);
});
test('range: the arm cannot pass through the trunk (cross-body at low elevation)', () => {
  assert.ok(!can(130, 30, 0) && !can(130, 15, 0));
});
test('range: internal rotation at the side stops when the forearm meets the trunk', () => {
  assert.ok(can(0, 0, -30) && !can(0, 0, -90));
});
test('range: extension is limited to about 60°', () => {
  assert.ok(can(-90, 50, 0) && !can(-90, 70, 0));
  assert.equal(maxElevation(-90), 60); assert.equal(maxElevation(0), 170);
});
test('range: no scapular rhythm in pure extension', () => {
  assert.equal(rhythmFor(-90, 50).ur, 0);
});

test('scapula: the healthy rhythm keeps it out of the ribs and within lift-off limits at every elevation', () => {
  for (let e = 0; e <= 170; e += 10) assert.ok(girdlePossible({ geo, ...rhythm(e) }), `e=${e}`);
});
test('scapula: protraction, moderate retraction and moderate winging are possible', () => {
  // pure retraction is limited by the clavicle meeting the first rib (~11° in this skeleton; see below)
  for (const G of [{ cr: -20 }, { cr: 10 }, { ir: 20 }, { ur: 40 }, { ce: 30 }]) assert.ok(girdlePossible({ geo, ...G }), JSON.stringify(G));
});
test('scapula: it cannot sink into the ribs (posterior tilt or negative winging on their own)', () => {
  assert.ok(!girdlePossible({ geo, pt: 25 }) && !girdlePossible({ geo, ir: -15 }));
});
test('scapula: it cannot fly off the chest (heavy winging with protraction)', () => {
  assert.ok(!girdlePossible({ geo, ir: 40 }) && !girdlePossible({ geo, cr: -20, ir: 40 }));
});

test('clavicle: it cannot be driven down or back through the first rib', () => {
  assert.ok(!girdlePossible({ geo, ce: -10 }) && !girdlePossible({ geo, cr: 25 }));
});
// In this skeleton the clavicle rests on the first rib, so pure retraction meets it at ~11° and pure
// depression at ~7° (costoclavicular space); with elevation, as in the rhythm, retraction goes further.
test('clavicle: elevation, protraction and moderate retraction stay possible', () => {
  for (const G of [{ ce: 30 }, { cr: -20 }, { cr: 10 }, { ce: 10, cr: 10 }, { ce: 17, cr: 22 }]) assert.ok(girdlePossible({ geo, ...G }), JSON.stringify(G));
});
