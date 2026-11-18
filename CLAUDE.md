# Joint lines of action

An interactive teaching tool: move a joint and see how each muscle's length and moment arms
change, on real bone geometry from Z-Anatomy. Built for Nazan, an osteopath who runs Virtue
Healthcare in London and works with swimmers and tennis players. She uses it for clinical
reasoning, teaching associates and patient education. Write UI text in British English and in
plain clinical language (she thinks in "abducts, externally rotates", not "positive torque about z").

The shoulder is done (pilot). The roadmap below adds scapular motion and more joints.

## Hard rules

- **No patient data, ever.** This is a static reference tool. It must stay separate from
  Nazan's clinic records app (`virtue-clinical-records`): no shared repo, code or hosting.
- **Static site only.** No server, no database, no build step unless there is a clear reason.
  It is hosted on GitHub Pages so the clinic Mac (too old for Claude Code) only needs a browser.
- **Licence.** Bone geometry is CC BY-SA 4.0 (Z-Anatomy, derived from BodyParts3D, CC BY-SA 2.1 JP).
  Keep the attribution footer on every page and in `ATTRIBUTION.md`; the project stays CC BY-SA 4.0.
- **Tests encode anatomy.** `npm test` must pass before every commit. Never change an expectation
  in `tests/` to make a change pass: if a test fails, assume the change is wrong and explain the
  disagreement to Nazan in clinical terms before touching the expectation.
- After any change to kinematics or data, also look at the app (serve it and take a screenshot if
  you can) at: arm by side, abduction 90°, flexion 120°, serve cocking.

## Commands

```bash
npm test                      # anatomy and continuity tests (Node 18+, no dependencies)
npm run serve                 # http://localhost:8000  (app must be served; file:// can't fetch JSON)
cd pipeline && ./setup.sh     # one-off: downloads Z-Anatomy, makes a Python 3.11 env with Blender's bpy
cd pipeline && .venv/bin/python 01_find_objects.py "deltoid|scapula"   # look up object names
cd pipeline && .venv/bin/python 02_extract_meshes.py shoulder          # extract meshes
cd pipeline && .venv/bin/python 03_build_shoulder.py                   # writes app/data/shoulder.json
```

## Layout

```
app/                 the website (this folder is what GitHub Pages publishes)
  index.html, styles.css
  js/kinematics.js   ALL biomechanics: joint angles, muscle paths, wrapping, moment arms (pure maths, tested)
  js/main.js         rendering and UI only (three.js r128 as a global from cdnjs)
  data/shoulder.json bones (quantised meshes) + muscle lines, produced by the pipeline
pipeline/            Python + Blender scripts that turn Z-Anatomy into app data (.cache/ and .venv/ are git-ignored)
tests/               node:test suite
```

## Conventions (shoulder)

- **Frame:** cm, origin at the glenohumeral (GH) centre. x = medial(+)/lateral(−) for the RIGHT
  side, y = up, z = anterior. Fixed points (scapula, clavicle, thorax) are in this frame;
  humeral points are stored humerus-local with the arm hanging vertically, and are rotated at runtime.
- **Pose:** `p` plane of elevation (0 = abduction, 90 = flexion, >90 cross-body, <0 towards
  extension), `e` elevation, `r` axial rotation (+ = external). Rotation:
  `R = Ry(p) · Rz(−e) · Ry(−p) · Ry(−r)`: elevation in any plane with **no hidden roll**.
- **Moment arm** = −dL/dθ in cm. Positive = the muscle drives elevation, horizontal adduction
  (rotation about the vertical axis, `h`) or external rotation. Horizontal values are hidden below 15° elevation.
- **The scapula is fixed**, so slider angles are effectively glenohumeral angles. Say so in the UI.
- Right side only. A left side would be a mirror (x → −x), not new data.

## Decisions already made, and why (don't undo without reason)

1. **Not the ISB Y-X-Y sequence.** With plain YXY, "90° flexion" includes a 90° humeral roll, which
   made infraspinatus show as an internal rotator at 90° flexion. The no-roll form above fixes it.
2. **Cuff wrapping is side-locked.** A frictionless sphere wrap takes the shorter way round, so in
   end-range rotation subscapularis flipped behind the head. Each wrapped line has a humerus-fixed
   `side` vector (subscapularis anterior, infraspinatus/teres minor posterior, supraspinatus superior,
   middle deltoid lateral) and must stay on that side. Since Nov 2026 this is done with a **wall**
   (`sideWrap` in kinematics.js): a humerus-fixed half-plane from a wrap axis through the GH centre,
   on the side opposite `side`. The tendon takes the shortest path round the head that doesn't pass
   through the wall (held at the wall's edge, or the long way round, when the short way would). This
   replaced a "pick the arc whose midpoint is nearer `side`" rule whose length jumped by up to 6 cm.
3. **Anterior and posterior deltoid use a "tubercle" obstacle (`wrap: 'tub'`),** a humerus-fixed point
   the fibre drapes over only when it protrudes beyond the straight line. Sphere wrapping was unstable
   for these two because origin and insertion sit almost opposite each other across the head.
4. **Origins inside the wrap sphere** (acromion) shrink the sphere to 0.97 × origin distance, otherwise
   the middle deltoid was drawn straight through the head.
5. **Z-Anatomy patch labels are unreliable.** `.or` / `.er` don't always mean origin / insertion
   (the sternocostal pec major `.er` patch is its origin, on the sternum, and covers only the lower
   part). Always classify by which bone a patch touches; take origins from muscle-to-bone contact
   when a patch is missing or partial.
6. **Arm re-posed:** Z-Anatomy's humerus hangs ~10° abducted; it is rotated to vertical so 0° means 0°.
   Elbow fixed at ~90° flexion so rotation is visible; biceps and triceps insert on the flexed forearm.
7. **Moment-arm guard:** `momentArm` uses one-sided differences and takes the smaller slope when they
   disagree by >2 cm, because route switches in the wrap make the length jump (see Known issue 1).

## Validation the model reproduces (see tests)

Middle deltoid abducts through 0–120° (~1.6 cm at rest rising to ~2.9 cm). Supraspinatus abducts at
~2 cm from 0–60°, fading near 150°. Infraspinatus (lower) and teres minor externally rotate, and
subscapularis internally rotates, at rest, 90° abduction and 90° flexion. Lat and teres major adduct
and internally rotate. Pec major horizontally adducts at 90° abduction. Posterior deltoid
horizontally abducts at 90° abduction, extends in flexion up to 90°, and switches from adductor to
abductor around 60° of abduction. Ranges are consistent with published cadaver and modelling data
(e.g. Ackland et al. 2008; Kuechle et al. 1997). Treat values as teaching-grade, not research-grade.

## Known issues (in priority order)

1. **Moment-arm steps (partly fixed Nov 2026).** The `todo` test "no moment-arm jump larger than
   1 cm per 5°" is the target. The wall method (decision 2) removed every length jump for the cuff
   and middle deltoid; key-pose values are unchanged. Still failing (9 places before, 7 now):
   - **Anterior/posterior deltoid tubercle** (decision 3, untouched): anterior deltoid at ~115°
     abduction; posterior deltoid at 90° abduction with ~10° and ~65° ER. The point snaps on and
     off while the fibre is still 1–2 cm from it, so the length jumps ~1 cm.
   - **Middle deltoid, 15–25° flexion**: acromion almost directly opposite the insertion, so the
     shortest path slides from posterolateral to anterolateral over the head (smooth but steep).
   - **Middle deltoid, 90° abduction ~70–75° IR** and **teres minor, 90° abduction ~80° IR**: two
     equally short routes swap over (no jump in length, sharp change in moment arm).
   Tried and rejected (Nov 2026), so don't repeat them blindly: a fixed-axis cylinder for the cuff
   (at ~90° elevation the scapular origin lies on the humeral shaft axis, so the cylinder breaks);
   cylinders for the deltoid (same problem with the acromion); a deltoid "ridge" (a line through
   the tubercle that the fibre drapes over: smooth, but it changed the deltoid's resting moment
   arms, e.g. anterior deltoid abduction +0.6 → −2.1 cm, or broke the posterior deltoid extension
   test depending on the ridge's direction; needs Nazan's view on the deltoid's true behaviour);
   a finite wall (lets the cuff slip to the wrong side). The guard in decision 7 is still in place.
2. **Fixed scapula** (see roadmap step 3). Consequences: end-range positions are exaggerated, and in
   serve cocking (90° abduction, 85° ER) subscapularis shows a small external-rotation moment arm and
   barely lengthens, which is clinically wrong.
3. **Anterior deltoid** flexion moment arm turns slightly negative above ~100° flexion; probably too early.
4. **One centroid line per muscle part.** Broad muscles (pec major, lat, deltoid) are their average
   fibre. More fibres per muscle would improve this.

## Roadmap

1. **Deploy.** Create a GitHub repo, push, enable Pages (Settings → Pages → Source: GitHub Actions).
   `.github/workflows/pages.yml` runs the tests and publishes `app/`.
2. **Fix Known issue 1** until the `todo` test passes; then make it a normal test. (Cuff done; the
   deltoid and two end-range swaps remain.)
3. **Scapulohumeral rhythm.** Move scapula and clavicle with elevation (start with a simple
   regression such as ~1 : 2 scapular upward rotation : GH elevation after the first ~30°, plus
   posterior tilt and external rotation; Ludewig et al. 2009 gives values). Scapular origins move
   with it. The slider then shows thoracohumeral elevation, with the GH angle displayed alongside.
   Add a toggle so the fixed-scapula view stays available. Update tests and Known issue 2.
4. **Generalise to several joints.** A joint picker; `data/<joint>.json`; a per-joint config for
   degrees of freedom, presets and labels; shared rendering. Keep each joint's kinematics tested.
5. **Hip:** flexion/extension, ab/adduction, rotation; gluteals, iliopsoas, adductors, TFL,
   rectus femoris, hamstrings, deep rotators.
6. **Knee:** with a hip angle slider so two-joint muscles (rectus femoris, hamstrings, gastrocnemius)
   show their dependence on the other joint.
7. **Ankle and foot.**

## Adding a joint (pattern)

1. `01_find_objects.py` to find bone and muscle object names (meshes end `.r`; patches `.or`/`.er`).
2. Add a config to `JOINTS` in `02_extract_meshes.py`; run it.
3. Copy `03_build_shoulder.py` to `03_build_<joint>.py`: fit the joint centre and axes, choose a
   neutral pose, derive attachment points (classify patches by the bone they touch), decide
   wrapping per muscle, and write `app/data/<joint>.json`.
4. Write the anatomy tests FIRST from textbook actions, then make them pass.
5. Check the result visually, and show Nazan the moment-arm table at a few key positions before
   calling it done: she is the domain expert.
