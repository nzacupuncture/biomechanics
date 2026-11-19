# Biomechanics

(Formerly "Joint lines of action". Repo nzacupuncture/biomechanics, live at
https://nzacupuncture.github.io/biomechanics/ ; renamed Nov 2026, the old address no longer works.)

An interactive teaching tool: move a joint and see how each muscle's length and moment arms
change, on real bone geometry from Z-Anatomy. Built for Nazan, an osteopath who runs Virtue
Healthcare in London and works with swimmers and tennis players. She uses it for clinical
reasoning, teaching associates and patient education. Write UI text in British English and in
plain clinical language (she thinks in "abducts, externally rotates", not "positive torque about z").

The shoulder is done: humerus, elbow and shoulder girdle (scapula and clavicle). The roadmap adds more joints.

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
                              # (needs uv: `brew install uv`; set up on Nazan's Mac Nov 2026)
cd pipeline && .venv/bin/python 01_find_objects.py "deltoid|scapula"   # look up object names
cd pipeline && .venv/bin/python 02_extract_meshes.py shoulder          # extract meshes
cd pipeline && .venv/bin/python 03_build_shoulder.py                   # writes app/data/shoulder.json
```

## Layout

```
app/                 the website (this folder is what GitHub Pages publishes)
  index.html, styles.css
  js/kinematics.js   ALL biomechanics: joint angles, muscle paths, wrapping, elbow, swimmer frame,
                     moment arms (pure maths, tested)
  js/main.js         rendering and UI only (three.js r128 as a global from cdnjs): sliders, presets,
                     dragging the arm, Swimmer view
  data/shoulder.json bones (quantised meshes) + muscle lines, produced by the pipeline; `skel` = whole-body
                     reference skeleton (display only, decimated), `hand` = right hand (moves with forearm)
pipeline/            Python + Blender scripts that turn Z-Anatomy into app data (.cache/ and .venv/ are git-ignored)
tests/               node:test suite
```

## Conventions (shoulder)

- **Frame:** cm, origin at the glenohumeral (GH) centre. x = medial(+)/lateral(−) for the RIGHT
  side, y = up, z = anterior. Fixed points (scapula, clavicle, thorax) are in this frame;
  humeral points are stored humerus-local with the arm hanging vertically, and are rotated at runtime.
- **Range of motion** (`armPossible`, tests/range.test.mjs): elevation ≤ `maxElevation(p)` (170° from
  p = −30° forwards, falling to 60° at pure extension p = −90°) and `trunkClearance` ≥ 1 (humerus and
  forearm outside the ribs-4–9 elliptical cylinder between shoulder and pelvis). The app refuses any
  slider, drag or girdle change that breaks this. `rhythmFor(p, e)` fades the scapular rhythm out
  behind p = −30° (extension doesn't upwardly rotate the scapula). Internal rotation at the side stops
  ~45–50° (forearm meets the trunk; slightly conservative because the abdomen is narrower than ribs).
  `headNeckClearance` (part of `armPossible`): `data.body` = spheres for cranium and face and an upright
  cylinder round the neck (pipeline, from the skull bones and C1-C7); humerus, elbow and forearm must stay
  outside (forearm/hand points get 2.5-3 cm leeway, since the spheres overshoot the back of the skull and
  hand-behind-head must be allowed). The trunk check only covers below shoulder level.
  `girdlePossible` (part of `armPossible`): against the real ribs (`girdle.ribs` sample and
  `girdle.contact` scapula points, written by the pipeline) the scapula may not sink in > 0.5 cm, nor lift
  off further than the rhythm does at full elevation (median 6.5 cm). Winging slider −10…20°. The
  clavicle may not go inside the upper ribs (`clavicleInside` ≤ 1 mm): `girdle.upperRibs` + `upperNormals`
  (ribs 1-3, cartilages, manubrium, outward normals from the full meshes) against `girdle.clavPts`; a
  point is inside only if every surface point within 3 mm of the nearest agrees (junctions/thin edges).
  In this skeleton the clavicle rests on the first rib, so pure depression stops ~7° and pure retraction
  ~11° (costoclavicular space); with elevation (as in the rhythm) retraction goes further. (A first,
  point-gap version let the clavicle slip between rib sample points; don't go back to it.) The app approaches every change in ≤ 1°
  steps (`attempt()` in main.js) and stops at the last possible position, so nothing jumps through a rib.
- **Pose:** `p` plane of elevation (−90 = pure extension, 0 = abduction, 90 = flexion, >90 cross-body, <0 towards
  extension), `e` elevation, `r` axial rotation (+ = external). Rotation:
  `R = Ry(p) · Rz(−e) · Ry(−p) · Ry(−r)`: elevation in any plane with **no hidden roll**.
- **Elbow:** pose `k` = elbow flexion in degrees (0 = straight). Lines that insert on the forearm carry
  `el` (epicondylar axis `ax`, centre `ep`, built angle `k0` = 89.6°); without `k` the forearm stays at
  `k0`, so shoulder values match the pilot. Triceps has `el.wrap`: it wraps round the back of the
  elbow on a cylinder through its insertion (otherwise it turned into a flexor past ~85°).
  Moment arm key `'k'`: + = flexes the elbow. No pronation/supination yet.
- **Swimmer view / body roll:** `toSwimmer` lays the body prone (+X = travel, +Y = up, +Z = swimmer's
  right) and rolls it about the trunk's centre line; roll + = right shoulder up. Water surface =
  level of the back at no roll. Roll changes no muscle length (everything rolls with the trunk); the
  app reports elbow and wrist height relative to the water and the wrist's position ahead of the
  shoulder. `data.wrist` = distal forearm centroid (humerus-local, at k0).
- **Dragging:** the grabbed point follows the pointer on a sphere round the GH centre; the humeral
  axis turns with it and is converted back to plane/elevation (rotation kept). Shift-drag = rotation.
  Slider ranges and `armPossible` are the limits (plane −90…130°).
  Forearm/hand drag = elbow (`turnAbout` the posed elbow axis); scapula/clavicle drag = the grabbed
  point follows the pointer on a sphere round the AC/SC joint, and `scapulaAngles` /
  `clavicleAngles` (Gauss-Newton, tested round trip) turn the rotation back into girdle angles;
  this switches the girdle to manual. The arm keeps its thoracohumeral pose. The drag lever is the
  whole bone (SC→AC, AC→inferior angle), so grabbing near a joint doesn't give huge angles.
- **Girdle limits** (`GIRDLE_RANGE`, tested): clavicle elevation −10…35°, retraction −20…25° (typical
  active SC ranges); scapula upward rotation −10…60°, posterior tilt −20…30°, internal rotation
  −15…40° (winging, generous for pathology). Healthy rhythm stays inside them to 170°.
- **Moment arm** = −dL/dθ in cm. Positive = the muscle drives elevation, horizontal adduction
  (rotation about the vertical axis, `h`) or external rotation. Horizontal values are hidden below 15° elevation.
- **Shoulder girdle** (`pose.girdle = { geo, ur, pt, ir, ce, cr }`, `geo` = `data.girdle`): scapular
  upward rotation, posterior tilt, internal rotation (ISB Y-X-Z about the AC joint; scapular axes
  from ISB landmarks AI, TS, AA taken from the mesh) and clavicular elevation and retraction (about
  the SC joint, carrying the AC joint). All zero or no `girdle` = as built (the pilot). Lines carry
  `ob` (origin bone: scap / clav / thorax). The app has three modes: **moves with the arm** (default:
  `rhythm(e)`, linear Ludewig 2009 rates; shoulder sliders are then the arm relative to the trunk),
  **fixed** (sliders = glenohumeral angles) and **set by hand**. Shoulder moment arms are always about
  the GH joint (scapula held where it is while the humerus is perturbed).
- **Protraction glides round the chest:** `girdle()` adds `protractionIR(cr)` (≈0.73° scapular internal
  rotation per degree of clavicular protraction, fitted to keep the inferior angle on this ribcage), so
  `ir` means rotation beyond that, i.e. winging (+). Applies to the rhythm too (Nazan's choice): the
  scapula externally rotates ~10–15° over full elevation (Ludewig ~5°, McClure ~24°).
- **Scapular muscles** (`g: 'scap'`, `ib` = insertion bone): trapezius upper/middle/lower, rhomboid
  minor/major, levator scapulae, serratus anterior upper/lower (wrap round the thorax as an upright
  cylinder, `wrap: 'thorax'`), pec minor. Moment arms: `urg` = upward rotation of the whole girdle
  in the rhythm's proportions (what "upward rotator" means clinically), `pt`, `ir` (+ = winging),
  `ce`, `cr`.

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
3. **Deltoid drapes over ridges** (`wrap: 'tub'` + `ridge`, Nov 2026): a humerus-fixed line through the
   tubercle point that the fibre drapes over like a rope over a bar; it lifts off exactly when the
   bend straightens, so nothing jumps. Ridge directions were chosen by a search over directions for
   smooth moment arms that keep the anatomy tests and published abduction profiles. Middle deltoid:
   ridge along the shaft 4 cm lateral (replaced its sphere wrap, which slid round the head in early
   flexion). The pilot's single tubercle point switched on and off and made lengths jump ~1 cm.
4. **Origins inside the wrap sphere** shrink the sphere to 0.97 × origin distance (still used by the cuff).
5. **Z-Anatomy labels are unreliable.** The trapezius "Descending part" mesh is the LOWER part and
   "Ascending part" the upper (named by position here); its landmark labels (`.i`) can't be used
   (stored relative to parents that aren't extracted).
   **Patch labels too:** `.or` / `.er` don't always mean origin / insertion
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
abductor around 60° of abduction. Posterior deltoid adducts at rest and turns abductor around 60°. Scapular muscles at rest: upper
and lower trapezius and lower serratus upwardly rotate; rhomboids, levator and pec minor downwardly
rotate; serratus holds the medial border on the ribs; rhythm puts about two thirds of 120° at the GH
joint. Ranges are consistent with published cadaver and modelling data
(e.g. Ackland et al. 2008; Kuechle et al. 1997). Treat values as teaching-grade, not research-grade.

## Known issues (in priority order)

1. **Moment-arm steps (mostly fixed Nov 2026).** Wall-based cuff wrapping (decision 2) and deltoid
   ridges (decision 3) removed every length jump. Left: teres minor at 90° abduction with ~80° IR
   (fixed scapula; two equally short routes over/under the head swap), and with the scapula moving a
   few spots, worst the lower infraspinatus at 90° abduction with ~75° IR (3.6 cm; the moving-scapula
   guard is 4 cm for this, agreed with Nazan). Restricting its held route moves the step to ~30° IR
   (worse clinically), and tilting its side vector doesn't help, so neither is used. Both `todo` tests (fixed and moving scapula) are the target; guard tests at 3 cm
   must always pass. Restricting teres minor to the lower route fixes the fixed-scapula case but adds
   a 4 cm step at 90° abduction/50° IR with the scapula moving, so it was not kept.
   Tried and rejected: fixed-axis cylinders for cuff or deltoid (origins line up with the axis), a
   finite wall (cuff slips to the wrong side).
2. **Scapular upward rotation at high elevation.** About a single AC-joint axis, the lower serratus
   and lower trapezius turn into downward rotators above ~60–90° of arm elevation, while clinically
   they are the main upward-rotation force couple there. Causes: the real rotation axis migrates
   from near the root of the spine to the AC joint (Inman; Bagg & Forrest 1988), and each muscle is
   one centroid line. Fix ideas: a migrating UR axis, several serratus/trapezius fibres.
3. **Limited scapulothoracic contact.** Protraction/retraction follows the chest wall and impossible
   hand-set positions are refused (see conventions), but the rhythm still lets the scapula drift off
   the real ribs: median ~3 cm at 90°, ~6 cm at full elevation. Correcting its rotation (IR and/or tilt)
   doesn't fix it: the drift comes from where the clavicle/AC joint carry it (ribcage narrows above). Contact constraints were tried (elliptical thorax,
   solving IR+retraction, IR+tilt or IR+elevation): they hold contact only with unphysiological angles
   (e.g. 57–71° retraction), so they are not used.
4. **Anterior deltoid in flexion** stays near zero (−0.1 to +0.3 cm) above ~90° with the scapula
   moving (was −1 cm fixed); published data keep it a modest flexor.
5. **One centroid line per muscle part.** Broad muscles are their average fibre.
6. **Upper trapezius** mesh stops near C7 and meets the acromion, not the clavicle: its line runs
   from the midline at C7 to the acromion.

## Roadmap

1. **Deploy.** Create a GitHub repo, push, enable Pages (Settings → Pages → Source: GitHub Actions).
   `.github/workflows/pages.yml` runs the tests and publishes `app/`.
2. **Fix Known issue 1** until the `todo` tests pass; then make them normal tests (end-range IR left).
3. **Scapulohumeral rhythm.** Done Nov 2026 (girdle, rhythm, scapular muscles); see Known issues 2–3.
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
