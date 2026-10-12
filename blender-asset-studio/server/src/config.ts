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
};

export type Effort = "quick" | "standard" | "thorough" | "max";

export const EFFORTS: Record<
  Effort,
  { passes: string; maxTurns: number; cliEffort: string; blurb: string }
> = {
  quick: {
    passes: "1 to 2",
    maxTurns: 30,
    cliEffort: "medium",
    blurb: "1-2 render passes. One careful pass and a check: fastest and cheapest, for drafts and simple assets.",
  },
  standard: {
    passes: "2 to 3",
    maxTurns: 60,
    cliEffort: "high",
    blurb: "2-3 render passes. Build, compare to the reference, fix the biggest differences.",
  },
  thorough: {
    passes: "4 to 6",
    maxTurns: 110,
    cliEffort: "high",
    blurb: "4-6 render passes. Several compare-and-fix rounds for detailed assets.",
  },
  max: {
    passes: "as many as needed",
    maxTurns: 200,
    cliEffort: "max",
    blurb: "Unbounded passes until the agent is satisfied. Slowest, for hero assets.",
  },
};
