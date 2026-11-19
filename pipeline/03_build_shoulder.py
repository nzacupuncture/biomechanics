"""Turn extracted Z-Anatomy meshes into app/data/shoulder.json.

  .venv/bin/python 03_build_shoulder.py

Steps:
 1. Convert to the app frame: cm, origin later moved to the GH centre,
    x = medial(+)/lateral(-) for the right side, y = up, z = anterior.
 2. Fit a sphere to the humeral head (GH centre and radius) and find the humeral long axis
    (head centre to epicondyle midpoint).
 3. Re-pose the arm: rotate the humerus so its axis is vertical (Z-Anatomy hangs it ~10°
    abducted), then flex the forearm about the epicondylar axis until it points forwards (~90°).
 4. Find each muscle line's origin, insertion and helper points (see LINES below).
 5. Colour bone vertices that sit under an attachment patch, quantise meshes and write JSON.

Expected sanity output for the shoulder: head radius ~2.3 cm, humerus length ~28 cm.
"""
import json, base64, pickle
import numpy as np
from scipy.spatial import cKDTree as KD
from scipy.spatial.transform import Rotation as R

FULL = pickle.load(open(".cache/shoulder_full.pkl", "rb"))
WEB = pickle.load(open(".cache/shoulder_web.pkl", "rb"))
OUT = "../app/data/shoulder.json"

cv = lambda V: np.c_[V[:, 0], V[:, 2], -V[:, 1]] * 100  # Blender metres -> app frame cm
F = {k: cv(v) for k, (v, t) in FULL.items()}
B = {k: (cv(v), t) for k, (v, t) in WEB.items()}

# ---- 2. GH centre and humeral axis --------------------------------------------
H = F["Humerus.r"]
reg = H[H[:, 1] > H[:, 1].max() - 5]

def fit_sphere(P):
    A = np.c_[2 * P, np.ones(len(P))]; b = (P ** 2).sum(1)
    s = np.linalg.lstsq(A, b, rcond=None)[0]; c = s[:3]
    return c, np.sqrt(s[3] + c @ c)

c, r = fit_sphere(reg[reg[:, 0] > np.median(reg[:, 0])])   # medial half = articular surface
for _ in range(6):                                          # trim tubercles, refit
    keep = np.abs(np.linalg.norm(reg - c, axis=1) - r) < 0.25
    c, r = fit_sphere(reg[keep])
low = H[H[:, 1] < H[:, 1].min() + 4]
me_w, le_w = low[low[:, 0].argmax()], low[low[:, 0].argmin()]  # medial / lateral epicondyle
ax = c - (me_w + le_w) / 2; hum_len = np.linalg.norm(ax); ax /= hum_len
print(f"GH centre {c.round(2)}  head radius {r:.2f} cm  humerus length {hum_len:.1f} cm")

# ---- 3. re-pose ---------------------------------------------------------------
vv = np.cross(ax, [0, 1, 0]); Q0 = R.from_rotvec(vv / np.linalg.norm(vv) * np.arcsin(np.linalg.norm(vv)))
fix = lambda P: P - c                     # fixed (thorax/scapula/clavicle) points
q0 = lambda P: Q0.apply(P - c)            # humerus-attached points
me, le = q0(me_w[None])[0], q0(le_w[None])[0]
ep, eax = (me + le) / 2, (le - me) / np.linalg.norm(le - me)
fore = ["Radius.r", "Ulna.r"]
dist = np.vstack([q0(B[k][0]) for k in fore]); dc = dist[dist[:, 1] < dist[:, 1].min() + 3].mean(0)
best = max(np.arange(-180, 180, 1.0), key=lambda a: (lambda d: d[2] / np.linalg.norm(d))(R.from_rotvec(eax * np.radians(a)).apply(dc - ep)))
FL = R.from_rotvec(eax * np.radians(best))
flex = lambda P: FL.apply(q0(P) - ep) + ep  # forearm-attached points
print(f"elbow flexed by {best:.0f}° about the epicondylar axis")
D_all = flex(np.vstack([B[k][0] for k in fore]))  # posed forearm vertices
far = np.linalg.norm(D_all - ep, axis=1); wrist = D_all[far > far.max() - 3].mean(0)
wd = (wrist - ep) / np.linalg.norm(wrist - ep)
elbow_k0 = np.degrees(np.arccos(-wd[1]))  # flexion of the posed forearm (0 = hanging straight)

# ---- 4. attachment points -----------------------------------------------------
hum, scap = KD(F["Humerus.r"]), KD(F["Scapula.r"])
near = lambda P, tree, d: P[tree.query(P)[0] < d]
m = lambda k: F[k].mean(0)
def split2(P):                            # upper and lower halves of a patch
    o = np.argsort(P[:, 1]); lo, hi = np.array_split(P[o], 2); return hi.mean(0), lo.mean(0)
lines = []
def add(n, g, O, I, ins="hum", **kw):
    lines.append(dict(n=n, g=g, o=O, i=I, ins=ins, **kw))

# Rotator cuff: patch centroids; wrap over the head, locked to an anatomical side
add("Supraspinatus", "cuff", m("Supraspinatus muscle.or"), m("Supraspinatus muscle.er"), wrap="ins", side=[0, 1, 0])
u, l = split2(F["Infraspinatus muscle.or"])
add("Infraspinatus (upper)", "cuff", u, m("Infraspinatus muscle.er"), wrap="ins", side=[0, 0, -1])
add("Infraspinatus (lower)", "cuff", l, m("Infraspinatus muscle.er"), wrap="ins", side=[0, 0, -1])
add("Teres minor", "cuff", m("Teres minor muscle.or"), m("Teres minor muscle.er"), wrap="ins", side=[0, -0.3, -1])
u, l = split2(F["Subscapularis muscle.or"])
add("Subscapularis (upper)", "cuff", u, m("Subscapularis muscle.er"), wrap="ins", side=[0, 0, 1])
add("Subscapularis (lower)", "cuff", l, m("Subscapularis muscle.er"), wrap="ins", side=[0, 0, 1])
# Deltoid: anterior/posterior drape over a tubercle obstacle, middle wraps locked laterally
dI = m("Deltoid muscle.er")
# ridge: direction (humerus-local) of the line through the tubercle point that the fibre drapes over;
# chosen by a search over directions for smooth moment arms that keep the anatomy tests and the
# published abduction profile (Known issue 1, Nov 2026)
add("Anterior deltoid", "delt", m("Clavicular part of deltoid muscle.or"), dI, wrap="tub", tub=[-2.6, -0.6, 2.6], ridge=[0.49, 0.21, 0.85])
add("Middle deltoid", "delt", m("Acromial part of deltoid muscle.or"), dI, wrap="tub", tub=[-4.0, 0, 0], ridge=[0, 1, 0])  # ridge along the shaft over the greater tubercle
add("Posterior deltoid", "delt", m("Scapular spinal part of deltoid muscle.or"), dI, wrap="tub", tub=[-2.6, -0.6, -2.6], ridge=[-0.86, -0.1, 0.5])
# Pec major. NB the '.er' patch of the sternocostal head is its ORIGIN and only covers the lower
# sternum, so the sternocostal origin is taken from where the muscle mesh touches sternum/cartilages.
pI = m("Pectoralis major muscle.er")
add("Pec major (clavicular)", "pec", m("Pectoralis major muscle.or"), pI)
ST = np.vstack([F[k] for k in F if "sternum" in k.lower() or k.startswith("Costal") or k == "Xiphoid process"])
u, l = split2(near(F["Sternocostal head of pectoralis major muscle.r"], KD(ST), 0.5))
add("Pec major (upper sternal)", "pec", u, pI)
add("Pec major (lower sternal)", "pec", l, pI)
# Teres major and lat: insertion where the muscle mesh touches the humerus (below the head)
add("Teres major", "lat", m("Teres major muscle.or"), near(F["Teres major muscle.r"], hum, 0.4).mean(0))
lat = F["Latissimus dorsi muscle.r"]; latI = near(lat, hum, 0.4); latI = latI[latI[:, 1] < c[1] - 2].mean(0)
VT = np.vstack([F[f"Vertebra T{i}"] for i in range(7, 13)])
add("Latissimus (thoracic)", "lat", near(lat, KD(VT), 0.6).mean(0), latI)
add("Latissimus (iliac)", "lat", m("Latissimus dorsi muscle.or"), latI)
# Arm muscles
cb = near(F["Coracobrachialis muscle.r"], hum, 0.4); cb = cb[cb[:, 1] < c[1] - 6]
add("Coracobrachialis", "arm", m("Coracobrachialis muscle.or"), cb.mean(0))
lb = near(F["Long head of biceps brachii.r"], hum, 0.35); groove = lb[(lb[:, 1] < c[1] - 1) & (lb[:, 1] > c[1] - 7)].mean(0)
add("Biceps (long head)", "arm", m("Long head of biceps brachii.or"), m("Biceps brachii muscle.er"), ins="fore", via=groove)
add("Biceps (short head)", "arm", near(F["Short head of biceps brachii.r"], scap, 0.4).mean(0), m("Biceps brachii muscle.er"), ins="fore")
add("Triceps (long head)", "arm", m("Long head of triceps brachii.or"), m("Triceps brachii muscle.er"), ins="fore", elwrap=1)

# ---- 4b. scapular muscles: thorax/neck to scapula or clavicle -------------------
# Origins and insertions by bone contact (decision 5): the mean of the muscle-mesh vertices that
# touch the bone. Serratus anterior is split into an upper (superior angle) and lower (inferior
# angle) line by height.
CERV = [k for k in ["Atlas (C1)", "Axis (C2)"] + [f"Vertebra C{i}" for i in range(3, 8)] if k in F]
VERT = np.vstack([F[k] for k in CERV + [f"Vertebra T{i}" for i in range(1, 13)]])
NECK = np.vstack([F[k] for k in CERV + ["Occipital bone", "Nuchal ligament"] if k in F])
RIBS = np.vstack([F[k] for k in F if k.endswith(" rib.r")])
SCAP, CLAV = F["Scapula.r"], F["Clavicle.r"]
def touch(muscle, bone, d=0.4):
    X = F[muscle + ".r"]; t = KD(bone)
    while True:
        P = X[t.query(X)[0] < d]
        if len(P) >= 5 or d > 2: return P
        d *= 1.5
slines = []
def adds(n, O, I, ib, **kw): slines.append(dict(n=n, o=O, i=I, ib=ib, **kw))
# Trapezius: Z-Anatomy's part names are swapped relative to their positions ("Descending part" runs
# from about T8-T10, "Ascending part" from the neck), so the parts are named by where they attach.
# The low part's mesh stops a few cm short of the spinous processes: its origin is its midline edge.
LT = F["Descending part of trapezius muscle.r"]
adds("Trapezius (upper)", touch("Ascending part of trapezius muscle", VERT).mean(0), touch("Ascending part of trapezius muscle", SCAP).mean(0), "scap")
adds("Trapezius (middle)", touch("Transverse part of trapezius muscle", VERT).mean(0), touch("Transverse part of trapezius muscle", SCAP).mean(0), "scap")
adds("Trapezius (lower)", LT[LT[:, 0] >= np.quantile(LT[:, 0], 0.95)].mean(0), touch("Descending part of trapezius muscle", SCAP).mean(0), "scap")
adds("Rhomboid minor", touch("Rhomboid minor muscle", VERT).mean(0), touch("Rhomboid minor muscle", SCAP).mean(0), "scap")
adds("Rhomboid major", touch("Rhomboid major muscle", VERT).mean(0), touch("Rhomboid major muscle", SCAP).mean(0), "scap")
adds("Levator scapulae", touch("Levator scapulae", VERT).mean(0), touch("Levator scapulae", SCAP).mean(0), "scap")
sa_o, sa_i = touch("Serratus anterior muscle", RIBS), touch("Serratus anterior muscle", SCAP)
q = lambda P, lo, hi: P[(P[:, 1] >= np.quantile(P[:, 1], lo)) & (P[:, 1] <= np.quantile(P[:, 1], hi))].mean(0)
adds("Serratus anterior (upper)", q(sa_o, 0.75, 1), q(sa_i, 0.75, 1), "scap", wrap="thorax")  # wraps round the chest wall
adds("Serratus anterior (lower)", q(sa_o, 0, 0.5), q(sa_i, 0, 0.25), "scap", wrap="thorax")
adds("Pectoralis minor", touch("Pectoralis minor muscle", RIBS).mean(0), touch("Pectoralis minor muscle", SCAP).mean(0), "scap")

# ---- 4c. girdle landmarks and scapular axes ------------------------------------
# ISB landmarks from the scapula mesh (Z-Anatomy's landmark labels are stored relative to parents
# that are not extracted, so their positions can't be used). x = medial(+), y = up, z = anterior.
sx, sy, sz = SCAP[:, 0], SCAP[:, 1], SCAP[:, 2]
AI = SCAP[sy.argmin()]                                                     # inferior angle: lowest point
med = SCAP[sx >= np.quantile(sx, 0.93)]
SA = med[med[:, 1].argmax()]                                               # superior angle: top of the medial border
up = med[med[:, 1] >= med[:, 1].min() + 0.55 * np.ptp(med[:, 1])]       # upper 45% of the medial border
TS = up[up[:, 2].argmin()]                                                 # root of the spine: most posterior point there
top = SCAP[sy >= np.quantile(sy, 0.85)]
AA = top[(-top[:, 0] - top[:, 2]).argmax()]                                # acromial angle: posterolateral corner
CP = SCAP[sz.argmax()]                                                     # coracoid tip: most anterior point
cx = CLAV[:, 0]  # x = medial(+) for the right side after conversion
SC = CLAV[cx >= np.quantile(cx, 0.97)].mean(0); AC = CLAV[cx <= np.quantile(cx, 0.03)].mean(0)
Zs = AA - TS; Zs /= np.linalg.norm(Zs)                                                     # ISB: TS to AA, lateral
Xs = np.cross(AA - AI, TS - AI); Xs -= Zs * (Xs @ Zs); Xs /= np.linalg.norm(Xs); Xs *= np.sign(Xs[2])  # plane normal, anterior
Ys = np.cross(Zs, Xs)                                                                         # up the blade
print(f"scapular axes X {Xs.round(2)} Y {Ys.round(2)} Z {Zs.round(2)}; AI {fix(AI[None])[0].round(1)} TS {fix(TS[None])[0].round(1)} AA {fix(AA[None])[0].round(1)} SA {fix(SA[None])[0].round(1)} CP {fix(CP[None])[0].round(1)} SC {fix(SC[None])[0].round(1)} AC {fix(AC[None])[0].round(1)}")

# origin bone of each humeral muscle line: whichever of scapula / clavicle / thorax it sits on
THX = np.vstack([F[k] for k in F if k.startswith(("Vertebra", "Costal")) or k.endswith(" rib.r") or "sternum" in k.lower()
                 or k in ("Xiphoid process",) or k.startswith(("Ilium", "Hip bone"))])
bone_trees = dict(scap=KD(SCAP), clav=KD(CLAV), thorax=KD(THX))
def obone(O): return min(bone_trees, key=lambda b: bone_trees[b].query(O)[0])

r2 = lambda a: np.round(a, 2).tolist()
L = []
for x in lines:
    d = dict(n=x["n"], g=x["g"], o=r2(fix(x["o"][None])[0]), i=r2((flex if x["ins"] == "fore" else q0)(x["i"][None])[0]),
             via=None if "via" not in x else r2(q0(x["via"][None])[0]), wrap=x.get("wrap"))
    d["ob"] = obone(x["o"]) if x["n"] != "Latissimus (iliac)" else "thorax"  # iliac crest is not in the extracted bones
    if "side" in x: d["side"] = x["side"]
    if "tub" in x: d["tub"] = x["tub"]
    if "ridge" in x: d["ridge"] = x["ridge"]
    if x["ins"] == "fore":  # elbow: rotate about the epicondylar axis by (elbow angle - k0)
        d["el"] = dict(ep=r2(ep), ax=np.round(eax, 4).tolist(), k0=round(float(elbow_k0), 1))
        if x.get("elwrap"): d["el"]["wrap"] = x["elwrap"]  # triceps: wraps posteriorly at the elbow
    L.append(d)

for x in slines:
    L.append(dict(n=x["n"], g="scap", o=r2(fix(x["o"][None])[0]), i=r2(fix(x["i"][None])[0]), ib=x["ib"], via=None, wrap=x.get("wrap")))
# thorax as a vertical cylinder for serratus wrapping: centre line on the midline (thoracic
# vertebrae), halfway between the front and back of ribs 4-9
R49 = np.vstack([F[f"{o} rib.r"] for o in "Fourth Fifth Sixth Seventh Eighth Ninth".split()])
TV = np.vstack([F[f"Vertebra T{i}"] for i in range(1, 13)])
TC = np.array([np.median(TV[:, 0]), c[1], (R49[:, 2].min() + R49[:, 2].max()) / 2])
TA = [float(TC[0] - R49[:, 0].min()), float((R49[:, 2].max() - R49[:, 2].min()) / 2)]  # half-width (lateral), half-depth
# Scapulothoracic contact check (app refuses girdle positions that sink the scapula into the ribs):
# a sample of the right ribs' surface around the scapula, and the scapula's points nearest the ribs.
rng = np.random.default_rng(1)
RIBS_R = np.vstack([F[f"{o} rib.r"] for o in "First Second Third Fourth Fifth Sixth Seventh Eighth Ninth Tenth".split()])
ys, ye = SCAP[:, 1].min() - 6, SCAP[:, 1].max() + 4
band = RIBS_R[(RIBS_R[:, 1] > ys) & (RIBS_R[:, 1] < ye) & (RIBS_R[:, 2] < TC[2] + 4)]
rib_pts = band[rng.choice(len(band), min(900, len(band)), replace=False)]
dS = KD(RIBS_R).query(SCAP)[0]
near = SCAP[dS < np.quantile(dS, 0.12)]
scap_pts = np.vstack([near[rng.choice(len(near), min(80, len(near)), replace=False)], AI[None], TS[None], SA[None]])
r1 = lambda a: np.round(a, 1).tolist()
# Clavicle vs the upper ribcage: points spread along the clavicle and a sample of ribs 1-3, their
# cartilages and the manubrium; the app keeps the clavicle a few mm clear of them (it can slide over
# the first rib in retraction, but not pass through it).
UPPER = np.vstack([F[k] for k in ["First rib.r", "Second rib.r", "Third rib.r", "Costal cartilage of first rib.r",
                                  "Costal cartilage of second rib.r", "Costal cartilage of third rib.r", "Manubrium of sternum"] if k in F])
away = np.linalg.norm(CLAV - SC, axis=1) > 3                          # not the SC joint itself, where they touch
cl_pts = CLAV[away][rng.choice(int(away.sum()), min(120, int(away.sum())), replace=False)]
up_pts = UPPER[rng.choice(len(UPPER), min(1500, len(UPPER)), replace=False)]
print(f"clavicle to upper ribs at rest: min {KD(up_pts).query(cl_pts)[0].min():.2f} cm")
girdle_extra = dict(ribs=r1(fix(rib_pts)), contact=r1(fix(scap_pts)), clavPts=r1(fix(cl_pts)), upperRibs=r1(fix(up_pts)))
girdle = dict(TC=r2(fix(TC[None])[0]), TA=r2(np.array(TA)), SC=r2(fix(SC[None])[0]), AC=r2(fix(AC[None])[0]), AI=r2(fix(AI[None])[0]), SA=r2(fix(SA[None])[0]), TS=r2(fix(TS[None])[0]),
              AA=r2(fix(AA[None])[0]), CP=r2(fix(CP[None])[0]), X=np.round(Xs, 4).tolist(), Y=np.round(Ys, 4).tolist(), Z=np.round(Zs, 4).tolist())

# ---- 5. footprints, quantise, write ---------------------------------------------
GR = {"cuff": 1, "delt": 2, "pec": 3, "lat": 4, "arm": 5, "scap": 6}
patches = []
for n, g in [("Supraspinatus muscle", "cuff"), ("Infraspinatus muscle", "cuff"), ("Teres minor muscle", "cuff"), ("Subscapularis muscle", "cuff"),
             ("Teres major muscle", "lat"), ("Latissimus dorsi muscle", "lat"), ("Scapular spinal part of deltoid muscle", "delt"),
             ("Acromial part of deltoid muscle", "delt"), ("Clavicular part of deltoid muscle", "delt"), ("Deltoid muscle", "delt"),
             ("Pectoralis major muscle", "pec"), ("Coracobrachialis muscle", "arm"), ("Long head of biceps brachii", "arm"),
             ("Long head of triceps brachii", "arm"), ("Descending part of trapezius muscle", "scap"), ("Transverse part of trapezius muscle", "scap"),
             ("Ascending part of trapezius muscle", "scap"), ("Levator scapulae", "scap"), ("Serratus anterior muscle", "scap"),
             ("Pectoralis minor muscle", "scap")]:
    for s in (".or", ".er"):
        if n + s in F: patches.append((F[n + s], g))
contact_bones = ["Humerus.r", "Scapula.r", "Clavicle.r", "Body of sternum", "Manubrium of sternum", "Atlas (C1)", "Axis (C2)", "Occipital bone"] + [k for k in F if k.startswith(("Costal", "Vertebra")) or k.endswith(" rib.r")]
trees = [KD(F[b]) for b in contact_bones if b in F]
for n, g in [("Teres major muscle.r", "lat"), ("Latissimus dorsi muscle.r", "lat"), ("Coracobrachialis muscle.r", "arm"),
             ("Short head of biceps brachii.r", "arm"), ("Sternocostal head of pectoralis major muscle.r", "pec"),
             ("Clavicular head of pectoralis major muscle.r", "pec"), ("Rhomboid major muscle.r", "scap"), ("Rhomboid minor muscle.r", "scap")]:
    X = F[n]; patches.append((np.vstack([X[t.query(X)[0] < 0.35] for t in trees]), g))
PT = np.vstack([p for p, _ in patches]); PG = np.concatenate([[GR[g]] * len(p) for p, g in patches]); pt = KD(PT)

def pack(keys, tf, colour=True):
    Vw = [B[k][0] for k in keys]; off = np.cumsum([0] + [len(x) for x in Vw])[:-1]
    V = np.vstack([tf(x) for x in Vw]); T = np.vstack([B[k][1] + o for k, o in zip(keys, off)])
    d, ix = pt.query(np.vstack(Vw)); col = np.where(d < 0.6, PG[ix], 0).astype(np.uint8) if colour else np.zeros(len(V), np.uint8)
    big = len(V) >= 65536
    return dict(p=base64.b64encode(np.round(V * 100).astype(np.int16).tobytes()).decode(),
                i=base64.b64encode(T.astype(np.uint32 if big else np.uint16).tobytes()).decode(),
                c=base64.b64encode(col.tobytes()).decode(), big=big)

static = [k for k in B if k not in ("Humerus.r", "Radius.r", "Ulna.r", "Scapula.r", "Clavicle.r")]
# whole-body reference skeleton (02 writes it separately): right hand moves with the forearm
CTX = {k: (cv(v), t) for k, (v, t) in pickle.load(open(".cache/shoulder_context.pkl", "rb")).items()}
B.update(CTX)
HAND = ("Scaphoid", "Lunate", "Triquetr", "Pisiform", "Trapezium", "Trapezoid", "Capitate", "Hamate", "metacarpal", "of hand")
hand_r = [k for k in CTX if k.endswith(".r") and any(h in k for h in HAND)]
body_ref = [k for k in CTX if k not in hand_r]
girdle.update(girdle_extra)
out = dict(scap=pack(["Scapula.r"], fix), clav=pack(["Clavicle.r"], fix), thorax=pack(static, fix), hum=pack(["Humerus.r"], q0),
           skel=pack(body_ref, fix, colour=False), hand=pack(hand_r, flex, colour=False),
           fore=pack(fore, flex, colour=False), lines=L, R=round(float(r), 2), girdle=girdle,
           ep=r2(ep), me=r2(me), le=r2(le), wrist=r2(wrist))
json.dump(out, open(OUT, "w"))
print(f"wrote {OUT}: {len(L)} muscle lines")
