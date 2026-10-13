/**
 * Local base-mesh engine: a command that turns one image into a GLB. Default is the shipped
 * Hunyuan3D runner (engines/hunyuan3d/run.sh). BASE_MESH_CMD overrides it; use {input} and
 * {output} placeholders. Nothing here touches the agent or spends tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { ROOT_DIR } from "./config.js";

const HUNYUAN_DIR = path.join(ROOT_DIR, "engines", "hunyuan3d");
const DEFAULT_CMD = `bash ${JSON.stringify(path.join(HUNYUAN_DIR, "run.sh"))} {input} {output}`;

export interface EngineStatus {
  available: boolean;
  name: string;
  hint: string;
}

export function engineCommand(): string {
  return process.env.BASE_MESH_CMD?.trim() || DEFAULT_CMD;
}

export function engineStatus(): EngineStatus {
  if (process.env.BASE_MESH_CMD?.trim()) {
    return { available: true, name: "custom engine (BASE_MESH_CMD)", hint: process.env.BASE_MESH_CMD.trim() };
  }
  const ready = fs.existsSync(path.join(HUNYUAN_DIR, "venv", "bin", "python")) && fs.existsSync(path.join(HUNYUAN_DIR, "Hunyuan3D-2"));
  return ready
    ? { available: true, name: "Hunyuan3D 2 (local)", hint: "shape only; 3 to 5 minutes per model on an M-series Mac" }
    : { available: false, name: "Hunyuan3D 2 (local)", hint: "not set up yet: run  bash engines/hunyuan3d/setup.sh  once (see engines/hunyuan3d/README.md)" };
}

export function generateBaseMesh(
  inputPng: string,
  outputGlb: string,
  onLog: (text: string) => void,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const cmd = engineCommand().replace("{input}", JSON.stringify(inputPng)).replace("{output}", JSON.stringify(outputGlb));
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", cmd], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`engine exceeded ${Math.round((opts.timeoutMs ?? 0) / 60000)} minutes`));
    }, opts.timeoutMs ?? 40 * 60_000);
    const abort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", abort, { once: true });
    let tail = "";
    for (const stream of [child.stdout, child.stderr]) {
      readline.createInterface({ input: stream }).on("line", (line) => {
        if (!line.trim()) return;
        tail = (tail + "\n" + line).slice(-1200);
        // progress bars and warnings are noisy; keep lines that look like progress
        if (/\[hunyuan3d\]|error|Error|wrote|done|loading|download|%/.test(line)) onLog(line.trim().slice(0, 300));
      });
    }
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`could not start the engine: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
      if (code === 0 && fs.existsSync(outputGlb) && fs.statSync(outputGlb).size > 0) resolve();
      else reject(new Error(`engine exited with code ${code}${tail ? ": " + tail.trim().split("\n").slice(-4).join(" | ") : ""}`));
    });
  });
}
