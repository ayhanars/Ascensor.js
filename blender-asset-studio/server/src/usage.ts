/** Latest subscription usage as reported by the Claude CLI's rate_limit_event, kept across restarts. */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Usage } from "./types.js";

const file = () => path.join(config.dataDir, "usage.json");
let current: Usage | null = null;

export function getUsage(): Usage | null {
  if (current) return current;
  try {
    current = JSON.parse(fs.readFileSync(file(), "utf8")) as Usage;
  } catch {
    current = null;
  }
  return current;
}

export function recordRateLimit(info: any): Usage | null {
  const w = info?.unifiedWindows;
  if (!w) return current;
  const win = (x: any) =>
    x && typeof x.utilization === "number" ? { utilization: x.utilization, resetsAt: Number(x.resetsAt) || 0 } : null;
  current = {
    fiveHour: win(w.five_hour),
    sevenDay: win(w.seven_day),
    status: typeof info.status === "string" ? info.status : null,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(current, null, 2));
  } catch {
    /* best effort */
  }
  return current;
}
