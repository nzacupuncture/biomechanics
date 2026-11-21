// Clinical names and anatomical planes used for labels and the plane overlay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementName, elevationPlaneNormal, anatomicalPlanes, rot, qRot } from '../app/js/kinematics.js';
const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

test('names: plane of elevation reads as the clinical movement', () => {
  assert.equal(movementName(0), 'abduction'); assert.equal(movementName(40), 'scaption');
  assert.equal(movementName(90), 'flexion'); assert.equal(movementName(120), 'horizontal adduction');
  assert.equal(movementName(-90), 'extension');
});
test('planes: plane of elevation 0° is the frontal plane, 90° the sagittal plane', () => {
  assert.ok(close(elevationPlaneNormal(0), [0, 0, 1]) && close(elevationPlaneNormal(90), [1, 0, 0]));
});
test('planes: the humerus always lies in its own plane of elevation', () => {
  for (const [p, e] of [[0, 90], [90, 120], [40, 60], [120, 100], [-60, 40]]) {
    const d = qRot(rot(p, e, 0), [0, -1, 0]), n = elevationPlaneNormal(p);
    assert.ok(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) < 1e-9, `p${p} e${e}`);
  }
});
test('planes: trunk-aligned sagittal, frontal and transverse are perpendicular; humerus-aligned turn with it', () => {
  const t = anatomicalPlanes(null), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(Math.abs(dot(t.sagittal.n, t.frontal.n)) < 1e-9 && Math.abs(dot(t.frontal.n, t.transverse.n)) < 1e-9);
  const q = rot(90, 90, 0), h = anatomicalPlanes(q); // 90° flexion: humerus-aligned transverse plane is now vertical
  assert.ok(Math.abs(h.transverse.n[1]) < 1e-9);
});
