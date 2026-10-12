# Blender Asset Studio agent conventions

You are building a single 3D asset inside a running Blender instance. You control Blender
only through the `blender` MCP tools. The person reviewing your work sees the result as a
GLB in a web viewer where every top-level object is a clickable "part".

## Your workflow

1. Read `./reference.png` with the Read tool when it exists. Study proportions, silhouette,
   materials and colors before writing any code.
2. Write or edit `./build.py` in the current directory. It is the one source of truth for the
   asset. Everything you do to the scene must be reproducible by running this file alone.
3. Run the file in Blender with `mcp__blender__execute_blender_code` using exactly:
   `exec(compile(open(BUILD_PY).read(), "build.py", "exec"))` where `BUILD_PY` is the absolute
   path given in the task. Never paste the script body into the tool call directly.
4. Take `mcp__blender__get_viewport_screenshot`, compare to the reference, fix the biggest
   difference first, edit `build.py`, re-run. Repeat up to the number of passes allowed.
5. Finish by replying with a short summary: one line per part you created.

## build.py rules

- The first statement must call the scene reset below so re-runs are idempotent.
- Units: meters. Real-world scale. Put the asset on the ground plane (lowest point at z = 0)
  centered on the origin.
- Every meaningful part is its own object with a clear, stable `PascalCase` name such as
  `Roof`, `WallNorth`, `Balcony`, `Pergola`, `Umbrella_01`. Names never change across
  versions unless the part is deleted. The viewer uses these names for part selection.
- Group only with collections, never parent objects inside other objects, so the GLB keeps
  every part as a top-level node.
- Give every object a material with a base color (Principled BSDF). Prefer a few shared,
  named materials such as `Stucco_Cream`, `Paint_Blue`, `Wood_Timber`.
- Use mesh primitives, modifiers (array, mirror, solidify, bevel) and bmesh. Keep the whole
  asset under roughly 60k triangles unless told otherwise.
- Apply modifiers only when needed for the final result. The export step applies them.
- Never reload the file, quit Blender, change render settings, or touch objects you did not
  create. Never use `bpy.ops.wm.read_homefile` or `bpy.ops.wm.quit_blender`.
- No network access, no `pip install`, no file writes outside the current directory.

## Scene reset (copy verbatim to the top of build.py)

```python
import bpy, bmesh, math
from mathutils import Vector

def scene_reset():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                       bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for block in list(block_list):
            if block.users == 0:
                block_list.remove(block)

scene_reset()
```

## Refinement requests

When the task says a request is scoped to a part, change only that part's code and the
code that directly supports it. Keep every other part identical. If a `tweaks.py` section is
present at the end of `build.py`, it holds manual edits the reviewer made in the viewer:
fold them into the proper part code rather than deleting them.
