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
  log("info", "collecting parts");
  const { parts, triangles } = await collectParts();
  log("info", `exporting GLB (${parts.length} parts, ${triangles} triangles)`);
  await exportScene(dir);
  let views: string[] = [];
  if (opts.render) {
    log("info", "rendering views");
    views = await renderViews(dir);
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
  const prompt = buildPrompt({
    versionDir: dir,
    assetName: asset.name,
    description: version.prompt,
    effort: version.effort,
    hasReference: version.hasReference,
    isIteration: !!parent && !version.fromScratch,
    scopedPart: version.scopedPart,
    parentSummary: parent?.summary ?? null,
    parentParts: parent?.parts.map((p) => p.name) ?? [],
  });
  fs.writeFileSync(path.join(dir, "prompt.txt"), prompt);

  const started = Date.now();
  const result = await runClaude({
    cwd: dir,
    prompt,
    effort: version.effort,
    signal: job.controller.signal,
    onLog: (kind, text) => log(kind, text),
  });

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
