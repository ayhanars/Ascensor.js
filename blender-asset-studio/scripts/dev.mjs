// Starts the server and the web dev server together and stops both on Ctrl+C.
import { spawn, spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// On macOS, keep the machine from idle-sleeping while the server runs: a sleeping Mac freezes
// the agent and Blender mid-run. Closing the lid still sleeps unless the Mac is on power.
const caffeinate = process.platform === "darwin" && spawnSync("which", ["caffeinate"]).status === 0;
if (caffeinate) console.log("[dev] caffeinate: the Mac will not idle-sleep while the server runs");

const procs = [
  ["server", caffeinate ? "caffeinate" : npm, caffeinate ? ["-i", npm, "run", "dev", "-w", "server"] : ["run", "dev", "-w", "server"]],
  ["web", npm, ["run", "dev", "-w", "web"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
  p.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    stop();
  });
  return p;
});

function stop() {
  for (const p of procs) if (!p.killed) p.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
