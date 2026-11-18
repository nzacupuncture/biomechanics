// Rendering and UI. All biomechanics lives in kinematics.js (unit-tested); this file only
// draws what kinematics.js computes. THREE is loaded as a global (UMD r128) in index.html.
import { rot, path, length, momentArm, qInv, qRot, qMul, D, elbowQ, swimQ, toSwimmer } from './kinematics.js?v=dev';

const DATA = await (await fetch('data/shoulder.json?v=dev')).json();
const HR = DATA.R;
const $ = id => document.getElementById(id);
const GROUPS = [['cuff', 'Rotator cuff'], ['delt', 'Deltoid'], ['pec', 'Pec major'], ['lat', 'Lat and teres major'], ['arm', 'Arm muscles'], ['mine', 'Your lines']];
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const gcol = g => new THREE.Color(css('--' + g));
const T3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const toQ = q => new THREE.Quaternion(q[0], q[1], q[2], q[3]);

const st = { p: 0, e: 0, r: 0, k: 90, roll: 40 };
const EL = DATA.lines.find(l => l.el).el; // elbow axis, centre and built angle
let swim = false;
let sel = null, drawMode = false, pending = null;
const shown = Object.fromEntries(GROUPS.map(g => [g[0], true]));
const STORE = 'shoulder-lines';
let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { mine = []; }
const saveMine = () => { try { localStorage.setItem(STORE, JSON.stringify(mine)); } catch { /* storage unavailable */ } };
const lines = () => DATA.lines.concat(mine.map((m, ix) => ({ ...m, g: 'mine', ix })));
const idOf = l => (l.g === 'mine' ? 'mine:' + l.ix : l.n);
const MA = (l, k) => momentArm(l, st, k, HR);

// ---------- scene ----------
const cv = $('c');
const ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
ren.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(32, 1, 1, 800);
scene.add(cam);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.75));
const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(-20, 30, 40); cam.add(key);

function b64(s, T) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); }
const BONE = new THREE.Color('#E8E0CF');
const GC = [BONE, gcol('cuff'), gcol('delt'), gcol('pec'), gcol('lat'), gcol('arm')];
// Mesh data: int16 positions in 0.01 cm, uint16/uint32 indices, uint8 attachment group per vertex.
function mesh(d, opacity = 1) {
  const p = b64(d.p, Int16Array), idx = b64(d.i, d.big ? Uint32Array : Uint16Array), cg = b64(d.c, Uint8Array);
  const pos = new Float32Array(p.length); for (let i = 0; i < p.length; i++) pos[i] = p[i] / 100;
  const col = new Float32Array(p.length);
  for (let i = 0; i < cg.length; i++) { const c = BONE.clone().lerp(GC[cg[i]], cg[i] ? 0.75 : 0); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
}
// Everything that belongs to the body sits in `body`, which Swimmer view lays prone and rolls.
const body = new THREE.Group(); scene.add(body);
const girdle = mesh(DATA.girdle), thorax = mesh(DATA.thorax, 0.55);
body.add(girdle, thorax);
// Forearm hinges about the elbow axis: foreG pivots at the elbow centre.
const humM = mesh(DATA.hum), foreM = mesh(DATA.fore), foreG = new THREE.Group();
foreG.position.copy(T3(EL.ep)); foreM.position.copy(T3(EL.ep).negate()); foreG.add(foreM);
const arm = new THREE.Group(); arm.add(humM, foreG); body.add(arm);
const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0x222222 })); body.add(ctr);
const tubes = new THREE.Group(); body.add(tubes);
// Swimmer view: roll axis along the trunk's centre line; water surface level with the back.
thorax.geometry.computeBoundingBox();
const tb = thorax.geometry.boundingBox, PIVOT = [(tb.min.x + tb.max.x) / 2, 0, (tb.min.z + tb.max.z) / 2], WATER = PIVOT[2] - tb.min.z;
const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), new THREE.MeshBasicMaterial({ color: 0x3d8fd1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
water.rotation.x = -Math.PI / 2; water.position.set(-10, WATER, 10); water.visible = false; scene.add(water);
const maLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x111111, dashSize: 0.5, gapSize: 0.35, depthTest: false }));
maLine.renderOrder = 5; body.add(maLine);
const footG = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false }));
footG.renderOrder = 6; body.add(footG);

// ---------- orbit camera ----------
const tgt = new THREE.Vector3(-6, -7, 2);
let az = -35 * D, el = 10 * D, dist = 132;
const SWIM_T = new THREE.Vector3(...toSwimmer([0, -6, 0], 0, PIVOT)).setY(WATER - 4);
function place() {
  const narrow = cv.clientWidth / Math.max(1, cv.clientHeight) < 0.9;
  if (swim) tgt.copy(SWIM_T); else tgt.set(narrow ? 3 : -6, -7, 2);
  cam.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
  cam.lookAt(tgt); render();
}
const ptr = new Map(); let down = null, moved = 0, pinch0 = 0, grab = null;
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ } ptr.set(e.pointerId, [e.clientX, e.clientY]); down = [e.clientX, e.clientY]; moved = 0;
  if (ptr.size === 2) { grab = null; const a = [...ptr.values()]; pinch0 = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); }
  else if (!drawMode) {
    const h = hitAt(e, [arm]);
    // Grab the arm: remember the grabbed point in humerus coordinates (it moves with the humerus).
    if (h) grab = { hum: qRot(qInv(rot(st.p, st.e, st.r)), body.worldToLocal(h.point.clone()).toArray()), x0: e.clientX, r0: st.r };
  }
});
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Drag: the grabbed point follows the pointer on a sphere round the GH centre. The humeral axis is
// turned by the same rotation and converted back to plane of elevation and elevation (rotation
// unchanged). Shift-drag turns the arm about its own axis. Slider ranges are the limits.
function dragArm(e) {
  if (e.shiftKey) { st.r = Math.round(clamp(grab.r0 + (e.clientX - grab.x0) * 0.6, -90, 90)); return; }
  const r = cv.getBoundingClientRect();
  ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, cam);
  const o = body.worldToLocal(ray.ray.origin.clone()), d = body.worldToLocal(ray.ray.origin.clone().add(ray.ray.direction)).sub(o).normalize();
  const rad = Math.hypot(...grab.hum), b = o.dot(d), c = o.lengthSq() - rad * rad, disc = b * b - c;
  const P = disc >= 0 ? o.clone().add(d.clone().multiplyScalar(-b - Math.sqrt(disc))) : o.clone().add(d.clone().multiplyScalar(-b)).setLength(rad);
  const q = rot(st.p, st.e, st.r), cur = T3(qRot(q, grab.hum)).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(cur, P.normalize());
  const ax = T3(qRot(q, [0, -1, 0])).applyQuaternion(turn); // new humeral axis (shoulder to elbow)
  const ne = Math.acos(clamp(-ax.y, -1, 1)) / D;
  if (ne > 3) st.p = Math.round(clamp(Math.atan2(ax.z, -ax.x) / D, -30, 130));
  st.e = Math.round(clamp(ne, 0, 170));
}
cv.addEventListener('pointermove', e => {
  if (!ptr.size && !drawMode) cv.style.cursor = hitAt(e, [arm]) ? 'move' : '';
  if (!ptr.has(e.pointerId)) return;
  if (grab && ptr.size === 1) { ptr.set(e.pointerId, [e.clientX, e.clientY]); moved += 7; dragArm(e); markPreset(null); update(); return; }
  const pr = ptr.get(e.pointerId), dx = e.clientX - pr[0], dy = e.clientY - pr[1];
  ptr.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
  if (ptr.size === 2) {
    const a = [...ptr.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
    if (pinch0) { dist = Math.min(220, Math.max(30, dist * pinch0 / d)); pinch0 = d; place(); }
    return;
  }
  az -= dx * 0.008; el = Math.max(-1.3, Math.min(1.3, el + dy * 0.008)); place();
});
cv.addEventListener('pointerup', e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; if (moved < 6 && down && ptr.size === 0) pick(e); if (!ptr.size) grab = null; });
cv.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); grab = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); dist = Math.min(220, Math.max(30, dist * Math.exp(e.deltaY * 0.001))); place(); }, { passive: false });

// ---------- picking and drawing your own lines ----------
const ray = new THREE.Raycaster();
function hitAt(e, objs) {
  const r = cv.getBoundingClientRect();
  ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, cam);
  return ray.intersectObjects(objs, true)[0];
}
function pick(e) {
  if (drawMode) {
    if (!pending) {
      const h = hitAt(e, [girdle].concat(thorax.visible ? [thorax] : []));
      if (!h) { hint('Start on the scapula, clavicle or ribcage'); return; }
      pending = body.worldToLocal(h.point.clone()); hint('Now tap the humerus or forearm'); update(); return;
    }
    const h = hitAt(e, [arm]);
    if (!h) { hint('End on the humerus or forearm'); return; }
    // store the insertion in humerus-local coordinates so it moves with the arm; on the forearm,
    // undo the current elbow angle so it also moves with the elbow
    let local = qRot(qInv(rot(st.p, st.e, st.r)), body.worldToLocal(h.point.clone()).toArray());
    const onFore = h.object === foreM;
    if (onFore) local = EL.ep.map((c, k) => c + qRot(qInv(elbowQ(EL, st.k)), local.map((x, j) => x - EL.ep[j]))[k]);
    mine.push({ n: 'Line ' + (mine.length + 1), o: pending.toArray().map(x => +x.toFixed(2)), i: local.map(x => +x.toFixed(2)), ...(onFore ? { el: { ep: EL.ep, ax: EL.ax, k0: EL.k0 } } : {}) });
    saveMine(); pending = null; sel = 'mine:' + (mine.length - 1); setDraw(false); update(); return;
  }
  const h = hitAt(e, tubes.children);
  if (h && h.object.userData.id) { sel = h.object.userData.id; update(); }
}
const hint = t => { $('hint').textContent = t; };
function setDraw(on) {
  drawMode = on; pending = null;
  $('drawBtn').setAttribute('aria-pressed', on); $('drawBtn').textContent = on ? 'Cancel drawing' : 'Draw a line';
  cv.classList.toggle('draw', on);
  hint(on ? 'Tap a start point on the scapula, clavicle or ribcage' : 'Drag the arm to move it (Shift to rotate it); drag elsewhere to orbit; scroll to zoom');
  if (!on) update();
}

// ---------- text ----------
const fmt = x => (x > 0.05 ? '+' : '') + (Math.abs(x) < 0.05 ? '0.0' : x.toFixed(1));
const cls = x => (Math.abs(x) < 0.3 ? 'z' : x > 0 ? 'p' : 'n');
function describe(l) {
  const m = { e: MA(l, 'e'), p: st.e >= 15 ? MA(l, 'p') : null, r: MA(l, 'r') }, out = [];
  if (Math.abs(m.e) >= 0.3) out.push(`${m.e > 0 ? 'elevates' : 'pulls down'} (${Math.abs(m.e).toFixed(1)} cm)`);
  if (m.p !== null && Math.abs(m.p) >= 0.3) out.push(`${m.p > 0 ? 'horizontally adducts' : 'horizontally abducts'} (${Math.abs(m.p).toFixed(1)} cm)`);
  if (Math.abs(m.r) >= 0.3) out.push(`${m.r > 0 ? 'externally' : 'internally'} rotates (${Math.abs(m.r).toFixed(1)} cm)`);
  if (l.el) { const mk = MA(l, 'k'); if (Math.abs(mk) >= 0.3) out.push(`${mk > 0 ? 'flexes' : 'extends'} the elbow (${Math.abs(mk).toFixed(1)} cm)`); }
  if (!out.length) return 'In this position it has almost no leverage on the joint.';
  return 'In this position it ' + (out.length > 1 ? out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1] : out[0]) + '.';
}
function planeName() {
  const { p } = st;
  return p <= -10 ? 'extension plane' : p < 15 ? 'abduction (frontal plane)' : p < 50 ? 'scaption' : p <= 105 ? 'flexion (sagittal plane)' : 'cross-body';
}

// ---------- update ----------
function update() {
  ['p', 'e', 'r', 'k', 'roll'].forEach(k => { $(k).value = st[k]; $(k + 'o').textContent = st[k] + '°'; });
  $('poseBig').textContent = st.e + '°';
  const q = rot(st.p, st.e, st.r);
  let sub = (st.e < 5 ? 'Arm by the side' : `Elevation in ${planeName()}${Math.abs(st.r) >= 5 ? `, ${Math.abs(st.r)}° ${st.r > 0 ? 'external' : 'internal'} rotation` : ''}`) + `; elbow ${st.k}°`;
  arm.quaternion.copy(toQ(q));
  foreG.quaternion.copy(toQ(elbowQ(EL, st.k)));
  const sq = swim ? swimQ(st.roll) : [0, 0, 0, 1];
  body.quaternion.copy(toQ(sq)); body.position.copy(swim ? T3(qRot(sq, PIVOT.map(x => -x))) : new THREE.Vector3());
  water.visible = swim;
  if (swim) { // where the elbow and wrist are relative to the water and the shoulder
    const W = P => toSwimmer(qRot(q, P), st.roll, PIVOT), gh = toSwimmer([0, 0, 0], st.roll, PIVOT);
    const wr = EL.ep.map((c, j) => c + qRot(elbowQ(EL, st.k), DATA.wrist.map((x, i) => x - EL.ep[i]))[j]);
    const el = W(EL.ep), wi = W(wr), h = y => { const d = Math.round(y - WATER); return d === 0 ? 'at the surface' : `${Math.abs(d)} cm ${d > 0 ? 'above' : 'below'} the water`; };
    const ah = x => { const d = Math.round(x - gh[0]); return d === 0 ? 'level with the shoulder' : `${Math.abs(d)} cm ${d > 0 ? 'ahead of' : 'behind'} the shoulder`; };
    sub += ` · ${st.roll}° body roll. Elbow ${h(el[1])}; wrist ${h(wi[1])}, ${ah(wi[0])}`;
  }
  $('poseSub').textContent = sub;

  tubes.children.forEach(t => t.geometry && t.geometry.dispose()); tubes.clear();
  const all = lines();
  if (sel && !all.some(l => idOf(l) === sel)) sel = null;
  let selPath = null, selL = null;
  all.forEach(l => {
    if (!shown[l.g]) return;
    const id = idOf(l), P = path(l, q, HR, st.k), on = sel === id, pts = P.pts.map(T3);
    const cp = new THREE.CurvePath();
    for (let k = 1; k < pts.length; k++) cp.add(new THREE.LineCurve3(pts[k - 1], pts[k]));
    const g = new THREE.TubeGeometry(cp, Math.max(8, pts.length * 3), on ? 0.32 : 0.2, 8, false);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: gcol(l.g), roughness: 0.5, transparent: !!sel && !on, opacity: sel && !on ? 0.28 : 1 }));
    m.userData.id = id; tubes.add(m);
    if (on) { selPath = pts; selL = l; }
  });
  if (pending) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshBasicMaterial({ color: gcol('mine') })); m.position.copy(pending); tubes.add(m); }

  // moment arm visual: perpendicular from GH centre to the segment that pulls on the humerus
  if (selPath) {
    const n = selPath.length, A = selPath[n - 2], B = selPath[n - 1], d = B.clone().sub(A).normalize();
    const foot = A.clone().add(d.clone().multiplyScalar(-A.dot(d)));
    maLine.geometry.dispose(); maLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), foot]);
    maLine.computeLineDistances(); maLine.visible = true; footG.position.copy(foot); footG.visible = true;
    maLine.userData = { foot, val: foot.length() };
  } else { maLine.visible = false; footG.visible = false; maLine.userData = {}; }

  const det = $('detail');
  if (selL) { det.style.borderColor = css('--' + selL.g); det.innerHTML = `<h2>${selL.n}</h2><p>${describe(selL)}</p>`; }
  else { det.style.borderColor = ''; det.innerHTML = '<h2>Pick a muscle</h2><p>Tap a row or a line to see its moment arm drawn from the joint centre.</p>'; }

  const z = { p: 0, e: 0, r: 0 };
  $('tb').innerHTML = all.filter(l => shown[l.g]).map(l => {
    const id = idOf(l), l0 = length(l, z, HR), dl = (length(l, st, HR) - l0) / l0 * 100;
    const me = MA(l, 'e'), mp = st.e >= 15 ? MA(l, 'p') : null, mr = MA(l, 'r'), mk = l.el ? MA(l, 'k') : null;
    const del = l.g === 'mine' ? ` <button class="x" data-del="${l.ix}" aria-label="Delete ${l.n}">×</button>` : '';
    return `<tr data-id="${id}" class="${sel === id ? 'sel' : ''}"><td><span class="sw" style="background:var(--${l.g});margin-right:7px"></span>${l.n}${del}</td><td>${dl > 0.5 ? '+' : ''}${Math.round(dl)}%</td><td class="${cls(me)}">${fmt(me)}</td><td class="${mp === null ? 'z' : cls(mp)}">${mp === null ? '–' : fmt(mp)}</td><td class="${cls(mr)}">${fmt(mr)}</td><td class="${mk === null ? 'z' : cls(mk)}">${mk === null ? '–' : fmt(mk)}</td></tr>`;
  }).join('');
  render();
}

function render() {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.floor(w * ren.getPixelRatio()) || cv.height !== Math.floor(h * ren.getPixelRatio())) {
    ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  maLine.material.color.set(dark ? 0xffffff : 0x111111); footG.material.color.set(dark ? 0xffffff : 0x111111); ctr.material.color.set(dark ? 0xffffff : 0x222222);
  ren.render(scene, cam);
  const lab = $('malabel');
  if (maLine.visible && maLine.userData.foot) {
    const p = body.localToWorld(maLine.userData.foot.clone().multiplyScalar(0.5)).project(cam);
    lab.hidden = false; lab.style.left = ((p.x + 1) / 2 * w) + 'px'; lab.style.top = ((1 - p.y) / 2 * h) + 'px';
    lab.textContent = maLine.userData.val.toFixed(1) + ' cm';
  } else lab.hidden = true;
}

// ---------- controls ----------
$('tb').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { mine.splice(+del.dataset.del, 1); mine.forEach((m, k) => { m.n = 'Line ' + (k + 1); }); saveMine(); sel = null; update(); return; }
  const tr = e.target.closest('tr');
  if (tr) { sel = sel === tr.dataset.id ? null : tr.dataset.id; update(); }
});
['p', 'e', 'r', 'k', 'roll'].forEach(k => $(k).addEventListener('input', e => { st[k] = +e.target.value; markPreset(null); update(); }));
const PRE = [['Arm by side', { p: 0, e: 0, r: 0, k: 90 }], ['Abduction 90°', { p: 0, e: 90, r: 0, k: 90 }], ['Flexion 120°', { p: 90, e: 120, r: 0, k: 90 }], ['Hand behind back', { p: -20, e: 25, r: -80, k: 90 }], ['Serve cocking', { p: 0, e: 90, r: 85, k: 90 }], ['Freestyle catch', { p: 80, e: 150, r: -15, k: 90 }],
  // Freestyle recovery, sprinter with a high-elbow recovery and 40° body roll (these presets open
  // Swimmer view). Angles fitted so the hand and elbow sit where each phase is described, with
  // internal rotation only. The scapula is fixed, so the shoulder angles stand for the whole arm
  // relative to the trunk and overstate glenohumeral demand (see CLAUDE.md Known issue 2).
  ['Recovery A: exit', { p: -30, e: 35, r: -70, k: 70, roll: 40, swim: true }],   // wrist at the surface by the hip; elbow 14 cm up, leading
  ['Recovery B: mid', { p: -30, e: 105, r: -10, k: 120, roll: 40, swim: true }],  // elbow at its highest (~24 cm up); wrist passing the shoulder
  ['Recovery C: entry', { p: 5, e: 165, r: -20, k: 20, roll: 40, swim: true }]];  // wrist at the surface ~50 cm ahead of the shoulder
$('presets').innerHTML = PRE.map((x, i) => `<button data-i="${i}" aria-pressed="false">${x[0]}</button>`).join('');
function markPreset(i) { document.querySelectorAll('#presets button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i)); }
$('presets').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const { swim: sw, ...pose } = PRE[+b.dataset.i][1];
  Object.assign(st, pose); if (sw && !swim) setSwim(true); markPreset(+b.dataset.i); update();
});
function setSwim(on) {
  swim = on; $('swimBtn').setAttribute('aria-pressed', on); $('rollRow').hidden = !on;
  if (on) { az = 55 * D; el = 22 * D; dist = 150; } else { az = -35 * D; el = 10 * D; dist = 132; }
  place(); update();
}
$('swimBtn').onclick = () => setSwim(!swim);
$('chips').innerHTML = GROUPS.map(g => `<button class="chip" data-g="${g[0]}" aria-pressed="true"><span class="sw" style="background:var(--${g[0]})"></span>${g[1]}</button>`).join('');
$('chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; shown[b.dataset.g] = !shown[b.dataset.g]; b.setAttribute('aria-pressed', shown[b.dataset.g]); update(); });
$('drawBtn').onclick = () => setDraw(!drawMode);
$('thoraxBtn').onclick = () => {
  thorax.visible = !thorax.visible;
  $('thoraxBtn').setAttribute('aria-pressed', thorax.visible); $('thoraxBtn').textContent = thorax.visible ? 'Ribcage shown' : 'Ribcage hidden'; render();
};
addEventListener('resize', place);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
markPreset(0); place(); update();
