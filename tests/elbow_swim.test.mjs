// Elbow and swimmer-frame tests. Same rule as kinematics.test.mjs: these encode anatomy; if a
// change breaks one, the change is wrong until proven otherwise (discuss with Nazan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { momentArm, length, toSwimmer, qRot, rot } from '../app/js/kinematics.js';

const data = JSON.parse(fs.readFileSync(new URL('../app/data/shoulder.json', import.meta.url)));
const R = data.R;
const L = n => data.lines.find(x => x.n === n);
const ma = (n, pose, k) => momentArm(L(n), pose, k, R);
const BICEPS = ['Biceps (long head)', 'Biceps (short head)'];

test('elbow: biceps flexes the elbow, most strongly around 90°', () => {
  for (const n of BICEPS) {
    for (const k of [0, 30, 60, 90, 120, 145]) assert.ok(ma(n, { p: 0, e: 0, r: 0, k }, 'k') > 0.5, `${n} k=${k}`);
    const m90 = ma(n, { p: 0, e: 0, r: 0, k: 90 }, 'k');
    assert.ok(m90 > 3 && m90 < 6, `${n} at 90°: ${m90}`);
    assert.ok(m90 > ma(n, { p: 0, e: 0, r: 0, k: 0 }, 'k') && m90 > ma(n, { p: 0, e: 0, r: 0, k: 145 }, 'k'), n);
  }
});
test('elbow: biceps shortens as the elbow flexes', () => {
  for (const n of BICEPS) {
    let prev = Infinity;
    for (let k = 0; k <= 145; k += 15) { const l = length(L(n), { p: 0, e: 0, r: 0, k }, R); assert.ok(l < prev, `${n} k=${k}`); prev = l; }
  }
});
test('elbow: triceps extends the elbow through its whole range, about 1.5–2.5 cm', () => {
  for (let k = 0; k <= 145; k += 5) { const m = ma('Triceps (long head)', { p: 0, e: 0, r: 0, k }, 'k'); assert.ok(m < -1.5 && m > -2.5, `k=${k} m=${m}`); }
});
test('elbow: muscles that do not cross the elbow have no elbow moment arm', () => {
  for (const l of data.lines.filter(x => !x.el)) assert.equal(momentArm(l, { p: 0, e: 90, r: 0, k: 60 }, 'k', R), 0, l.n);
});
test('elbow: leaving the elbow at its built angle changes nothing at the shoulder', () => {
  for (const l of data.lines) for (const pose of [{ p: 0, e: 90, r: 0 }, { p: 90, e: 120, r: -20 }]) for (const k of ['e', 'p', 'r']) {
    const a = momentArm(l, pose, k, R), b = momentArm(l, { ...pose, k: l.el ? l.el.k0 : 90 }, k, R);
    assert.ok(Math.abs(a - b) < 1e-9, `${l.n} ${k}`);
  }
});
test('swimmer: prone with no roll, the front of the body faces the pool floor and the head leads', () => {
  const o = toSwimmer([0, 0, 0], 0, [0, 0, 0]);
  const ant = toSwimmer([0, 0, 1], 0, [0, 0, 0]), up = toSwimmer([0, 1, 0], 0, [0, 0, 0]);
  assert.ok(ant[1] - o[1] < -0.999 && up[0] - o[0] > 0.999);
});
test('swimmer: rolling (+) lifts the right shoulder and the hanging arm', () => {
  const pivot = [15, 0, -5]; // trunk centre line: medial (+x) and behind the GH centre
  const gh = r => toSwimmer([0, 0, 0], r, pivot)[1];
  assert.ok(gh(40) > gh(0) + 5, `${gh(0)} -> ${gh(40)}`);
  const elbow = r => toSwimmer(qRot(rot(0, 0, 0), data.ep), r, pivot)[1];
  assert.ok(elbow(40) > elbow(0));
});
