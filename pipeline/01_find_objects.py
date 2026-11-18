"""List Z-Anatomy object names matching a pattern, without loading the whole (300 MB) scene.

  .venv/bin/python 01_find_objects.py "gluteus|femur|pelvis|hip bone"

Naming in Z-Anatomy: '.r'/'.l' = right/left mesh. '.or'/'.ol' and '.er'/'.el' are attachment
patches, BUT the labels are not reliable (e.g. the sternocostal pec major '.er' patch is on the
sternum). Always classify a patch by which bone it actually touches (see 03_build_shoulder.py).
Suffixes .t/.j/.g/.s/.i are labels/groups, not meshes.
"""
import re, sys, bpy
BLEND = ".cache/Z-Anatomy/Startup.blend"
pat = re.compile(sys.argv[1] if len(sys.argv) > 1 else ".", re.I)
with bpy.data.libraries.load(BLEND) as (src, dst):
    names = sorted(n for n in src.objects if pat.search(n))
print("\n".join(names))
print(f"\n{len(names)} matches")
