"""Extract world-space meshes from Z-Anatomy for one joint.

  .venv/bin/python 02_extract_meshes.py shoulder

Writes .cache/<joint>_full.pkl (full resolution, used to find attachments) and
.cache/<joint>_web.pkl (bones decimated for the web). Units: metres, Blender frame
(x = left(+)/right(-), y = posterior(+), z = up). Conversion to the app frame happens in 03.
Opening the whole .blend crashes on machines with little RAM, so objects are appended
one list at a time with bpy.data.libraries.load.
"""
import sys, pickle, numpy as np, bpy
BLEND = ".cache/Z-Anatomy/Startup.blend"
ORD = "First Second Third Fourth Fifth Sixth Seventh Eighth Ninth Tenth Eleventh Twelfth".split()
JOINTS = {
    "shoulder": dict(
        bones=["Humerus.r", "Scapula.r", "Clavicle.r", "Radius.r", "Ulna.r", "Manubrium of sternum", "Body of sternum", "Xiphoid process"]
        + [f"{o} rib.r" for o in ORD]
        + [f"Costal cartilage of {o.lower()} rib.r" for o in ORD[:10]]
        + [f"Vertebra T{i}" for i in range(1, 13)]
        + ["Atlas (C1)", "Axis (C2)"] + [f"Vertebra C{i}" for i in range(3, 8)] + ["Occipital bone"],
        muscles=["Teres minor muscle", "Teres major muscle", "Supraspinatus muscle", "Subscapularis muscle", "Infraspinatus muscle",
                 "Latissimus dorsi muscle", "Scapular spinal part of deltoid muscle", "Acromial part of deltoid muscle",
                 "Clavicular part of deltoid muscle", "Clavicular head of pectoralis major muscle",
                 "Sternocostal head of pectoralis major muscle", "Coracobrachialis muscle", "Short head of biceps brachii",
                 "Long head of biceps brachii", "Long head of triceps brachii", "Deltoid muscle", "Pectoralis major muscle",
                 "Biceps brachii muscle", "Triceps brachii muscle",
                 # scapular muscles (thorax/neck to scapula or clavicle)
                 "Descending part of trapezius muscle", "Transverse part of trapezius muscle", "Ascending part of trapezius muscle",
                 "Rhomboid major muscle", "Rhomboid minor muscle", "Levator scapulae", "Serratus anterior muscle", "Pectoralis minor muscle"],
        # full-resolution only: landmark leader lines (2 vertices; one end sits on the bone) and ligaments
        extra=["Inferior angle of scapula.i", "Superior angle of scapula.i", "Acromion.i", "Spine of scapula.i",
               "Coracoid process.i", "Medial border of scapula.i", "Nuchal ligament"],
        # decimation ratio for the web copy (ribs etc. default to 0.12, others 0.35)
        decimate={"Scapula.r": 0.22, "Humerus.r": 0.6, "Clavicle.r": 0.7, "Radius.r": 0.35, "Ulna.r": 0.35, "Occipital bone": 0.06},
    ),
}

def load(names):
    with bpy.data.libraries.load(BLEND) as (src, dst):
        avail = set(src.objects)
        dst.objects = list(dict.fromkeys(n for n in names if n in avail))
    objs = [o for o in dst.objects if o is not None]
    for o in objs:
        bpy.context.scene.collection.objects.link(o)
    return objs

def grab(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles()
        M = np.array(o.matrix_world)
        V = np.array([v.co[:] for v in me.vertices]); V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
        T = np.array([t.vertices[:] for t in me.loop_triangles])
        out[o.name] = (V, T)
    return out

joint = sys.argv[1] if len(sys.argv) > 1 else "shoulder"
cfg = JOINTS[joint]
names = cfg["bones"] + [m + s for m in cfg["muscles"] for s in (".r", ".or", ".er")] + cfg.get("extra", [])
objs = load(names)
full = grab(objs)
missing = [n for n in cfg["bones"] if n not in full]
if missing: print("WARNING missing bones:", missing)
pickle.dump(full, open(f".cache/{joint}_full.pkl", "wb"))
for o in objs:
    if o.name in cfg["bones"]:
        r = cfg["decimate"].get(o.name, 0.12 if "rib" in o.name.lower() else 0.35)
        o.modifiers.new("dec", "DECIMATE").ratio = r
web = grab([o for o in objs if o.name in cfg["bones"]])
pickle.dump(web, open(f".cache/{joint}_web.pkl", "wb"))
print(f"{joint}: {len(full)} objects extracted, {len(web)} bones decimated")
