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
// Side-locked wrapping for the rotator cuff and middle deltoid (continuous; Known issue 1).
// The head is a sphere at the GH centre. Each of these lines also has a humerus-fixed WALL:
// a half-plane that starts at a wrap axis through the centre and extends out on the side
// OPPOSITE the line's anatomical side S (superior for supraspinatus, posterior for
// infraspinatus and teres minor, anterior for subscapularis, lateral for middle deltoid).
// The tendon takes the shortest path round the head that does not pass through the wall.
// Usually that is just the ordinary shortest path round the sphere. When that would slip round
// the wrong side of the head, the tendon is held at the edge of the wall (the wrap axis, just
// outside the head) or goes the long way round on its own side, whichever is shorter. So it
// stays on its anatomical side (decision 2).
// Why this replaced the pilot's version: that one picked the short or long way round with a
// side score, so the length jumped by up to 6 cm whenever the pick flipped, often at poses
// where the tendon was nowhere near the "wrong" side. A shortest distance round obstacles that
// are fixed to the humerus changes continuously with the pose, so lengths no longer jump.
// What is left are a few places where two equally short routes swap over (the moment arm
// changes sharply there); see CLAUDE.md "Known issues".
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const TAU = 2 * Math.PI;

// Taut route from A to B round a sphere (radius R, at the origin), the short way (sg = 1) or
// the long way (sg = -1): a straight line if the short way clears the sphere, otherwise
// tangent line, great-circle arc, tangent line. withPts = false skips the drawing points.
export function sphereRoute(A, B, R, sg = 1, withPts = true) {
  const a = v.len(A), b = v.len(B);
  const th = Math.acos(Math.max(-1, Math.min(1, v.dot(A, B) / a / b)));
  const a1 = Math.acos(Math.min(1, R / a)), a2 = Math.acos(Math.min(1, R / b));
  const arc = (sg > 0 ? th : TAU - th) - a1 - a2;
  if (sg > 0 && arc <= 0) return { L: v.dist(A, B), pts: [A, B] };
  const L = Math.sqrt(Math.max(0, a * a - R * R)) + Math.sqrt(Math.max(0, b * b - R * R)) + R * arc;
  if (!withPts) return { L };
  const u = v.mul(A, 1 / a);
  let w = v.sub(B, v.mul(u, v.dot(B, u)));
  if (v.len(w) < 1e-9) w = cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]); // exactly opposite: any plane
  w = v.norm(w);
  const pts = [A], n = Math.max(3, Math.ceil(arc / 0.12));
  for (let k = 0; k <= n; k++) {
    const f = a1 + arc * k / n;
    pts.push(v.add(v.mul(u, Math.cos(f) * R), v.mul(w, sg * Math.sin(f) * R)));
  }
  pts.push(B);
  return { L, pts };
}

// Does a polyline pass through the wall {alpha n + beta d : beta > 0}?
function crossesWall(pts, n, d) {
  const m = cross(n, d); // normal of the wall's plane
  for (let k = 1; k < pts.length; k++) {
    const d0 = v.dot(pts[k - 1], m), d1 = v.dot(pts[k], m);
    if ((d0 <= 0 && d1 >= 0) || (d0 >= 0 && d1 <= 0)) {
      const t = d0 === d1 ? 0 : d0 / (d0 - d1);
      if (v.dot(v.add(pts[k - 1], v.mul(v.sub(pts[k], pts[k - 1]), t)), d) > 0) return true;
    }
  }
  return false;
}

// Minimum of f on [lo, hi]: coarse scan (so the best dip is found), then golden-section search.
function minimise1(f, lo, hi, scan = 90) {
  let bt = lo, bf = Infinity;
  for (let k = 0; k <= scan; k++) { const t = lo + (hi - lo) * k / scan, ft = f(t); if (ft < bf) { bf = ft; bt = t; } }
  const w = (hi - lo) / scan, g = (3 - Math.sqrt(5)) / 2;
  let a = Math.max(lo, bt - w), b = Math.min(hi, bt + w), x1 = a + g * (b - a), x2 = b - g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let k = 0; k < 60; k++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = a + g * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = b - g * (b - a); f2 = f(x2); }
  }
  return f1 < f2 ? x1 : x2;
}

// Shortest path from O to I held at the edge of the wall: a point on the wrap axis outside the
// head, above or below it (each leg goes round the sphere if it has to).
function heldAtEdge(O, I, R, n) {
  const far = 4 * Math.max(v.len(O), v.len(I), R);
  let best = null;
  for (const sg of [1, -1]) {
    const f = t => { const X = v.mul(n, sg * t); return sphereRoute(O, X, R, 1, false).L + sphereRoute(X, I, R, 1, false).L; };
    const t = minimise1(f, R, far), L = f(t);
    if (!best || L < best.L) best = { L, X: v.mul(n, sg * t) };
  }
  return { L: best.L, pts: sphereRoute(O, best.X, R).pts.concat(sphereRoute(best.X, I, R).pts.slice(1)) };
}

// The side-locked wrap: shortest path from O to I round the sphere (radius R) that does not
// pass through the wall on the side opposite s (n = wrap axis; all posed, unit, perpendicular).
export function sideWrap(O, I, R, n, s) {
  const d = v.mul(s, -1), ok = rt => !crossesWall(rt.pts, n, d);
  const direct = sphereRoute(O, I, R);
  if (ok(direct)) return direct;
  let best = heldAtEdge(O, I, R, n);
  const long = sphereRoute(O, I, R, -1);
  if (ok(long) && long.L < best.L) best = long;
  return best;
}

// Wrap radius: cuff on its insertion's sphere, middle deltoid over head + 1.2 cm of tendon and
// bursa; an origin inside the sphere (acromion) shrinks it to 0.97 × origin distance (decision 4).
const wrapRadius = (line, headR) => Math.min(line.wrap === 'ins' ? v.len(line.i) : headR + 1.2, 0.97 * v.len(line.o), v.len(line.i));

// Humerus-local wall for a line, worked out once: the side s, and the wrap axis n, perpendicular
// to s and to the chord O→I at the arm-by-side pose (the axis the tendon wraps round there).
const WALLS = new WeakMap();
export function wrapWall(line) {
  if (!WALLS.has(line)) {
    const s0 = v.norm(line.side), n = v.norm(cross(v.sub(line.i, line.o), s0));
    WALLS.set(line, { n, s: v.norm(cross(n, cross(s0, n))) }); // s made exactly perpendicular to n
  }
  return WALLS.get(line);
}

// ---- elbow -------------------------------------------------------------------
// Muscles inserting on the forearm (biceps, triceps) carry `el`: the elbow's flexion axis
// (epicondyle to epicondyle, humerus-local), its centre, and k0, the flexion the forearm was
// built at (89.6°). Elbow angle k: 0 = straight, + = flexion. Without k the forearm stays at k0,
// so every shoulder value is exactly as in the pilot.
export function forearm(line, k) {
  if (!line.el || k === undefined || k === null) return line.i;
  const { ep, ax, k0 } = line.el, q = qAxis(ax, (k - k0) * D);
  return v.add(ep, qRot(q, v.sub(line.i, ep)));
}
// Triceps (el.wrap): the tendon wraps round the back of the distal humerus and olecranon, modelled
// as a cylinder on the elbow axis passing through the insertion, always wound round the posterior
// side. Seen along the axis this is the usual tangent-plus-arc; unrolled, L = hypot(planar, rise).
// Without it the straight line passed in front of the axis beyond ~85° flexion and the triceps
// turned into a flexor.
export function elbowWrap(O, I, el) {
  const A = el.ax, rel = x => v.sub(x, el.ep), o = rel(O), i = rel(I);
  const oh = v.dot(o, A), ih = v.dot(i, A), Op = v.sub(o, v.mul(A, oh)), Ip = v.sub(i, v.mul(A, ih));
  const ro = v.len(Op), r = v.len(Ip), straight = { L: v.dist(O, I), pts: [O, I] };
  if (ro <= r) return straight;
  const a1 = Math.acos(r / ro), cr = [Op[1] * Ip[2] - Op[2] * Ip[1], Op[2] * Ip[0] - Op[0] * Ip[2], Op[0] * Ip[1] - Op[1] * Ip[0]];
  let phi = el.wrap * Math.atan2(v.dot(cr, A), v.dot(Op, Ip));
  if (phi < -a1) phi += 2 * Math.PI; // cut only where it would touch the front: never in range
  const arc = phi - a1;
  if (arc <= 0) return straight;
  const t1 = Math.sqrt(ro * ro - r * r), Lp = t1 + r * arc, dh = ih - oh;
  const e1 = v.mul(Op, 1 / ro), e2 = v.mul([A[1] * e1[2] - A[2] * e1[1], A[2] * e1[0] - A[0] * e1[2], A[0] * e1[1] - A[1] * e1[0]], el.wrap);
  const pts = [O], n = Math.max(3, Math.ceil(arc / 0.15));
  for (let k = 0; k <= n; k++) {
    const f = a1 + arc * k / n, h = oh + dh * (t1 + r * (f - a1)) / Lp;
    pts.push(v.add(el.ep, v.add(v.add(v.mul(e1, r * Math.cos(f)), v.mul(e2, r * Math.sin(f))), v.mul(A, h))));
  }
  pts.push(I);
  return { L: Math.hypot(Lp, dh), pts };
}

// The same rotation for any forearm point (used to draw the forearm and to place the wrist).
export const elbowQ = (el, k) => qAxis(el.ax, (k - el.k0) * D);

// ---- swimmer frame ----------------------------------------------------------
// Turns the upright anatomical model into a prone swimmer and rolls the body about the trunk's
// long axis. World frame: +X = direction of travel (head), +Y = up out of the water,
// +Z = the swimmer's right. Roll + = right shoulder rising (rolled onto the left side), as in a
// right-arm recovery. pivot = a point on the roll axis (the trunk's centre line).
// Body roll does not change any muscle length: every muscle here rolls with the trunk. What it
// changes is where the arm is relative to the water for the same shoulder angles.
const PRONE = (() => { // body x (medial) -> -Z, body y (up) -> +X, body z (anterior) -> -Y
  const m = [[0, 1, 0], [0, 0, -1], [-1, 0, 0]]; // rows: world X, Y, Z in body terms
  const tr = m[0][0] + m[1][1] + m[2][2], w = Math.sqrt(Math.max(0, 1 + tr)) / 2;
  if (w > 1e-6) return [(m[2][1] - m[1][2]) / (4 * w), (m[0][2] - m[2][0]) / (4 * w), (m[1][0] - m[0][1]) / (4 * w), w];
  const x = Math.sqrt(Math.max(0, 1 + m[0][0] - m[1][1] - m[2][2])) / 2;
  return [x, (m[0][1] + m[1][0]) / (4 * x), (m[0][2] + m[2][0]) / (4 * x), (m[2][1] - m[1][2]) / (4 * x)];
})();
export const swimQ = roll => qMul(qAxis([1, 0, 0], -roll * D), PRONE);
export const toSwimmer = (P, roll, pivot) => qRot(swimQ(roll), v.sub(P, pivot));

// ---- muscle path ------------------------------------------------------------
// line: { o: fixed point (thorax/scapula/clavicle frame), i: humerus-local point,
//         via?: humerus-local fixed via point (long head of biceps in the groove),
//         wrap?: 'ins' | 'delt' | 'tub', side?: humerus-local direction, tub?: humerus-local point }
export function path(line, q, headR, elbow) {
  const O = line.o, I = qRot(q, forearm(line, elbow));
  if (line.el && line.el.wrap) { // triceps: wrap at the elbow, worked out in the humerus frame
    const P = elbowWrap(qRot(qInv(q), O), forearm(line, elbow), line.el);
    return { L: P.L, pts: P.pts.map((x, k) => (k === 0 ? O : qRot(q, x))) };
  }
  if (line.via) {
    const W = qRot(q, line.via);
    return { L: v.dist(O, W) + v.dist(W, I), pts: [O, W, I] };
  }
  if (line.wrap === 'tub') {
    // Tubercle obstacle (anterior/posterior deltoid, unchanged from the pilot): the fibre drapes
    // over T only when T protrudes beyond the straight line. This still switches on and off
    // abruptly; see CLAUDE.md "Known issues".
    const T = qRot(q, line.tub), d = v.sub(I, O);
    const t = Math.max(0, Math.min(1, v.dot(v.sub(T, O), d) / v.dot(d, d)));
    const P = v.add(O, v.mul(d, t));
    if (v.dot(v.sub(T, P), v.norm(T)) > 0) return { L: v.dist(O, T) + v.dist(T, I), pts: [O, T, I] };
    return { L: v.dist(O, I), pts: [O, I] };
  }
  if (line.wrap) { const W = wrapWall(line); return sideWrap(O, I, wrapRadius(line, headR), qRot(q, W.n), qRot(q, W.s)); }
  return { L: v.dist(O, I), pts: [O, I] };
}

export const length = (line, pose, headR) => path(line, rot(pose.p, pose.e, pose.r, pose.h || 0), headR, pose.k).L;

// Moment arm (cm) = -dL/dθ.  Positive = drives elevation / horizontal adduction / external rotation.
// k: 'e' elevation, 'p' horizontal (perturbs h: pure rotation about the vertical axis), 'r' rotation.
// Uses one-sided differences: where the wrap switches route the length jumps, and a central
// difference across that jump would give absurd values (100+ cm). In that case the smaller
// one-sided slope is used. This is a guard, not a fix: see CLAUDE.md "Known issues" #1.
// k: 'e' elevation, 'p' horizontal, 'r' rotation, or 'k' elbow (+ = flexes the elbow).
export function momentArm(line, pose, k, headR) {
  if (k === 'k' && !line.el) return 0; // does not cross the elbow
  const key = k === 'p' ? 'h' : k, step = 1;
  const base = { ...pose, h: 0 };
  if (k === 'k' && (base.k === undefined || base.k === null)) base.k = line.el.k0;
  const at = dx => { const s = { ...base }; s[key] += dx; return length(line, s, headR); };
  const L0 = at(0), fwd = -(at(step) - L0) / (step * D), back = -(L0 - at(-step)) / (step * D);
  if (Math.abs(fwd - back) > 2) return Math.abs(fwd) < Math.abs(back) ? fwd : back;
  return (fwd + back) / 2;
}
