import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src or server/dist -> repo root
export const ROOT_DIR = path.resolve(here, "..", "..");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(ROOT_DIR, "data")),
  webDist: path.join(ROOT_DIR, "web", "dist"),
  agentPromptFile: path.join(ROOT_DIR, "agent", "SYSTEM_PROMPT.md"),
  mcpConfigFile: path.resolve(process.env.MCP_CONFIG ?? path.join(ROOT_DIR, "mcp.json")),
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  claudeModel: process.env.CLAUDE_MODEL ?? "",
  blenderHost: process.env.BLENDER_HOST ?? "127.0.0.1",
  blenderPort: Number(process.env.BLENDER_PORT ?? 9876),
  renderSize: Number(process.env.RENDER_SIZE ?? 768),
  /** A run with no output for this long is killed (a sleeping Mac leaves it hanging otherwise). */
  idleMinutes: Number(process.env.IDLE_MINUTES ?? 8),
};

export type Effort = "quick" | "standard" | "thorough" | "max";
export type Materials = "flat" | "procedural" | "pbr";
export type Detail = "draft" | "game" | "hero";

/** Geometry budget and modeling recipe per run. Turn and time limits scale with it. */
export const DETAILS: Record<Detail, { label: string; maxTriangles: number; turnsFactor: number; minutesFactor: number; blurb: string }> = {
  draft: { label: "Draft", maxTriangles: 5_000, turnsFactor: 0.8, minutesFactor: 0.8, blurb: "Up to 5k triangles. Primitives and simple modifiers, no subdivision. For layout and silhouette checks." },
  game: { label: "Game", maxTriangles: 60_000, turnsFactor: 1.0, minutesFactor: 1.0, blurb: "Up to 60k triangles. Bevels, moderate subdivision, cut-in details. What a game asset needs." },
  hero: { label: "Hero", maxTriangles: 300_000, turnsFactor: 1.5, minutesFactor: 1.6, blurb: "Up to 300k triangles. Subdivision level 2 on organic parts, displacement, dense curves. Slowest." },
};

/** Model aliases the Claude CLI accepts. Empty id = the CLI's default. */
export const MODELS: { id: string; label: string; blurb: string }[] = [
  { id: "", label: "Default", blurb: "Whatever your Claude Code is set to." },
  { id: "fable", label: "Fable", blurb: "Most capable, if your plan includes it. Heaviest on your limits." },
  { id: "opus", label: "Opus", blurb: "Strong spatial reasoning, slower, uses a lot of your limits." },
  { id: "sonnet", label: "Sonnet", blurb: "Good balance for most assets." },
  { id: "haiku", label: "Haiku", blurb: "Fastest and lightest on limits, for simple props and quick drafts." },
];

export const MATERIALS: Record<Materials, { label: string; blurb: string }> = {
  flat: { label: "Flat colors", blurb: "One base color per material. Fastest; what the viewer shows is what Blender has." },
  procedural: { label: "Procedural", blurb: "Node textures (stucco, wood grain, brick, tiles). Shows in the rendered views; the GLB viewer keeps base colors." },
  pbr: { label: "PBR textures", blurb: "Real texture sets from Poly Haven applied in Blender and packed into the GLB. Needs the addon's Poly Haven option on." },
};

export const EFFORTS: Record<
  Effort,
  { passes: string; maxTurns: number; maxMinutes: number; cliEffort: string; blurb: string }
> = {
  quick: {
    passes: "1 to 2",
    maxTurns: 30,
    maxMinutes: 25,
    cliEffort: "medium",
    blurb: "1-2 render passes. One careful pass and a check: fastest and cheapest, for drafts and simple assets.",
  },
  standard: {
    passes: "2 to 3",
    maxTurns: 60,
    maxMinutes: 50,
    cliEffort: "high",
    blurb: "2-3 render passes. Build, compare to the reference, fix the biggest differences.",
  },
  thorough: {
    passes: "4 to 6",
    maxTurns: 110,
    maxMinutes: 100,
    cliEffort: "high",
    blurb: "4-6 render passes. Several compare-and-fix rounds for detailed assets.",
  },
  max: {
    passes: "as many as needed",
    maxTurns: 200,
    maxMinutes: 180,
    cliEffort: "max",
    blurb: "Unbounded passes until the agent is satisfied. Slowest, for hero assets.",
  },
};
