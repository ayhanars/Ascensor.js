# Hunyuan3D 2 as the local base-mesh engine

Free, local, no account. Shape generation only (the texture stage needs an Nvidia GPU); the
agent colors the mesh in Blender afterwards by projecting the reference onto it.

Requirements: Apple Silicon Mac with 16 GB (mini model) or Linux with a CUDA GPU; Python 3.10
to 3.12 (macOS's built-in python3 is 3.9 and too old: `brew install python@3.11` first); about 6 GB of disk for the environment and the
mini weights; 3 to 5 minutes per model on an M-series laptop.

```bash
bash engines/hunyuan3d/setup.sh            # once
./engines/hunyuan3d/run.sh front.png out.glb   # test
```

The server calls `run.sh <input.png> <output.glb>` when a run's Base mesh is set to "Local
engine". Point `BASE_MESH_CMD` at another command (with `{input}` and `{output}` placeholders) to
use a different engine, for example a Pixal3D or TRELLIS script from the AssetFurnace project.

License note: the Hunyuan3D weights use the Tencent Community License, which excludes use in the
EU, UK and South Korea. Check it fits your situation.
