# Blender Asset Studio agent conventions

You are building a single 3D asset inside a running Blender instance. You control Blender
only through the `blender` MCP tools; there is no shell. The person reviewing your work sees
the result as a GLB in a web viewer where every top-level object is a clickable "part".

The Blender MCP server's tool names vary between versions. Use whichever tool runs Python
code inside Blender (usually `execute_blender_code`) and whichever returns a viewport image
(`get_viewport_screenshot` on some servers, `look` on others). Never use tools that import,
search or generate outside assets (`import_asset`, `search_assets`, `generate_3d`): every part
must come from your own code in build.py. Tools you are denied are simply unavailable; move
on without them, do not retry them.

## Your workflow

1. Read `./reference.png` with the Read tool when it exists. Study proportions, silhouette,
   materials and colors before writing any code.
2. Write or edit `./build.py` in the current directory. It is the one source of truth for the
   asset. Everything you do to the scene must be reproducible by running this file alone.
3. Run the file in Blender with the code-execution tool using exactly:
   `exec(compile(open(BUILD_PY).read(), "build.py", "exec"))` where `BUILD_PY` is the absolute
   path given in the task. Never paste the script body into the tool call directly.
4. Take a viewport screenshot, compare to the reference, fix the biggest
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
  asset within the triangle budget stated in the task (see Detail levels below).
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

## Materials and realism

The task states a materials level. Follow it:

- **flat**: one Principled BSDF base color per material with a sensible roughness. No textures.
- **procedural**: node textures for the main surfaces. Stucco and plaster: Noise Texture into a
  Bump node, slight color variation via ColorRamp. Wood: Wave Texture (bands) with distortion,
  warm color ramp. Brick and stone: Brick Texture with mortar color. Roof tiles and paving:
  Checker or Voronoi driven color plus Bump. Glass: transmission 1.0, roughness 0.05. Metal:
  metallic 1.0, roughness 0.3. Fabric and canvas: Noise into roughness. Always keep a meaningful
  Base Color input value as well, because the GLB viewer shows only base colors.
- **pbr**: if the Blender MCP server offers Poly Haven tools (search and download textures), use
  them for the main surfaces at 1k or 2k resolution and apply the generated material to the
  objects, then set the Mapping node scale so the texture reads at real-world size. Image textures
  are packed into the GLB, so the viewer will show them. If the tools are missing or fail, fall
  back to the procedural recipe above and say so in your summary.

Build in this order: massing and proportions first, then details and parts, then materials. Take
one extra screenshot after materials to check scale and color against the reference. Close-up
reference images, when provided, show what the materials should look like; match their color,
pattern scale and wear.

## Texture kit recipe

When the task lists kit textures, build their materials with this recipe (adapt names):

```python
def kit_material(name, albedo, normal=None, roughness=None, size_m=(1.0, 1.0), color_tint=None):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; nodes = nt.nodes; links = nt.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexCoord"); mapping = nodes.new("ShaderNodeMapping")
    # one tile covers size_m meters in world space (object scale is applied at export)
    mapping.inputs["Scale"].default_value = (1.0 / size_m[0], 1.0 / size_m[1], 1.0)
    links.new(tex.outputs["Object"], mapping.inputs["Vector"])
    img = nodes.new("ShaderNodeTexImage"); img.image = bpy.data.images.load(albedo, check_existing=True)
    links.new(mapping.outputs["Vector"], img.inputs["Vector"]); links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    if roughness:
        r = nodes.new("ShaderNodeTexImage"); r.image = bpy.data.images.load(roughness, check_existing=True)
        r.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], r.inputs["Vector"]); links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    if normal:
        n = nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(normal, check_existing=True)
        n.image.colorspace_settings.name = "Non-Color"
        nm = nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.6
        links.new(mapping.outputs["Vector"], n.inputs["Vector"]); links.new(n.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat
```

Object-space coordinates keep the tile size in meters regardless of UVs, but the glTF export
needs UVs: give each textured object a UV map (`bpy.ops.object.mode_set` is not needed; use
`obj.data.uv_layers.new()` and a cube projection via `bpy.ops.uv.cube_project` with a context
override, or build the mesh with UVs from the start). Image textures are packed into the GLB,
so the kit shows in the web viewer. Use the kit for every surface it fits; use a slight
`color_tint` only if the task asks for a different color than the photo.


## Detail levels

The task states a detail level and a triangle budget for the whole asset. After every build
pass, run this and read the number before deciding what to add next:

```python
def count_tris():
    deps = bpy.context.evaluated_depsgraph_get(); total = 0
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(deps); m = ev.to_mesh(); m.calc_loop_triangles()
        total += len(m.loop_triangles); ev.to_mesh_clear()
    print("TRIS", total); return total
```

- **draft** (5k): primitives, array and mirror modifiers, no subdivision. Proportions and
  silhouette only.
- **game** (60k): Bevel modifier with 2 to 3 segments on hard edges; Subdivision Surface
  level 1 on rounded parts, with edge creases (`edge.crease`) to keep corners; Boolean
  modifier cuts for openings and reveals; `shade_smooth` with auto smooth by angle. Model what
  reads from 3 m away: window frames, railings, trims, handles.
- **hero** (300k): Subdivision Surface level 2 on organic and rounded parts; Displace
  modifier driven by a Noise or Voronoi texture for stucco, wood grain, fabric and ground
  relief; curve objects with bevel depth for cables, rails, pipes and trims; Skin modifier on
  edge chains for limbs, branches and tubes, then subdivision; voxel Remesh plus Smooth for
  blended organic masses such as heads and bodies. If the count exceeds the budget, add a
  Decimate modifier (collapse) to the heaviest parts rather than removing detail by hand.

Spend the budget where the reference has detail; leave flat surfaces as flat quads.

## Base mesh workflow

When the task gives a BASE MESH path, build.py starts like this, right after `scene_reset()`:

```python
bpy.ops.import_scene.gltf(filepath=BASE_GLB)
base = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
base.name = "Body"
# orient Z-up and put the feet on the ground, scale to the real height in meters
bpy.context.view_layer.objects.active = base
bpy.ops.object.transform_apply(rotation=True, scale=True)
dims = base.dimensions
target_h = 1.8  # from the task description
s = target_h / max(dims.z, 1e-6)
base.scale = (s, s, s)
bpy.ops.object.transform_apply(scale=True)
lowest = min((base.matrix_world @ v.co).z for v in base.data.vertices)
base.location.z -= lowest
```

Then, in order:

1. **Clean**: `bpy.ops.mesh.remove_doubles` (merge by distance 0.5 mm), delete loose, recalculate
   normals, `shade_smooth`. Fill small holes if any.
2. **Split into named parts**: the viewer needs separate top-level objects. Use
   `bpy.ops.mesh.separate(type='LOOSE')` first; then cut the remaining body with
   `bpy.ops.mesh.bisect` planes (or select vertices by height and `separate(type='SELECTED')`)
   into at least Head, Hair, Torso, ArmLeft, ArmRight, LegLeft, LegRight, FootLeft, FootRight
   for a figure; for props, split by the parts the reference shows. Name every object.
3. **Decimate** to the triangle budget with a Decimate modifier (collapse) on the heaviest parts,
   applied; keep the head's share of the budget the largest.
4. **Color**: give each part a material. When the reference shows the object from the front,
   project it: add an orthographic camera facing the front (+Y looking at -Y), load the
   reference image, use a UV Project modifier with that camera on each part, then an Image
   Texture node with a Mapping node (offset/scale) that frames the front view within the
   reference image; mix with a flat base color for faces that point away from the camera
   (Geometry node's Backfacing or Normal dot view). Add UVs (`uv_layers.new()` + the UV
   Project modifier applied) so the export carries them.
5. **Rig** only if the task asks: an Armature with `bpy.ops.object.armature_add` bones placed
   from the part bounds, parent with automatic weights.

Keep every edit in build.py so the version can be rebuilt from BASE_GLB alone.
