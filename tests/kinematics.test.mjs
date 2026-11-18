// Run with:  node --test tests/
// These encode anatomy the model must reproduce. If a change breaks one, the change is
// wrong until proven otherwise: discuss with Nazan before editing an expectation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rot, qRot, momentArm } from '../app/js/kinematics.js';

const data = JSON.parse(fs.readFileSync(new URL('../app/data/shoulder.json', import.meta.url)));
const R = data.R;
const L = n => { const l = data.lines.find(x => x.n === n); assert.ok(l, `missing line ${n}`); return l; };
const ma = (n, p, e, r, k) => momentArm(L(n), { p, e, r }, k, R);
const close = (a, b, tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < tol);

test('joint convention: abduction moves the humerus laterally (-x)', () => {
  const d = qRot(rot(0, 90, 0), [0, -1, 0]);
  assert.ok(close(d, [-1, 0, 0]), d);
});
test('joint convention: flexion moves the humerus anteriorly (+z)', () => {
  const d = qRot(rot(90, 90, 0), [0, -1, 0]);
  assert.ok(close(d, [0, 0, 1]), d);
});
test('joint convention: pure flexion has no hidden humeral roll', () => {
  // a lateral humeral point stays lateral when flexing in the sagittal plane
  const d = qRot(rot(90, 90, 0), [-1, 0, 0]);
  assert.ok(close(d, [-1, 0, 0]), d);
});
test('joint convention: +rotation is external rotation (anterior surface turns lateral)', () => {
  const d = qRot(rot(0, 0, 30), [0, 0, 1]);
  assert.ok(d[0] < -0.4, d);
});

test('middle deltoid abducts through 0–120° of abduction', () => {
  for (let e = 0; e <= 120; e += 10) assert.ok(ma('Middle deltoid', 0, e, 0, 'e') > 1, `e=${e}`);
});
test('supraspinatus abducts from 0–60°, about 1.5–2.5 cm', () => {
  for (let e = 0; e <= 60; e += 10) { const m = ma('Supraspinatus', 0, e, 0, 'e'); assert.ok(m > 1.5 && m < 2.5, `e=${e} m=${m}`); }
});
test('infraspinatus (lower) and teres minor externally rotate in key positions', () => {
  for (const [p, e] of [[0, 0], [0, 90], [90, 90]]) for (const n of ['Infraspinatus (lower)', 'Teres minor'])
    assert.ok(ma(n, p, e, 0, 'r') > 0.5, `${n} p=${p} e=${e}`);
});
test('subscapularis internally rotates in key positions', () => {
  for (const [p, e] of [[0, 0], [90, 90]]) for (const n of ['Subscapularis (upper)', 'Subscapularis (lower)'])
    assert.ok(ma(n, p, e, 0, 'r') < -0.5, `${n} p=${p} e=${e}`);
  assert.ok(ma('Subscapularis (lower)', 0, 90, 0, 'r') < -0.5);
});
test('latissimus and teres major adduct at 90° abduction and internally rotate at rest', () => {
  for (const n of ['Latissimus (thoracic)', 'Latissimus (iliac)', 'Teres major']) {
    assert.ok(ma(n, 0, 90, 0, 'e') < -2, n);
    assert.ok(ma(n, 0, 0, 0, 'r') < 0, n);
  }
});
test('pec major horizontally adducts at 90° abduction', () => {
  for (const n of ['Pec major (clavicular)', 'Pec major (upper sternal)', 'Pec major (lower sternal)'])
    assert.ok(ma(n, 0, 90, 0, 'p') > 2, n);
});
test('posterior deltoid horizontally abducts at 90° abduction', () => {
  assert.ok(ma('Posterior deltoid', 0, 90, 0, 'p') < -2);
});
test('posterior deltoid extends in the sagittal plane up to 90°', () => {
  for (let e = 0; e <= 90; e += 15) assert.ok(ma('Posterior deltoid', 90, e, 0, 'e') < 0, `e=${e}`);
});

// Continuity: moment arms should not jump between neighbouring 5° poses.
function worstJump(line, plane, k, sweep) {
  let prev = null, worst = 0, at = null;
  for (const x of sweep) {
    const pose = k === 'r' ? { p: plane, e: 90, r: x } : { p: plane, e: x, r: 0 };
    const m = momentArm(line, pose, k, R);
    if (prev !== null && Math.abs(m - prev) > worst) { worst = Math.abs(m - prev); at = x; }
    prev = m;
  }
  return { worst, at };
}
const elevSweep = Array.from({ length: 31 }, (_, i) => i * 5);
const rotSweep = Array.from({ length: 37 }, (_, i) => -90 + i * 5);
test('no moment-arm jump larger than 3 cm per 5° (guard level, must always pass)', () => {
  for (const l of data.lines) {
    for (const plane of [0, 40, 90]) { const j = worstJump(l, plane, 'e', elevSweep); assert.ok(j.worst < 3, `${l.n} plane ${plane}: ${j.worst.toFixed(1)} at ${j.at}`); }
    const j = worstJump(l, 0, 'r', rotSweep); assert.ok(j.worst < 3, `${l.n} rotation: ${j.worst.toFixed(1)} at ${j.at}`);
  }
});
test('no moment-arm jump larger than 1 cm per 5° (target once Known issue #1 is fixed)', { todo: true }, () => {
  for (const l of data.lines) {
    for (const plane of [0, 40, 90]) { const j = worstJump(l, plane, 'e', elevSweep); assert.ok(j.worst < 1, `${l.n} plane ${plane}: ${j.worst.toFixed(1)} at ${j.at}`); }
    const j = worstJump(l, 0, 'r', rotSweep); assert.ok(j.worst < 1, `${l.n} rotation: ${j.worst.toFixed(1)} at ${j.at}`);
  }
});
