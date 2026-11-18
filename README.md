# Joint lines of action

Move a joint and see how each muscle's length and moment arms change, on real bones from
Z-Anatomy. The shoulder is finished as a pilot; other joints are on the roadmap in `CLAUDE.md`.

## Getting started with Claude Code

1. Unzip this folder somewhere sensible (for example `~/Projects/joint-lines-of-action`).
2. Open the folder in Claude Code and start with:

   > Read CLAUDE.md. Run the tests, start the app locally so I can check it, then help me put
   > it on GitHub and publish it with GitHub Pages.

3. Once it's published you'll have a web address. Open it on the clinic Mac, your phone or any
   computer; nothing needs installing, and every change you push updates it automatically.

Good next requests once it's live:

- "Fix Known issue 1 until the todo test passes."
- "Add scapulohumeral rhythm (roadmap step 3)."
- "Set the app up for several joints, then add the hip."

## Running it yourself

```bash
npm test         # anatomy checks
npm run serve    # then open http://localhost:8000
```

The `pipeline/` folder rebuilds the bone and muscle data from Z-Anatomy. You only need it when
adding a joint or changing attachments; Claude Code will run it for you (`pipeline/setup.sh` first).

## Licence

CC BY-SA 4.0. Bone geometry from Z-Anatomy and BodyParts3D; see `ATTRIBUTION.md`.
