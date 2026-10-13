#!/usr/bin/env bash
# Usage: run.sh <input image> <output glb>
# Called by the server with the cropped engine input. Prints progress lines; exits non-zero on error.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$DIR/venv/bin/python" ]; then
  echo "Hunyuan3D is not set up. Run: bash $DIR/setup.sh" >&2; exit 2
fi
exec "$DIR/venv/bin/python" "$DIR/generate.py" "$1" "$2"
