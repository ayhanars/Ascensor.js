import { useEffect, useState } from "react";
import type { LogLine } from "./types";

/** Live log for one version over server-sent events. The server replays the full log on connect. */
export function useVersionLog(assetId: string | null, n: number | null): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);
  useEffect(() => {
    setLines([]);
    if (!assetId || n === null) return;
    const es = new EventSource(`/api/assets/${assetId}/versions/${n}/events`);
    es.onopen = () => setLines([]);
    es.onmessage = (ev) => setLines((prev) => [...prev, JSON.parse(ev.data)]);
    return () => es.close();
  }, [assetId, n]);
  return lines;
}

export function useElapsed(since: string | null, running: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
