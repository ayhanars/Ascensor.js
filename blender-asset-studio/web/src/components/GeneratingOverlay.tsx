import { useEffect, useState } from "react";
import { useElapsed } from "../hooks";
import type { LogLine, Version } from "../types";
import ParticleScene from "./ParticleScene";

function stageOf(lines: LogLine[], status: Version["status"]): string {
  if (status === "queued") return "Waiting for Blender to be free";
  const last = [...lines].reverse().find((l) => l.kind !== "error");
  if (!last) return "Starting the agent";
  const t = last.text;
  if (last.kind === "tool") {
    if (t.startsWith("Read")) return "Studying the reference";
    if (t.startsWith("Write") || t.startsWith("Edit")) return "Writing the build script";
    if (t.includes("screenshot")) return "Comparing with the reference";
    if (t.includes("polyhaven")) return "Fetching textures";
    if (t.includes("execute")) return "Building in Blender";
    return "Working in Blender";
  }
  if (t.startsWith("engine:")) return "Generating the base mesh with the local engine";
  if (t.startsWith("cleared")) return "Starting the agent";
  if (t.startsWith("collecting parts")) return "Collecting parts";
  if (t.startsWith("exporting")) return "Exporting the model";
  if (t.startsWith("rendering")) return "Rendering views";
  if (t.startsWith("agent done")) return "Finishing up";
  if (t.startsWith("session")) return "Agent connected to Blender";
  if (last.kind === "text") return "Thinking";
  return "Working";
}

interface Props {
  assetId: string;
  version: Version;
  lines: LogLine[];
  refUrl: string | null;
}

export default function GeneratingOverlay({ assetId, version, lines, refUrl }: Props) {
  const elapsed = useElapsed(version.startedAt ?? version.createdAt, true);
  const stage = stageOf(lines, version.status);
  const lastText = [...lines].reverse().find((l) => l.kind === "text" || l.kind === "tool");
  const lastAt = lines.length ? lines[lines.length - 1].t : null;
  const sinceLast = useElapsed(lastAt, true);
  const staleMin = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : 0;

  // live scene sample from Blender (token-free), polled while running
  const [live, setLive] = useState<{ points: number[]; objects: number; at: string | null }>({ points: [], objects: 0, at: null });
  useEffect(() => {
    if (version.status !== "running") return;
    let alive = true;
    const poll = () =>
      fetch(`/api/assets/${assetId}/versions/${version.n}/live`)
        .then((r) => r.json())
        .then((d) => {
          if (alive && d && d.at && d.at !== live.at) setLive(d);
        })
        .catch(() => {});
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, version.n, version.status, live.at]);

  return (
    <div className="gen-overlay">
      <ParticleScene livePoints={live.points.length ? live.points : null} />
      {refUrl && (
        <div className="gen-ref" title="The agent reads this image first and matches the model to it">
          <img src={refUrl} alt="reference" />
          <span>reference in use</span>
        </div>
      )}
      <div className="gen-caption">
        <div className="gen-title">
          {live.objects > 0 ? `Building v${version.n} · ${live.objects} object${live.objects === 1 ? "" : "s"} so far` : `Building v${version.n}`}
          <span className="gen-dots"><i>.</i><i>.</i><i>.</i></span>
        </div>
        <div className="gen-stage">{stage} · {elapsed}{lastAt && <span className="muted"> · last activity {sinceLast} ago</span>}</div>
        {staleMin >= 3 && version.status === "running" && (
          <div className="warn small">No activity for {Math.floor(staleMin)} min. If the Mac slept or Blender stopped answering, the run is stopped automatically after 8 min; you can also cancel it in the Versions panel.</div>
        )}
        {lastText && <div className="gen-last muted">{lastText.text.slice(0, 160)}</div>}
        <div className="gen-hint muted small">{live.objects > 0 ? "The dots are the live Blender scene, sampled every 15 s." : "The dots will take the shape of the model as soon as Blender has geometry."}</div>
      </div>
    </div>
  );
}
