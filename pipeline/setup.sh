#!/usr/bin/env bash
# One-off setup: downloads Z-Anatomy and creates a Python 3.11 environment with Blender's
# Python module (bpy). bpy only ships wheels for Python 3.11, hence uv.
# Works on macOS (Apple silicon or Intel) and Linux. Needs ~2 GB of free disk space.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache
if [ ! -f .cache/Z-Anatomy/Startup.blend ]; then
  echo "Downloading Z-Anatomy (about 100 MB)..."
  git clone --depth 1 https://github.com/Z-Anatomy/Models-of-human-anatomy .cache/za-repo
  unzip -q -o .cache/za-repo/Z-Anatomy.zip -d .cache
fi
command -v uv >/dev/null || { echo "Installing uv..."; python3 -m pip install --user uv; }
uv venv -p 3.11 .venv
uv pip install -p .venv/bin/python "bpy==4.2.0" numpy scipy
.venv/bin/python -c "import bpy; print('Blender', bpy.app.version_string, 'ready')"
