import fs from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { config, DETAILS, EFFORTS, MODELS, MATERIALS, type Detail, type Effort, type Materials } from "./config.js";
import { getUsage } from "./usage.js";
import { store } from "./store.js";
import { enqueue, cancel, events, readLog, queueState, finalizeVersion, logLine } from "./jobs.js";
import { executeCode, ping } from "./blender.js";
import { getLive } from "./live.js";
import { tweakCode, RUN_BUILD_CODE } from "./finalize.js";
import type { Asset, Change, Tweak, Version } from "./types.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
export const api = express.Router();

const isEffort = (e: unknown): e is Effort => typeof e === "string" && e in EFFORTS;
const isMaterials = (m: unknown): m is Materials => typeof m === "string" && m in MATERIALS;
const isDetail = (d: unknown): d is Detail => typeof d === "string" && d in DETAILS;
const pickModel = (m: unknown): string => (typeof m === "string" && MODELS.some((x) => x.id === m) ? m : "");
function parseIds(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return raw.split(",").map((x) => x.trim()).filter(Boolean);
  }
}

function parseChanges(raw: unknown, fallbackPart: string | null): Change[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({ text: String(c?.text ?? "").trim(), part: typeof c?.part === "string" && c.part.trim() ? c.part.trim() : fallbackPart }))
      .filter((c) => c.text);
  } catch {
    return [];
  }
}

function newVersion(a: Asset, init: Partial<Version>): Version {
  const n = a.versions.length ? Math.max(...a.versions.map((v) => v.n)) + 1 : 1;
  const v: Version = {
    n,
    status: "queued",
    prompt: "",
    changes: [],
    scopedPart: null,
    requestedModel: "",
    materials: "flat",
    detail: "game",
    textures: [],
    parent: null,
    fromScratch: false,
    effort: "standard",
    hasReference: false,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    costUsd: null,
    turns: null,
    model: null,
    summary: null,
    error: null,
    files: { glb: null, views: [], blend: null, script: null, reference: null, references: [] },
    parts: [],
    tweaks: [],
    triangles: null,
    ...init,
  };
  fs.mkdirSync(store.versionDir(a.id, n), { recursive: true });
  return v;
}

/** Stores uploaded reference images as reference.png, reference_01.png, ... and returns their names. */
function saveReferences(dir: string, files: Express.Multer.File[] | undefined): string[] {
  const names: string[] = [];
  for (const [i, f] of (files ?? []).entries()) {
    // Stable .png names keep the agent prompt simple; Claude's Read tool handles PNG, JPEG and WebP bytes alike.
    const name = i === 0 ? "reference.png" : `reference_${String(i).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(dir, name), f.buffer);
    names.push(name);
  }
  return names;
}

api.get("/health", async (_req, res) => {
  const blender = await ping();
  res.json({
    ok: true,
    blender,
    queue: queueState(),
    efforts: EFFORTS,
    models: MODELS,
    materials: MATERIALS,
    details: DETAILS,
    usage: getUsage(),
    claudeBin: config.claudeBin,
    model: config.claudeModel || "default",
  });
});

api.get("/assets", (_req, res) => {
  const list = store.list().map((a) => ({
    id: a.id,
    name: a.name,
    tags: a.tags,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    currentVersion: a.currentVersion,
    versionCount: a.versions.length,
    status: a.versions.at(-1)?.status ?? "done",
    thumb: thumbOf(a),
  }));
  res.json(list);
});

function thumbOf(a: Asset): string | null {
  const v = a.versions.find((x) => x.n === a.currentVersion) ?? [...a.versions].reverse().find((x) => x.status === "done");
  const hero = v?.files.views.find((f) => f.endsWith("hero.png")) ?? v?.files.views[0];
  return v && hero ? `/files/${a.id}/v${v.n}/${hero}` : null;
}

api.post("/assets", upload.array("references", 8), (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const prompt = String(req.body.prompt ?? "").trim();
  const effort = isEffort(req.body.effort) ? req.body.effort : "standard";
  const materials = isMaterials(req.body.materials) ? req.body.materials : "flat";
  const detail = isDetail(req.body.detail) ? req.body.detail : "game";
  const requestedModel = pickModel(req.body.model);
  const textures = parseIds(req.body.textures);
  const tags = String(req.body.tags ?? "")
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
  if (!name || !prompt) return res.status(400).json({ error: "name and prompt are required" });

  const asset: Asset = {
    id: nanoid(10),
    name,
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: null,
    versions: [],
  };
  const v = newVersion(asset, { prompt, effort, materials, detail, requestedModel, textures });
  v.files.references = saveReferences(store.versionDir(asset.id, v.n), req.files as Express.Multer.File[]);
  v.hasReference = v.files.references.length > 0;
  v.files.reference = v.files.references[0] ?? null;
  asset.versions.push(v);
  store.add(asset);
  enqueue(asset.id, v.n);
  res.status(201).json(asset);
});

api.get("/assets/:id", (req, res) => {
  const a = store.get(req.params.id);
  if (!a) return res.status(404).json({ error: "not found" });
  res.json(a);
});

api.patch("/assets/:id", (req, res) => {
  try {
    const a = store.update(req.params.id, (a) => {
      if (typeof req.body.name === "string" && req.body.name.trim()) a.name = req.body.name.trim();
      if (Array.isArray(req.body.tags)) a.tags = req.body.tags.map(String);
      if (typeof req.body.currentVersion === "number" && a.versions.some((v) => v.n === req.body.currentVersion))
        a.currentVersion = req.body.currentVersion;
    });
    res.json(a);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

api.delete("/assets/:id", (req, res) => {
  const a = store.get(req.params.id);
  if (!a) return res.status(404).json({ error: "not found" });
  for (const v of a.versions) if (v.status === "queued" || v.status === "running") cancel(a.id, v.n);
  store.remove(a.id);
  fs.rmSync(store.assetDir(a.id), { recursive: true, force: true });
  res.json({ ok: true });
});

/**
 * Iterate: one or more change requests on a parent version (or a fresh take).
 * Body: prompt (free text) and/or changes (JSON [{text, part}]), effort, model, materials,
 * parent, fromScratch, chain ("true" = one version per change, each building on the previous).
 */
api.post("/assets/:id/versions", upload.array("references", 8), (req, res) => {
  const a = store.get(req.params.id);
  if (!a) return res.status(404).json({ error: "not found" });
  const effort = isEffort(req.body.effort) ? req.body.effort : "standard";
  const fromScratch = req.body.fromScratch === "true" || req.body.fromScratch === true;
  const chain = req.body.chain === "true" || req.body.chain === true;
  const scopedPart = typeof req.body.scopedPart === "string" && req.body.scopedPart.trim() ? req.body.scopedPart.trim() : null;
  const requestedModel = pickModel(req.body.model);
  const parentN = Number(req.body.parent ?? a.currentVersion);
  const parent = a.versions.find((v) => v.n === parentN);
  const materials = isMaterials(req.body.materials) ? req.body.materials : parent?.materials ?? "flat";
  const detail = isDetail(req.body.detail) ? req.body.detail : parent?.detail ?? "game";
  const textures = typeof req.body.textures === "string" ? parseIds(req.body.textures) : parent?.textures ?? [];

  let changes = parseChanges(req.body.changes, scopedPart);
  const free = String(req.body.prompt ?? "").trim();
  if (!changes.length && free) changes = [{ text: free, part: scopedPart }];
  if (!changes.length) return res.status(400).json({ error: "at least one change request is required" });
  if (!fromScratch && (!parent || parent.status === "failed"))
    return res.status(400).json({ error: "parent version must exist and not have failed" });

  const groups: Change[][] = chain ? changes.map((c) => [c]) : [changes];
  const refs = req.files as Express.Multer.File[];
  const created: number[] = [];
  store.update(a.id, (asset) => {
    let prev = fromScratch ? null : parent!.n;
    for (const group of groups) {
      const v = newVersion(asset, {
        prompt: group.map((c) => (c.part ? `[${c.part}] ` : "") + c.text).join("\n"),
        changes: group,
        scopedPart: group.length === 1 ? group[0].part : null,
        effort,
        fromScratch: fromScratch && created.length === 0,
        parent: prev,
        requestedModel,
        materials,
        detail,
        textures,
      });
      const dir = store.versionDir(asset.id, v.n);
      // new references only on the first version of a chain; later ones inherit from their parent at run time
      if (created.length === 0 && refs?.length) {
        v.files.references = saveReferences(dir, refs);
        v.hasReference = true;
        v.files.reference = v.files.references[0];
      }
      asset.versions.push(v);
      created.push(v.n);
      prev = v.n;
    }
  });
  for (const n of created) enqueue(a.id, n);
  res.status(201).json(store.get(a.id));
});

api.post("/assets/:id/versions/:n/cancel", (req, res) => {
  res.json({ ok: cancel(req.params.id, Number(req.params.n)) });
});

api.get("/assets/:id/versions/:n/log", (req, res) => {
  res.json(readLog(req.params.id, Number(req.params.n)));
});

/** Server-sent events: live log for a version. */
api.get("/assets/:id/versions/:n/events", (req: Request, res: Response) => {
  const k = `${req.params.id}:v${req.params.n}`;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const line of readLog(req.params.id, Number(req.params.n))) res.write(`data: ${JSON.stringify(line)}\n\n`);
  const onLine = (line: unknown) => res.write(`data: ${JSON.stringify(line)}\n\n`);
  events.on(k, onLine);
  const ka = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(ka);
    events.off(k, onLine);
  });
});

/** Latest live vertex sample of the scene while this version is being built (empty when none). */
api.get("/assets/:id/versions/:n/live", (req, res) => {
  res.json(getLive(req.params.id, Number(req.params.n)) ?? { at: null, points: [], objects: 0 });
});

/** Re-load a done version's script into Blender (so tweaks and re-exports target the right scene). */
api.post("/assets/:id/versions/:n/load", async (req, res) => {
  const a = store.get(req.params.id);
  const n = Number(req.params.n);
  const v = a?.versions.find((x) => x.n === n);
  if (!a || !v) return res.status(404).json({ error: "not found" });
  const buildPy = path.join(store.versionDir(a.id, n), "build.py");
  if (!fs.existsSync(buildPy)) return res.status(400).json({ error: "this version has no build.py" });
  try {
    const out = await executeCode(RUN_BUILD_CODE(buildPy), 5 * 60_000);
    if (!out.includes("BUILD_OK")) throw new Error(out.slice(0, 800));
    const tweaks = path.join(store.versionDir(a.id, n), "tweaks.py");
    if (fs.existsSync(tweaks)) await executeCode("import bpy\n" + fs.readFileSync(tweaks, "utf8"), 60_000);
    logLine(a.id, n, "info", "scene re-loaded in Blender from build.py");
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Manual tweak from the viewer inspector: apply in Blender, record, re-export GLB. */
api.post("/assets/:id/versions/:n/tweak", async (req, res) => {
  const a = store.get(req.params.id);
  const n = Number(req.params.n);
  const v = a?.versions.find((x) => x.n === n);
  if (!a || !v) return res.status(404).json({ error: "not found" });
  if (v.status !== "done") return res.status(400).json({ error: "version is not finished" });
  const body = req.body ?? {};
  const object = String(body.object ?? "");
  if (!v.parts.some((p) => p.name === object)) return res.status(400).json({ error: `unknown part "${object}"` });
  const vec = (x: unknown): [number, number, number] | undefined =>
    Array.isArray(x) && x.length === 3 && x.every((k) => typeof k === "number" && Number.isFinite(k))
      ? (x as [number, number, number])
      : undefined;
  const tweak: Tweak = { at: new Date().toISOString(), object };
  const loc = vec(body.location), rot = vec(body.rotation), scl = vec(body.scale), col = vec(body.color);
  if (loc) tweak.location = loc;
  if (rot) tweak.rotation = rot;
  if (scl) tweak.scale = scl;
  if (col) tweak.color = col;
  if (!loc && !rot && !scl && !col) return res.status(400).json({ error: "nothing to change" });

  const code = tweakCode(tweak);
  try {
    if (body.reload) {
      const buildPy = path.join(store.versionDir(a.id, n), "build.py");
      const out = await executeCode(RUN_BUILD_CODE(buildPy), 5 * 60_000);
      if (!out.includes("BUILD_OK")) throw new Error(out.slice(0, 800));
      const tweaks = path.join(store.versionDir(a.id, n), "tweaks.py");
      if (fs.existsSync(tweaks)) await executeCode("import bpy\n" + fs.readFileSync(tweaks, "utf8"), 60_000);
    }
    await executeCode("import bpy\n" + code, 60_000);
    fs.appendFileSync(path.join(store.versionDir(a.id, n), "tweaks.py"), `# ${tweak.at}\n${code}\n\n`);
    store.updateVersion(a.id, n, (x) => x.tweaks.push(tweak));
    logLine(a.id, n, "info", `tweak applied to ${object}`);
    const updated = await finalizeVersion(a.id, n, { render: false });
    res.json(updated);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Re-render turntable views for a version (after tweaks). */
api.post("/assets/:id/versions/:n/render", async (req, res) => {
  try {
    const updated = await finalizeVersion(req.params.id, Number(req.params.n), { render: true });
    res.json(updated);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
