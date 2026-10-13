/**
 * Live scene sampling: while the agent builds, ask Blender over the addon socket for a sparse
 * sample of the vertices currently in the scene. No agent involved, so it costs no tokens.
 * The viewer morphs its dots into this sample, so the waiting animation shows real progress.
 */
import { executeCode } from "./blender.js";

export interface LiveSample {
  at: string;
  points: number[]; // flat x,y,z in Blender units (Z up)
  objects: number;
}

const SAMPLE_CODE = `
import bpy, json
deps = bpy.context.evaluated_depsgraph_get()
objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.visible_get()]
budget = 3500
pts = []
counts = []
for o in objs:
    try:
        ev = o.evaluated_get(deps); m = ev.to_mesh(); counts.append((ev, m, len(m.vertices)))
    except Exception:
        counts.append((None, None, 0))
total = sum(c[2] for c in counts) or 1
for ev, m, n in counts:
    if not m or n == 0: continue
    k = max(2, int(budget * n / total))
    step = max(1, n // k)
    mw = ev.matrix_world
    for i in range(0, n, step):
        v = mw @ m.vertices[i].co
        pts.extend((round(v.x, 3), round(v.y, 3), round(v.z, 3)))
    ev.to_mesh_clear()
print('LIVE_JSON:' + json.dumps({'points': pts, 'objects': len(objs)}))
`;

const samples = new Map<string, LiveSample>();
const key = (assetId: string, n: number) => `${assetId}:v${n}`;

export function getLive(assetId: string, n: number): LiveSample | null {
  return samples.get(key(assetId, n)) ?? null;
}

export function clearLive(assetId: string, n: number): void {
  samples.delete(key(assetId, n));
}

/** Polls Blender until stop() is called. Errors are ignored: a busy socket just means no update. */
export function startLivePolling(assetId: string, n: number, intervalMs = 15000): () => void {
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const out = await executeCode(SAMPLE_CODE, 20_000);
      const line = out.split("\n").find((l) => l.startsWith("LIVE_JSON:"));
      if (line) {
        const data = JSON.parse(line.slice("LIVE_JSON:".length));
        if (Array.isArray(data.points) && data.points.length >= 6)
          samples.set(key(assetId, n), { at: new Date().toISOString(), points: data.points, objects: data.objects ?? 0 });
      }
    } catch {
      /* Blender busy or unreachable; try again next tick */
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  setTimeout(() => void tick(), 4000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
