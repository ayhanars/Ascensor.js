/**
 * Runs one headless Claude Code session (`claude -p`) with the Blender MCP server attached.
 * Uses whatever login the CLI already has (your subscription). ANTHROPIC_API_KEY is removed
 * from the child environment on purpose so a stray key never switches billing to the API.
 */
import { spawn } from "node:child_process";
import readline from "node:readline";
import { config, EFFORTS, type Effort } from "./config.js";
import { recordRateLimit } from "./usage.js";

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
  /** CLI model alias or full id; empty = CLI default, falls back to CLAUDE_MODEL env. */
  model?: string;
  onLog: (kind: "info" | "tool" | "text" | "error", text: string) => void;
  signal?: AbortSignal;
}

// Every tool the Blender MCP server exposes is allowed (both spellings Claude Code accepts for
// "all tools of this server"), so a server with different tool names still works. Bash stays off.
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "ToolSearch", "mcp__blender", "mcp__blender__*"];

export function claudeArgs(opts: { effort: Effort; model?: string }): string[] {
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
    // Not offered to the model at all, so it never spends a turn asking for them.
    "--disallowedTools",
    // Blender MCP tools that import or generate outside assets: they break "build.py is the
    // single source of truth" and may call paid services.
    "mcp__blender__generate_3d",
    "mcp__blender__import_asset",
    "mcp__blender__search_assets",
    "mcp__blender__record_trajectory_feedback",
    "mcp__blender__disable_telemetry",
    "Bash",
    "PowerShell",
    "WebFetch",
    "WebSearch",
    "Agent",
    "Task",
    "NotebookEdit",
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    String(e.maxTurns),
    "--effort",
    e.cliEffort,
  ];
  const model = opts.model || config.claudeModel;
  if (model) args.push("--model", model);
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

    // Watchdog: a sleeping Mac or a dead Blender socket leaves the agent waiting forever.
    const startedAt = Date.now();
    let lastActivity = Date.now();
    let killedBy: string | null = null;
    const e = EFFORTS[opts.effort];
    const watchdog = setInterval(() => {
      const idleMin = (Date.now() - lastActivity) / 60000;
      const totalMin = (Date.now() - startedAt) / 60000;
      if (idleMin >= config.idleMinutes) killedBy = `no activity for ${Math.round(idleMin)} minutes (did the Mac sleep, or did Blender stop answering?)`;
      else if (totalMin >= e.maxMinutes) killedBy = `exceeded the ${e.maxMinutes} minute limit for effort "${opts.effort}"`;
      if (killedBy) {
        clearInterval(watchdog);
        opts.onLog("error", `stopping run: ${killedBy}`);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      }
    }, 15000);

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      lastActivity = Date.now();
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
            const denied = /Permission to use (\S+) has been denied/.exec(c);
            opts.onLog("error", denied ? `${denied[1]} is not available to the agent (skipped)` : c.slice(0, 600));
          }
        }
      } else if (ev.type === "rate_limit_event") {
        const u = recordRateLimit(ev.rate_limit_info);
        if (u?.fiveHour && u.sevenDay)
          opts.onLog("info", `usage: 5h ${Math.round(u.fiveHour.utilization * 100)}% · 7d ${Math.round(u.sevenDay.utilization * 100)}%`);
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
      clearInterval(watchdog);
      opts.signal?.removeEventListener("abort", abort);
      if (killedBy) {
        out.ok = false;
        out.error = killedBy;
      } else if (!out.ok && !out.error) {
        out.error = opts.signal?.aborted
          ? "cancelled"
          : `claude exited with code ${code}${stderr ? ": " + stderr.trim().slice(-800) : ""}`;
      }
      resolve(out);
    });
  });
}
