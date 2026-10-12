/**
 * Deterministic post-processing run inside Blender after the agent finishes:
 * list parts, export GLB, render turntable views, save a .blend copy.
 * Everything is plain bpy executed over the addon socket, so it never depends
 * on the agent remembering to export.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { executeCode } from "./blender.js";
import type { PartInfo } from "./types.js";

const py = (s: string) => JSON.stringify(s); // safe python string literal

const PARTS_CODE = `
import bpy, json
def _color(obj):
    mat = obj.active_material
    if not mat: return None, None
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                c = n.inputs['Base Color'].default_value
                return [round(c[0],4), round(c[1],4), round(c[2],4), round(c[3],4)], mat.name
    c = mat.diffuse_color
    return [round(c[0],4), round(c[1],4), round(c[2],4), round(c[3],4)], mat.name
parts = []
total_tris = 0
deps = bpy.context.evaluated_depsgraph_get()
for obj in bpy.data.objects:
    if obj.parent is not None: continue
    tris = 0
    if obj.type == 'MESH':
        ev = obj.evaluated_get(deps)
        m = ev.to_mesh()
        m.calc_loop_triangles()
        tris = len(m.loop_triangles)
        ev.to_mesh_clear()
    total_tris += tris
    col, mat = _color(obj)
    parts.append({
        'name': obj.name, 'type': obj.type,
        'location': [round(v,4) for v in obj.location],
        'rotation': [round(v,4) for v in obj.rotation_euler],
        'scale': [round(v,4) for v in obj.scale],
        'dimensions': [round(v,4) for v in obj.dimensions],
        'color': col, 'material': mat, 'triangles': tris,
    })
print('PARTS_JSON:' + json.dumps({'parts': parts, 'triangles': total_tris}))
`;

function exportCode(glbPath: string, blendPath: string): string {
  return `
import bpy
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(
    filepath=${py(glbPath)}, export_format='GLB', export_apply=True,
    export_yup=True, export_materials='EXPORT', use_selection=False,
    export_cameras=False, export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=${py(blendPath)}, copy=True)
print('EXPORT_OK')
`;
}

function renderCode(viewsDir: string, size: number, photoreal: boolean): string {
  return `
import bpy, math
from mathutils import Vector
scene = bpy.context.scene
objs = [o for o in bpy.data.objects if o.type in {'MESH','CURVE','FONT','SURFACE','META'}]
pts = []
for o in objs:
    for c in o.bound_box:
        pts.append(o.matrix_world @ Vector(c))
if not pts:
    pts = [Vector((-1,-1,0)), Vector((1,1,1))]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center = (lo + hi) / 2
radius = max((hi - lo).length / 2, 0.01)

saved = dict(engine=scene.render.engine, rx=scene.render.resolution_x, ry=scene.render.resolution_y,
             pct=scene.render.resolution_percentage, cam=scene.camera, fp=scene.render.filepath,
             fmt=scene.render.image_settings.file_format, film=scene.render.film_transparent)
cam_data = bpy.data.cameras.new('_studio_cam')
cam = bpy.data.objects.new('_studio_cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 50
photoreal = ${photoreal ? "True" : "False"}
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
engine = 'BLENDER_WORKBENCH'
if photoreal:
    for cand in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        if cand in engines:
            engine = cand; break
scene.render.engine = engine
extra = []
if engine == 'BLENDER_WORKBENCH':
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_shadows = True
    sh.show_cavity = True
else:
    if hasattr(scene, 'eevee'):
        try: scene.eevee.taa_render_samples = 24
        except Exception: pass
    sun_data = bpy.data.lights.new('_studio_sun', 'SUN'); sun_data.energy = 4.0; sun_data.angle = 0.2
    sun = bpy.data.objects.new('_studio_sun', sun_data); scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); extra += [sun]
    fill_data = bpy.data.lights.new('_studio_fill', 'SUN'); fill_data.energy = 1.2
    fill = bpy.data.objects.new('_studio_fill', fill_data); scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(60), 0, math.radians(140)); extra += [fill]
    world = scene.world
    if world is None:
        world = bpy.data.worlds.new('_studio_world'); scene.world = world
    saved['world_color'] = tuple(world.color)
    world.color = (0.55, 0.6, 0.7)
scene.render.resolution_x = ${size}
scene.render.resolution_y = ${size}
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True

def shoot(name, azimuth_deg, elev_deg, dist_factor=2.6, target=None):
    az = math.radians(azimuth_deg); el = math.radians(elev_deg)
    t = center if target is None else target
    d = radius * dist_factor
    pos = t + Vector((d*math.cos(el)*math.cos(az), d*math.cos(el)*math.sin(az), d*math.sin(el)))
    cam.location = pos
    direction = t - pos
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = ${py(viewsDir + path.sep)} + name + '.png'
    bpy.ops.render.render(write_still=True)

try:
    shoot('hero', -35, 28)
    for i in range(6):
        shoot('view_%02d' % i, -35 + i*60, 18)
    shoot('top', -90, 89)
    # close-ups so materials and details can be judged
    ext = hi - lo
    shoot('detail_00', -35, 12, 0.9, lo + Vector((ext.x*0.75, ext.y*0.25, ext.z*0.45)))
    shoot('detail_01', 145, 20, 0.9, lo + Vector((ext.x*0.3, ext.y*0.7, ext.z*0.6)))
finally:
    scene.render.engine = saved['engine']; scene.render.resolution_x = saved['rx']
    scene.render.resolution_y = saved['ry']; scene.render.resolution_percentage = saved['pct']
    scene.render.filepath = saved['fp']; scene.render.image_settings.file_format = saved['fmt']
    scene.render.film_transparent = saved['film']; scene.camera = saved['cam']
    bpy.data.objects.remove(cam, do_unlink=True); bpy.data.cameras.remove(cam_data)
    for o in extra:
        data = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.lights.remove(data)
    if 'world_color' in saved and scene.world: scene.world.color = saved['world_color']
print('RENDER_OK')
`;
}

export async function collectParts(): Promise<{ parts: PartInfo[]; triangles: number }> {
  const out = await executeCode(PARTS_CODE, 60_000);
  const line = out.split("\n").find((l) => l.startsWith("PARTS_JSON:"));
  if (!line) throw new Error("Blender did not return part data: " + out.slice(0, 500));
  return JSON.parse(line.slice("PARTS_JSON:".length));
}

export async function exportScene(versionDir: string): Promise<{ glb: string; blend: string }> {
  const glb = path.join(versionDir, "model.glb");
  const blend = path.join(versionDir, "scene.blend");
  const out = await executeCode(exportCode(glb, blend), 5 * 60_000);
  if (!out.includes("EXPORT_OK")) throw new Error("GLB export failed: " + out.slice(0, 500));
  return { glb, blend };
}

export async function renderViews(versionDir: string, photoreal: boolean): Promise<string[]> {
  const viewsDir = path.join(versionDir, "views");
  fs.mkdirSync(viewsDir, { recursive: true });
  const out = await executeCode(renderCode(viewsDir, config.renderSize, photoreal), 20 * 60_000);
  if (!out.includes("RENDER_OK")) throw new Error("Render failed: " + out.slice(0, 500));
  return fs
    .readdirSync(viewsDir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => (a === "hero.png" ? -1 : b === "hero.png" ? 1 : a.localeCompare(b)));
}

/** Python that applies a single viewer tweak to a named object. Also appended to tweaks.py. */
export function tweakCode(t: {
  object: string;
  location?: number[];
  rotation?: number[];
  scale?: number[];
  color?: number[];
}): string {
  const lines = [`obj = bpy.data.objects[${py(t.object)}]`];
  if (t.location) lines.push(`obj.location = (${t.location.join(", ")})`);
  if (t.rotation) lines.push(`obj.rotation_euler = (${t.rotation.join(", ")})`);
  if (t.scale) lines.push(`obj.scale = (${t.scale.join(", ")})`);
  if (t.color) {
    const [r, g, b] = t.color;
    lines.push(
      `mat = obj.active_material`,
      `if mat and mat.use_nodes:`,
      `    for n in mat.node_tree.nodes:`,
      `        if n.type == 'BSDF_PRINCIPLED': n.inputs['Base Color'].default_value = (${r}, ${g}, ${b}, 1.0)`,
      `elif mat: mat.diffuse_color = (${r}, ${g}, ${b}, 1.0)`,
    );
  }
  return lines.join("\n");
}

export const RUN_BUILD_CODE = (buildPy: string) =>
  `import bpy\nexec(compile(open(${py(buildPy)}).read(), "build.py", "exec"))\nprint("BUILD_OK")`;
