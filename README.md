# Biomechanics

Live at **https://nzacupuncture.github.io/biomechanics/** (GitHub: nzacupuncture/biomechanics).

Move the arm, elbow and scapula and see how each muscle's length and moment arms change, on real
bones from Z-Anatomy. The shoulder is done; other joints are on the roadmap in `CLAUDE.md`.

## Getting started with Claude Code

1. Unzip this folder somewhere sensible (for example `~/Projects/biomechanics`).
2. Open the folder in Claude Code and start with:

   > Read CLAUDE.md. Run the tests, start the app locally so I can check it, then help me put
   > it on GitHub and publish it with GitHub Pages.

3. Once it's published you'll have a web address. Open it on the clinic Mac, your phone or any
   computer; nothing needs installing, and every change you push updates it automatically.

Good next requests once it's live:

- "Fix Known issue 1 until the todo test passes."
- "Add scapulohumeral rhythm (roadmap step 3)."
- "Set the app up for several joints, then add the hip."

## Using it

- **Sliders** set the arm (plane of elevation, elevation, rotation) and the elbow.
- **Scapula:** *Moves with the arm* (default) follows healthy scapulohumeral rhythm, so about a
  third of arm elevation happens at the scapula and the pose line shows the glenohumeral angle;
  *Fixed* shows the glenohumeral joint on its own; *Set by hand* lets you set upward rotation, tilt,
  winging, elevation and retraction to explore dyskinesis. Scapular muscles (trapezius, rhomboids,
  levator scapulae, serratus anterior, pec minor) have their own table.
- **Drag a bone** in the 3D view to move it: the **humerus** moves the shoulder (hold **Shift** to
  rotate it about its long axis), the **radius, ulna or hand** bend the elbow, the **scapula**
  rotates about the AC joint and the **clavicle** swings about the SC joint (grabbing either switches
  the scapula to *Set by hand*; the arm keeps its position relative to the trunk, so the
  glenohumeral angle changes). Drag anywhere else to turn the view; scroll to zoom.
- **Swimmer view** lays the body face down in the water with a **Body roll** slider, and tells you
  where the elbow and wrist are relative to the water and the shoulder. Roll doesn't change muscle
  lengths (the muscles roll with the trunk); it changes where the arm is in the water.
- **Presets** include serve cocking, freestyle catch, three freestyle underwater phases (catch with
  an early vertical forearm, pull, push) and three recovery phases (exit, mid-recovery, entry);
  high-elbow sprinter with up to 40° roll.
- **Whole body** shows the rest of the skeleton for reference: *Faded* (solid but pale, the default),
  *See-through* or *Hidden*; the right hand moves with the forearm.
- **Draw a line** to add your own muscle line from the scapula, clavicle or ribcage to the humerus or
  forearm; lines on the forearm follow the elbow.

## Running it yourself

```bash
npm test         # anatomy checks
npm run serve    # then open http://localhost:8000
```

The `pipeline/` folder rebuilds the bone and muscle data from Z-Anatomy. You only need it when
adding a joint or changing attachments; Claude Code will run it for you (`brew install uv`, then
`pipeline/setup.sh`, the first time).

## Licence

CC BY-SA 4.0. Bone geometry from Z-Anatomy and BodyParts3D; see `ATTRIBUTION.md`.
