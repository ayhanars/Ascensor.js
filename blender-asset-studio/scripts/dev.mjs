// Starts the server and the web dev server together and stops both on Ctrl+C.
import { spawn } from "node:child_process";

const procs = [
  ["server", ["run", "dev", "-w", "server"]],
  ["web", ["run", "dev", "-w", "web"]],
].map(([name, args]) => {
  const p = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: "inherit", env: process.env });
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
