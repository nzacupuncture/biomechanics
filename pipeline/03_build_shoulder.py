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
add("Anterior deltoid", "delt", m("Clavicular part of deltoid muscle.or"), dI, wrap="tub", tub=[-2.6, -0.6, 2.6])
add("Middle deltoid", "delt", m("Acromial part of deltoid muscle.or"), dI, wrap="delt", side=[-1, 0, 0])
add("Posterior deltoid", "delt", m("Scapular spinal part of deltoid muscle.or"), dI, wrap="tub", tub=[-2.6, -0.6, -2.6])
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
add("Triceps (long head)", "arm", m("Long head of triceps brachii.or"), m("Triceps brachii muscle.er"), ins="fore")

r2 = lambda a: np.round(a, 2).tolist()
L = []
for x in lines:
    d = dict(n=x["n"], g=x["g"], o=r2(fix(x["o"][None])[0]), i=r2((flex if x["ins"] == "fore" else q0)(x["i"][None])[0]),
             via=None if "via" not in x else r2(q0(x["via"][None])[0]), wrap=x.get("wrap"))
    if "side" in x: d["side"] = x["side"]
    if "tub" in x: d["tub"] = x["tub"]
    L.append(d)

# ---- 5. footprints, quantise, write ---------------------------------------------
GR = {"cuff": 1, "delt": 2, "pec": 3, "lat": 4, "arm": 5}
patches = []
for n, g in [("Supraspinatus muscle", "cuff"), ("Infraspinatus muscle", "cuff"), ("Teres minor muscle", "cuff"), ("Subscapularis muscle", "cuff"),
             ("Teres major muscle", "lat"), ("Latissimus dorsi muscle", "lat"), ("Scapular spinal part of deltoid muscle", "delt"),
             ("Acromial part of deltoid muscle", "delt"), ("Clavicular part of deltoid muscle", "delt"), ("Deltoid muscle", "delt"),
             ("Pectoralis major muscle", "pec"), ("Coracobrachialis muscle", "arm"), ("Long head of biceps brachii", "arm"),
             ("Long head of triceps brachii", "arm")]:
    for s in (".or", ".er"):
        if n + s in F: patches.append((F[n + s], g))
contact_bones = ["Humerus.r", "Scapula.r", "Clavicle.r", "Body of sternum", "Manubrium of sternum"] + [k for k in F if k.startswith(("Costal", "Vertebra"))]
trees = [KD(F[b]) for b in contact_bones if b in F]
for n, g in [("Teres major muscle.r", "lat"), ("Latissimus dorsi muscle.r", "lat"), ("Coracobrachialis muscle.r", "arm"),
             ("Short head of biceps brachii.r", "arm"), ("Sternocostal head of pectoralis major muscle.r", "pec"),
             ("Clavicular head of pectoralis major muscle.r", "pec")]:
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
out = dict(girdle=pack(["Scapula.r", "Clavicle.r"], fix), thorax=pack(static, fix), hum=pack(["Humerus.r"], q0),
           fore=pack(fore, flex, colour=False), lines=L, R=round(float(r), 2),
           ep=r2(ep), me=r2(me), le=r2(le))
json.dump(out, open(OUT, "w"))
print(f"wrote {OUT}: {len(L)} muscle lines")
