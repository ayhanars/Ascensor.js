/**
 * Runs one headless Claude Code session (`claude -p`) with the Blender MCP server attached.
 * Uses whatever login the CLI already has (your subscription). ANTHROPIC_API_KEY is removed
 * from the child environment on purpose so a stray key never switches billing to the API.
 */
import { spawn } from "node:child_process";
import readline from "node:readline";
import { config, EFFORTS, type Effort } from "./config.js";

export interface ClaudeRunResult {
  ok: boolean;
  resultText: string;
  costUsd: number | null;
  durationMs: number | null;
  turns: number | null;
  model: string | null;
  error: string | null;
}

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  effort: Effort;
  onLog: (kind: "info" | "tool" | "text" | "error", text: string) => void;
  signal?: AbortSignal;
}

// Every tool the Blender MCP server exposes is allowed (both spellings Claude Code accepts for
// "all tools of this server"), so a server with different tool names still works. Bash stays off.
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "ToolSearch", "mcp__blender", "mcp__blender__*"];

export function claudeArgs(opts: { effort: Effort }): string[] {
  const e = EFFORTS[opts.effort];
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    config.mcpConfigFile,
    "--strict-mcp-config",
    "--append-system-prompt-file",
    config.agentPromptFile,
    "--allowedTools",
    ...ALLOWED_TOOLS,
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    String(e.maxTurns),
    "--effort",
    e.cliEffort,
  ];
  if (config.claudeModel) args.push("--model", config.claudeModel);
  return args;
}

function summarizeToolUse(name: string, input: Record<string, unknown>): string {
  const short = name.replace(/^mcp__blender__/, "blender.");
  if (name === "mcp__blender__execute_blender_code") {
    const code = String(input.code ?? "");
    const first = code.split("\n").find((l) => l.trim()) ?? "";
    return `${short}: ${first.slice(0, 120)}${code.length > 120 ? " …" : ""}`;
  }
  if (name === "Write" || name === "Edit" || name === "Read") return `${short}: ${input.file_path ?? ""}`;
  return short;
}

export function runClaude(opts: ClaudeRunOptions): Promise<ClaudeRunResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn(config.claudeBin, claudeArgs(opts), {
      cwd: opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.write(opts.prompt);
    child.stdin.end();

    const out: ClaudeRunResult = {
      ok: false,
      resultText: "",
      costUsd: null,
      durationMs: null,
      turns: null,
      model: null,
      error: null,
    };
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    const abort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", abort, { once: true });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        opts.onLog("info", line);
        return;
      }
      if (ev.type === "system" && ev.subtype === "init") {
        out.model = ev.model ?? null;
        const servers = (ev.mcp_servers ?? []).map((s: any) => `${s.name}:${s.status}`).join(", ");
        opts.onLog("info", `session ${ev.session_id ?? ""} model=${ev.model ?? "?"} mcp=[${servers}]`);
        const blenderTools = (ev.tools ?? []).filter((t: unknown) => typeof t === "string" && t.startsWith("mcp__blender__"));
        if (blenderTools.length) opts.onLog("info", "blender tools: " + blenderTools.map((t: string) => t.replace("mcp__blender__", "")).join(", "));
        const blender = (ev.mcp_servers ?? []).find((s: any) => s.name === "blender");
        if (blender && blender.status !== "connected") {
          opts.onLog("error", `Blender MCP server status: ${blender.status}. Is Blender running with the addon connected?`);
        }
      } else if (ev.type === "assistant") {
        for (const block of ev.message?.content ?? []) {
          if (block.type === "text" && block.text?.trim()) opts.onLog("text", block.text.trim());
          if (block.type === "tool_use") opts.onLog("tool", summarizeToolUse(block.name, block.input ?? {}));
        }
      } else if (ev.type === "user") {
        for (const block of ev.message?.content ?? []) {
          if (block.type === "tool_result" && block.is_error) {
            const c = Array.isArray(block.content)
              ? block.content.map((x: any) => x.text ?? "").join("\n")
              : String(block.content ?? "");
            opts.onLog("error", c.slice(0, 600));
          }
        }
      } else if (ev.type === "result") {
        out.ok = ev.subtype === "success" && !ev.is_error;
        out.resultText = typeof ev.result === "string" ? ev.result : "";
        out.costUsd = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null;
        out.durationMs = typeof ev.duration_ms === "number" ? ev.duration_ms : null;
        out.turns = typeof ev.num_turns === "number" ? ev.num_turns : null;
        if (!out.ok) out.error = ev.result || ev.error || `claude ended with ${ev.subtype}`;
      }
    });

    child.on("error", (e) => {
      out.error = `Could not start "${config.claudeBin}": ${e.message}. Install Claude Code and run "claude login".`;
      resolve(out);
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", abort);
      if (!out.ok && !out.error) {
        out.error = opts.signal?.aborted
          ? "cancelled"
          : `claude exited with code ${code}${stderr ? ": " + stderr.trim().slice(-800) : ""}`;
      }
      resolve(out);
    });
  });
}
