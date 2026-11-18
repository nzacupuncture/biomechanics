// Shoulder girdle tests. These encode anatomy: if a change breaks one, the change is wrong until
// proven otherwise (discuss with Nazan before editing an expectation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { girdle, rhythm, ghElevation, rot, momentArm } from '../app/js/kinematics.js';

const data = JSON.parse(fs.readFileSync(new URL('../app/data/shoulder.json', import.meta.url)));
const geo = data.girdle, R = data.R;
const moved = (G, P) => girdle({ geo, ...G }).scap(P);
const L = n => { const l = data.lines.find(x => x.n === n); assert.ok(l, `missing line ${n}`); return l; };
const ma = (n, k, pose = { p: 0, e: 0, r: 0, girdle: { geo } }) => momentArm(L(n), pose, k, R);

test('girdle: upward rotation swings the inferior angle laterally and lifts the glenoid', () => {
  const ai = moved({ ur: 30 }, geo.AI), gh = moved({ ur: 30 }, [0, 0, 0]);
  assert.ok(ai[0] < geo.AI[0] - 3, `AI x ${geo.AI[0]} -> ${ai[0]}`); // x = medial(+)
  assert.ok(gh[1] > 0.5, `GH y ${gh[1]}`);
});
test('girdle: posterior tilt brings the inferior angle forward against the ribs', () => {
  assert.ok(moved({ pt: 20 }, geo.AI)[2] > geo.AI[2] + 2);
});
test('girdle: internal rotation lifts the medial border off the thorax (winging)', () => {
  assert.ok(moved({ ir: 20 }, geo.AI)[2] < geo.AI[2] - 2 && moved({ ir: 20 }, geo.TS)[2] < geo.TS[2] - 2);
});
test('girdle: clavicular elevation raises, and retraction pulls back, the whole scapula', () => {
  assert.ok(moved({ ce: 20 }, geo.AC)[1] > geo.AC[1] + 3);
  assert.ok(moved({ cr: 20 }, geo.AC)[2] < geo.AC[2] - 3);
});
test('girdle: with no angles nothing moves', () => {
  for (const k of ['AI', 'TS', 'SA', 'AA', 'CP', 'AC']) assert.deepEqual(moved({}, geo[k]).map(x => +x.toFixed(9)), geo[k].map(x => +x.toFixed(9)));
});
test('rhythm: at 120° of arm elevation roughly two thirds happens at the glenohumeral joint', () => {
  const gh = ghElevation(rot(40, 120, 0), { geo, ...rhythm(120) });
  assert.ok(gh > 65 && gh < 90, `GH ${gh}`);
});
// Textbook actions at rest (urg = upward rotation of the whole girdle; ce elevation; cr retraction;
// pt posterior tilt; ir internal rotation, i.e. winging).
test('scapular muscles: upward rotators at rest (upper and lower trapezius, lower serratus)', () => {
  for (const n of ['Trapezius (upper)', 'Trapezius (lower)', 'Serratus anterior (lower)']) assert.ok(ma(n, 'urg') > 0.5, n);
});
test('scapular muscles: downward rotators at rest (rhomboids, levator scapulae, pec minor)', () => {
  for (const n of ['Rhomboid minor', 'Rhomboid major', 'Levator scapulae', 'Pectoralis minor']) assert.ok(ma(n, 'urg') < -0.5, n);
});
test('scapular muscles: elevators (upper trapezius, levator, rhomboids) and depressors (lower trapezius, pec minor)', () => {
  for (const n of ['Trapezius (upper)', 'Levator scapulae', 'Rhomboid minor', 'Rhomboid major']) assert.ok(ma(n, 'ce') > 0.5, n);
  for (const n of ['Trapezius (lower)', 'Pectoralis minor']) assert.ok(ma(n, 'ce') < -0.5, n);
});
test('scapular muscles: retractors (middle trapezius, rhomboids) and protractors (serratus, pec minor)', () => {
  for (const n of ['Trapezius (middle)', 'Rhomboid minor', 'Rhomboid major']) assert.ok(ma(n, 'cr') > 0, n);
  for (const n of ['Serratus anterior (upper)', 'Serratus anterior (lower)', 'Pectoralis minor']) assert.ok(ma(n, 'cr') < -0.5, n);
});
test('scapular muscles: serratus holds the medial border on the thorax; pec minor tilts the scapula forward', () => {
  for (const n of ['Serratus anterior (upper)', 'Serratus anterior (lower)']) assert.ok(ma(n, 'ir') < -0.5, n);
  assert.ok(ma('Pectoralis minor', 'pt') < -0.5);
});
test('girdle moving: shoulder moment arms are about the glenohumeral joint, which moves with the scapula', () => {
  // supraspinatus still abducts with the scapula upwardly rotated, and its origin went with the scapula
  const pose = { p: 0, e: 90, r: 0, girdle: { geo, ...rhythm(90) } };
  assert.ok(ma('Supraspinatus', 'e', pose) > 0.5);
  assert.ok(ma('Middle deltoid', 'e', pose) > 1);
});

// Continuity with the scapula moving with the arm (the app's default view).
import { momentArm as mA } from '../app/js/kinematics.js';
function worstJumpRhythm(line, plane, k, sweep) {
  let prev = null, worst = 0, at = null;
  for (const x of sweep) {
    const pose = k === 'r' ? { p: plane, e: 90, r: x, girdle: { geo, ...rhythm(90) } } : { p: plane, e: x, r: 0, girdle: { geo, ...rhythm(x) } };
    const m = mA(line, pose, k, R);
    if (prev !== null && Math.abs(m - prev) > worst) { worst = Math.abs(m - prev); at = x; }
    prev = m;
  }
  return { worst, at };
}
const elevSweep = Array.from({ length: 31 }, (_, i) => i * 5), rotSweep = Array.from({ length: 37 }, (_, i) => -90 + i * 5);
const humeral = data.lines.filter(l => !l.ib);
test('scapula moving: no moment-arm jump larger than 3 cm per 5° (guard level)', () => {
  for (const l of humeral) {
    for (const plane of [0, 40, 90]) { const j = worstJumpRhythm(l, plane, 'e', elevSweep); assert.ok(j.worst < 3, `${l.n} plane ${plane}: ${j.worst.toFixed(1)} at ${j.at}`); }
    const j = worstJumpRhythm(l, 0, 'r', rotSweep); assert.ok(j.worst < 3, `${l.n} rotation: ${j.worst.toFixed(1)} at ${j.at}`);
  }
});
test('scapula moving: no moment-arm jump larger than 1 cm per 5° (target)', { todo: true }, () => {
  for (const l of humeral) {
    for (const plane of [0, 40, 90]) { const j = worstJumpRhythm(l, plane, 'e', elevSweep); assert.ok(j.worst < 1, `${l.n} plane ${plane}: ${j.worst.toFixed(1)} at ${j.at}`); }
    const j = worstJumpRhythm(l, 0, 'r', rotSweep); assert.ok(j.worst < 1, `${l.n} rotation: ${j.worst.toFixed(1)} at ${j.at}`);
  }
});

// Dragging: the inverse finds the angles that produced a pose (round trip).
import { scapulaAngles, clavicleAngles, turnAbout } from '../app/js/kinematics.js';
test('dragging: scapula and clavicle angles are recovered from their rotations', () => {
  const want = { ur: 25, pt: -10, ir: 15, ce: 12, cr: -8 }, g = girdle({ geo, ...want });
  const s = scapulaAngles({ geo, ur: 0, pt: 0, ir: 0 }, g.qS), c = clavicleAngles({ geo, ce: 0, cr: 0 }, g.qC);
  for (const k of ['ur', 'pt', 'ir']) assert.ok(Math.abs(s[k] - want[k]) < 0.01, `${k} ${s[k]}`);
  for (const k of ['ce', 'cr']) assert.ok(Math.abs(c[k] - want[k]) < 0.01, `${k} ${c[k]}`);
});
test('dragging: turning about an axis gives the signed angle (right-hand rule)', () => {
  assert.ok(Math.abs(turnAbout([1, 0, 0], [0, 1, 0], [0, 0, 1]) - 90) < 1e-9);  // +y to +z about +x
  assert.ok(Math.abs(turnAbout([1, 0, 0], [0, 0, 1], [0, 1, 0]) + 90) < 1e-9);
});
