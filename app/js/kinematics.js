// Shoulder kinematics and muscle path geometry.
// Pure maths, no rendering library, so it can be unit-tested in Node (see tests/).
// Frame (cm, origin = glenohumeral centre): x = medial(+)/lateral(-) for the RIGHT side,
// y = up, z = anterior. Read CLAUDE.md "Conventions" before changing anything here.

export const D = Math.PI / 180;

// ---- small vector / quaternion helpers -------------------------------------
export const v = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: a => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
};

// quaternion as [x, y, z, w]
const qAxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
export const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qRot = (q, p) => {
  const [x, y, z, w] = q, [px, py, pz] = p;
  const ix = w * px + y * pz - z * py, iy = w * py + z * px - x * pz, iz = w * pz + x * py - y * px, iw = -x * px - y * py - z * pz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
export const qInv = q => [-q[0], -q[1], -q[2], q[3]];

// ---- joint convention -------------------------------------------------------
// p = plane of elevation (0 = abduction/frontal, 90 = flexion/sagittal, >90 cross-body)
// e = elevation, r = axial rotation (+ = external rotation), h = extra rotation about the
// vertical axis (used only to compute horizontal ab/adduction moment arms).
// Elevation happens WITHOUT hidden humeral roll: R = Ry(p+h) * Rz(-e) * Ry(-p) * Ry(-r).
// Do NOT replace with the plain ISB Y-X-Y sequence: at p = 90 it silently adds a 90° roll
// and the cuff rotation moment arms come out with the wrong sign (bug found in the pilot).
export function rot(p, e, r, h = 0) {
  return qMul(qMul(qAxis([0, 1, 0], (p + h) * D), qAxis([0, 0, 1], -e * D)), qAxis([0, 1, 0], -(p + r) * D));
}

// ---- wrapping over the humeral head -----------------------------------------
// Great-circle wrap over a sphere centred on the GH centre, LOCKED to an anatomical side S
// (a humerus-fixed direction rotated with the arm). A frictionless wrap otherwise takes the
// shorter way, and tendons flip to the wrong side of the head in end-range rotation.
export function wrapPath(O, I, Rw, S) {
  const o = v.len(O), i = v.len(I);
  Rw = Math.min(Rw, 0.97 * o, i); // origin inside the sphere (e.g. acromion): shrink the sphere
  if (o <= Rw * 1.0001) return { L: v.dist(O, I), pts: [O, I] };
  const u = v.norm(O), w = v.norm(v.sub(I, v.mul(u, v.dot(I, u))));
  const th = Math.acos(Math.max(-1, Math.min(1, v.dot(O, I) / o / i)));
  const a1 = Math.acos(Rw / o), a2 = Math.acos(Math.min(1, Rw / i));
  const cand = [1, -1].map(sg => {
    const arc = (sg > 0 ? th : 2 * Math.PI - th) - a1 - a2, mid = a1 + arc / 2;
    const m = v.add(v.mul(u, Math.cos(mid)), v.mul(w, sg * Math.sin(mid)));
    return { sg, arc, score: S ? v.dot(m, S) : 0 };
  });
  let pick;
  if (cand[0].arc <= 0) {
    // Straight line clears the sphere. Accept it only if it clears on the anatomical side.
    const d = v.sub(I, O), t = Math.max(0, Math.min(1, -v.dot(O, d) / v.dot(d, d)));
    const P = v.add(O, v.mul(d, t));
    if (!S || v.dot(P, S) >= 0) return { L: v.dist(O, I), pts: [O, I] };
    pick = cand[1];
  } else pick = cand[0].score >= cand[1].score ? cand[0] : cand[1];
  const pts = [O], n = Math.max(3, Math.ceil(pick.arc / 0.12));
  for (let k = 0; k <= n; k++) {
    const f = a1 + pick.arc * k / n;
    pts.push(v.add(v.mul(u, Math.cos(f) * Rw), v.mul(w, pick.sg * Math.sin(f) * Rw)));
  }
  pts.push(I);
  return { L: Math.sqrt(o * o - Rw * Rw) + Math.sqrt(Math.max(0, i * i - Rw * Rw)) + Rw * pick.arc, pts };
}

// ---- muscle path ------------------------------------------------------------
// line: { o: fixed point (thorax/scapula/clavicle frame), i: humerus-local point,
//         via?: humerus-local fixed via point (long head of biceps in the groove),
//         wrap?: 'ins' | 'delt' | 'tub', side?: humerus-local direction, tub?: humerus-local point }
export function path(line, q, headR) {
  const O = line.o, I = qRot(q, line.i), S = line.side ? qRot(q, line.side) : null;
  if (line.via) {
    const W = qRot(q, line.via);
    return { L: v.dist(O, W) + v.dist(W, I), pts: [O, W, I] };
  }
  if (line.wrap === 'tub') {
    // Tubercle obstacle: the fibre drapes over T only when T protrudes beyond the straight line.
    const T = qRot(q, line.tub), d = v.sub(I, O);
    const t = Math.max(0, Math.min(1, v.dot(v.sub(T, O), d) / v.dot(d, d)));
    const P = v.add(O, v.mul(d, t));
    if (v.dot(v.sub(T, P), v.norm(T)) > 0) return { L: v.dist(O, T) + v.dist(T, I), pts: [O, T, I] };
    return { L: v.dist(O, I), pts: [O, I] };
  }
  if (line.wrap === 'ins') return wrapPath(O, I, v.len(line.i), S);
  if (line.wrap === 'delt') return wrapPath(O, I, headR + 1.2, S);
  return { L: v.dist(O, I), pts: [O, I] };
}

export const length = (line, pose, headR) => path(line, rot(pose.p, pose.e, pose.r, pose.h || 0), headR).L;

// Moment arm (cm) = -dL/dθ.  Positive = drives elevation / horizontal adduction / external rotation.
// k: 'e' elevation, 'p' horizontal (perturbs h: pure rotation about the vertical axis), 'r' rotation.
// Uses one-sided differences: where the wrap switches route the length jumps, and a central
// difference across that jump would give absurd values (100+ cm). In that case the smaller
// one-sided slope is used. This is a guard, not a fix: see CLAUDE.md "Known issues" #1.
export function momentArm(line, pose, k, headR) {
  const key = k === 'p' ? 'h' : k, step = 1;
  const at = dx => { const s = { ...pose, h: 0 }; s[key] += dx; return length(line, s, headR); };
  const L0 = at(0), fwd = -(at(step) - L0) / (step * D), back = -(L0 - at(-step)) / (step * D);
  if (Math.abs(fwd - back) > 2) return Math.abs(fwd) < Math.abs(back) ? fwd : back;
  return (fwd + back) / 2;
}
