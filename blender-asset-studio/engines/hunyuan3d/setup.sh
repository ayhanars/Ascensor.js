#!/usr/bin/env bash
# One-time setup of Hunyuan3D 2 (shape generation) on macOS Apple Silicon, or Linux.
# Creates engines/hunyuan3d/venv, clones the Tencent repo, installs PyTorch with Metal (MPS)
# support and the hy3dgen package. Model weights (a few GB for the mini model) download on the
# first generation and are cached in ~/.cache/huggingface.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Needs Python 3.10, 3.11 or 3.12: the mesh libraries (pymeshlab and friends) ship wheels for
# those only. macOS's built-in python3 is 3.9 and will not work.
PY=""
for cand in python3.11 python3.12 python3.10 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    v="$("$cand" -c 'import sys; print(sys.version_info[0]*100+sys.version_info[1])' 2>/dev/null || echo 0)"
    if [ "$v" -ge 310 ] && [ "$v" -le 312 ]; then PY="$(command -v "$cand")"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "No Python 3.10, 3.11 or 3.12 found (macOS's own python3 is too old)."
  echo "Install one and run this script again:"
  echo "    brew install python@3.11"
  exit 1
fi
echo "using $PY ($("$PY" --version 2>&1))"
if [ -d venv ] && ! venv/bin/python -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)' 2>/dev/null; then
  echo "existing venv uses an unsupported Python; recreating it"
  rm -rf venv
fi

[ -d venv ] || "$PY" -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip wheel setuptools >/dev/null

echo "installing PyTorch (Metal backend on macOS)"
pip install torch torchvision torchaudio

if [ ! -d Hunyuan3D-2 ]; then
  echo "cloning Hunyuan3D-2"
  git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
fi
echo "installing hy3dgen requirements (shape generation only; texture stage needs CUDA and is skipped)"
pip install -r Hunyuan3D-2/requirements.txt
pip install -e Hunyuan3D-2

echo
python generate.py --check
echo
echo "Setup done. First generation downloads the model weights (~3 GB for Hunyuan3D-2mini)."
echo "Test with:  ./run.sh path/to/front_view.png /tmp/test.glb"
