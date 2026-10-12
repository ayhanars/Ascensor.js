/**
 * Minimal client for the Blender MCP addon's TCP socket (default port 9876).
 * The addon accepts one JSON object per request: {"type": ..., "params": {...}}
 * and answers with {"status": "success", "result": ...} or {"status": "error", "message": ...}.
 * We open a fresh connection per command so we never fight the MCP server for the socket.
 */
import net from "node:net";
import { config } from "./config.js";

export class BlenderError extends Error {}

export async function blenderCommand<T = unknown>(
  type: string,
  params: Record<string, unknown> = {},
  timeoutMs = 10 * 60 * 1000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sock = new net.Socket();
    let buf = "";
    let done = false;
    const finish = (err: Error | null, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      if (err) reject(err);
      else resolve(value as T);
    };
    const timer = setTimeout(
      () => finish(new BlenderError(`Blender did not answer "${type}" within ${timeoutMs / 1000}s`)),
      timeoutMs,
    );

    sock.connect(config.blenderPort, config.blenderHost, () => {
      sock.write(JSON.stringify({ type, params }));
    });
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let parsed: { status: string; result?: T; message?: string };
      try {
        parsed = JSON.parse(buf);
      } catch {
        return; // wait for the rest
      }
      if (parsed.status === "success") finish(null, parsed.result as T);
      else finish(new BlenderError(parsed.message ?? "Blender returned an error"));
    });
    sock.on("error", (e) =>
      finish(
        new BlenderError(
          `Cannot reach Blender at ${config.blenderHost}:${config.blenderPort} (${e.message}). ` +
            `Open Blender, enable the Blender MCP addon and press "Connect to MCP server".`,
        ),
      ),
    );
    sock.on("close", () => {
      if (!done) finish(new BlenderError(`Blender closed the connection while running "${type}"`));
    });
  });
}

export async function executeCode(code: string, timeoutMs?: number): Promise<string> {
  const r = await blenderCommand<{ executed: boolean; result: string }>(
    "execute_code",
    { code },
    timeoutMs,
  );
  return typeof r?.result === "string" ? r.result : JSON.stringify(r);
}

export async function ping(): Promise<{ ok: boolean; detail: string }> {
  try {
    const info = await blenderCommand<{ name?: string; object_count?: number }>("get_scene_info", {}, 5000);
    return { ok: true, detail: `scene "${info?.name ?? "?"}" with ${info?.object_count ?? "?"} objects` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
