/** `npm run doctor`: checks the Claude CLI login, uvx, and the Blender socket before you spend a run. */
import { execFileSync } from "node:child_process";
import { config } from "./config.js";
import { ping } from "./blender.js";

function tryExec(cmd: string, args: string[]): string | null {
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    return execFileSync(cmd, args, { encoding: "utf8", env, timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const results: [string, boolean, string][] = [];

const cv = tryExec(config.claudeBin, ["--version"]);
results.push(["claude CLI", !!cv, cv ?? `"${config.claudeBin}" not found. Install Claude Code: https://docs.claude.com/en/docs/claude-code`]);

if (cv) {
  const raw = tryExec(config.claudeBin, ["auth", "status"]);
  let ok = false;
  let detail = "run: claude login";
  try {
    const st = JSON.parse(raw ?? "{}") as { loggedIn?: boolean; authMethod?: string };
    ok = !!st.loggedIn;
    detail = ok ? `logged in via ${st.authMethod ?? "?"}` : "not logged in. run: claude login";
  } catch {
    detail = raw ?? detail;
  }
  results.push(["claude login", ok, detail]);
  if (process.env.ANTHROPIC_API_KEY) results.push(["ANTHROPIC_API_KEY", true, "set in this shell; the server strips it so runs stay on your subscription"]);
}

const uv = tryExec("uvx", ["--version"]);
results.push(["uvx (runs blender-mcp)", !!uv, uv ?? "uvx not found. Install uv: https://docs.astral.sh/uv/getting-started/installation/"]);

const b = await ping();
results.push(["Blender MCP addon socket", b.ok, b.detail]);

for (const [name, ok, detail] of results) console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${detail}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);
