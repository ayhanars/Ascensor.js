/**
 * Sequential job queue. Blender is a single shared scene, so only one generation
 * runs at a time. Each job: prepare version dir -> run Claude -> finalize in Blender.
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { store } from "./store.js";
import { runClaude } from "./claude.js";
import { buildPrompt } from "./prompts.js";
import { collectParts, exportScene, renderViews } from "./finalize.js";
import { startLivePolling, clearLive } from "./live.js";
import { DETAILS } from "./config.js";
import { executeCode } from "./blender.js";

/** Same reset the agent's build.py starts with, so nothing from an earlier run is shown or kept. */
const SCENE_RESET = `
import bpy
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)
for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.images, bpy.data.lights, bpy.data.cameras):
    for block in list(block_list):
        if block.users == 0:
            block_list.remove(block)
print('RESET_OK')
`;
import type { LogLine, Version } from "./types.js";

interface Job {
  assetId: string;
  n: number;
  controller: AbortController;
}

const queue: Job[] = [];
let active: Job | null = null;
export const events = new EventEmitter();
events.setMaxListeners(100);

const key = (assetId: string, n: number) => `${assetId}:v${n}`;

export function logLine(assetId: string, n: number, kind: LogLine["kind"], text: string): void {
  const line: LogLine = { t: new Date().toISOString(), kind, text };
  const dir = store.versionDir(assetId, n);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "log.jsonl"), JSON.stringify(line) + "\n");
  events.emit(key(assetId, n), line);
}

export function readLog(assetId: string, n: number): LogLine[] {
  try {
    return fs
      .readFileSync(path.join(store.versionDir(assetId, n), "log.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function enqueue(assetId: string, n: number): void {
  queue.push({ assetId, n, controller: new AbortController() });
  logLine(assetId, n, "info", `queued (${queue.length - 1} ahead)`);
  void pump();
}

export function cancel(assetId: string, n: number): boolean {
  const qi = queue.findIndex((j) => j.assetId === assetId && j.n === n);
  if (qi >= 0) {
    queue.splice(qi, 1);
    store.updateVersion(assetId, n, (v) => {
      v.status = "failed";
      v.error = "cancelled before start";
    });
    logLine(assetId, n, "error", "cancelled");
    return true;
  }
  if (active && active.assetId === assetId && active.n === n) {
    active.controller.abort();
    return true;
  }
  return false;
}

export function queueState(): { active: string | null; queued: string[] } {
  return {
    active: active ? key(active.assetId, active.n) : null,
    queued: queue.map((j) => key(j.assetId, j.n)),
  };
}

async function pump(): Promise<void> {
  if (active) return;
  const job = queue.shift();
  if (!job) return;
  active = job;
  try {
    await runJob(job);
  } finally {
    active = null;
    void pump();
  }
}

/** Collect the finished scene regardless of who built it (agent run or manual tweak). */
export async function finalizeVersion(assetId: string, n: number, opts: { render: boolean }): Promise<Version> {
  const dir = store.versionDir(assetId, n);
  const log = (kind: LogLine["kind"], text: string) => logLine(assetId, n, kind, text);
  const materials = store.get(assetId)?.versions.find((v) => v.n === n)?.materials ?? "flat";
  log("info", "collecting parts");
  const { parts, triangles } = await collectParts();
  log("info", `exporting GLB (${parts.length} parts, ${triangles.toLocaleString("en-US")} triangles)`);
  const detail = store.get(assetId)?.versions.find((v) => v.n === n)?.detail ?? "game";
  const budget = DETAILS[detail].maxTriangles;
  if (triangles > budget * 1.25)
    log("error", `over budget: ${triangles.toLocaleString("en-US")} triangles against ${budget.toLocaleString("en-US")} for detail "${detail}" (kept as is; ask for a simplification pass if it matters)`);
  await exportScene(dir);
  let views: string[] = [];
  if (opts.render) {
    log("info", materials === "flat" ? "rendering views" : "rendering views (EEVEE, photoreal)");
    views = await renderViews(dir, materials !== "flat");
  }
  return store.updateVersion(assetId, n, (v) => {
    v.parts = parts;
    v.triangles = triangles;
    v.files.glb = "model.glb";
    v.files.blend = "scene.blend";
    if (fs.existsSync(path.join(dir, "build.py"))) v.files.script = "build.py";
    if (views.length) v.files.views = views.map((f) => `views/${f}`);
  });
}

async function runJob(job: Job): Promise<void> {
  const { assetId, n } = job;
  const asset = store.get(assetId);
  const version = asset?.versions.find((v) => v.n === n);
  if (!asset || !version) return;
  const dir = store.versionDir(assetId, n);
  const log = (kind: LogLine["kind"], text: string) => logLine(assetId, n, kind, text);

  store.updateVersion(assetId, n, (v) => {
    v.status = "running";
    v.startedAt = new Date().toISOString();
  });
  log("info", `starting ${version.parent !== null ? `iteration on v${version.parent}` : "fresh build"} with effort=${version.effort}`);

  const parent = version.parent !== null ? asset.versions.find((v) => v.n === version.parent) : undefined;
  const isIteration = !!parent && !version.fromScratch;
  if (isIteration) {
    // Inherit the parent's script (and its manual tweaks) now, not at enqueue time, so chained
    // versions pick up what the previous one in the chain produced.
    if (parent!.status !== "done") {
      store.updateVersion(assetId, n, (v) => {
        v.status = "failed";
        v.error = `parent v${parent!.n} did not finish (${parent!.status})`;
        v.finishedAt = new Date().toISOString();
      });
      log("error", `parent v${parent!.n} did not finish, skipping`);
      return;
    }
    const pdir = store.versionDir(assetId, parent!.n);
    let script = fs.existsSync(path.join(pdir, "build.py")) ? fs.readFileSync(path.join(pdir, "build.py"), "utf8") : "";
    const tweaks = path.join(pdir, "tweaks.py");
    if (fs.existsSync(tweaks)) script += "\n\n# ---- tweaks.py: manual edits made in the viewer ----\n" + fs.readFileSync(tweaks, "utf8");
    if (script) fs.writeFileSync(path.join(dir, "build.py"), script);
    if (!version.hasReference && parent!.hasReference) {
      for (const r of parent!.files.references) fs.copyFileSync(path.join(pdir, r), path.join(dir, r));
      store.updateVersion(assetId, n, (v) => {
        v.hasReference = true;
        v.files.reference = parent!.files.reference;
        v.files.references = [...parent!.files.references];
      });
    }
  }
  const fresh = store.get(assetId)!.versions.find((v) => v.n === n)!;
  const prompt = buildPrompt({
    versionDir: dir,
    assetName: asset.name,
    description: fresh.prompt,
    changes: fresh.changes,
    effort: fresh.effort,
    materials: fresh.materials,
    detail: fresh.detail ?? "game",
    textures: fresh.textures ?? [],
    references: fresh.files.references,
    isIteration,
    parentSummary: parent?.summary ?? null,
    parentParts: parent?.parts.map((p) => p.name) ?? [],
  });
  fs.writeFileSync(path.join(dir, "prompt.txt"), prompt);

  const started = Date.now();
  clearLive(assetId, n);
  try {
    await executeCode(SCENE_RESET, 60_000);
    log("info", "cleared the Blender scene");
  } catch (e) {
    log("error", `could not clear the Blender scene: ${(e as Error).message}`);
  }
  const stopLive = startLivePolling(assetId, n);
  const result = await runClaude({
    cwd: dir,
    prompt,
    effort: version.effort,
    detail: version.detail ?? "game",
    model: version.requestedModel,
    signal: job.controller.signal,
    onLog: (kind, text) => log(kind, text),
  });
  stopLive();

  if (!result.ok) {
    store.updateVersion(assetId, n, (v) => {
      v.status = "failed";
      v.error = result.error;
      v.finishedAt = new Date().toISOString();
      v.durationMs = Date.now() - started;
      v.costUsd = result.costUsd;
      v.turns = result.turns;
      v.model = result.model;
    });
    log("error", `agent failed: ${result.error}`);
    return;
  }
  log("result", result.resultText || "(no summary)");
  log("info", `agent done in ${Math.round((result.durationMs ?? 0) / 1000)}s, ${result.turns ?? "?"} turns`);

  try {
    await finalizeVersion(assetId, n, { render: true });
    store.updateVersion(assetId, n, (v) => {
      v.status = "done";
      v.summary = result.resultText || null;
      v.finishedAt = new Date().toISOString();
      v.durationMs = Date.now() - started;
      v.costUsd = result.costUsd;
      v.turns = result.turns;
      v.model = result.model;
    });
    store.update(assetId, (a) => {
      a.currentVersion = n;
    });
    log("info", "version ready");
    clearLive(assetId, n);
  } catch (e) {
    const msg = (e as Error).message;
    store.updateVersion(assetId, n, (v) => {
      v.status = "failed";
      v.error = `finalize: ${msg}`;
      v.summary = result.resultText || null;
      v.finishedAt = new Date().toISOString();
      v.durationMs = Date.now() - started;
      v.costUsd = result.costUsd;
      v.turns = result.turns;
      v.model = result.model;
    });
    log("error", `finalize failed: ${msg}`);
  }
}
