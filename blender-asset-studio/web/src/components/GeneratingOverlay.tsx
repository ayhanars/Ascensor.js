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
  if (t.startsWith("collecting parts")) return "Collecting parts";
  if (t.startsWith("exporting")) return "Exporting the model";
  if (t.startsWith("rendering")) return "Rendering views";
  if (t.startsWith("agent done")) return "Finishing up";
  if (t.startsWith("session")) return "Agent connected to Blender";
  if (last.kind === "text") return "Thinking";
  return "Working";
}

export default function GeneratingOverlay({ version, lines, parentGlbUrl, refUrl }: { version: Version; lines: LogLine[]; parentGlbUrl: string | null; refUrl: string | null }) {
  const elapsed = useElapsed(version.startedAt ?? version.createdAt, true);
  const stage = stageOf(lines, version.status);
  const lastText = [...lines].reverse().find((l) => l.kind === "text" || l.kind === "tool");
  const lastAt = lines.length ? lines[lines.length - 1].t : null;
  const sinceLast = useElapsed(lastAt, true);
  const staleMin = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : 0;
  return (
    <div className="gen-overlay">
      <ParticleScene glbUrl={parentGlbUrl} refUrl={refUrl} />
      {refUrl && (
        <div className="gen-ref" title="The agent reads this image first and matches the model to it">
          <img src={refUrl} alt="reference" />
          <span>matching reference</span>
        </div>
      )}
      <div className="gen-caption">
        <div className="gen-title">
          Building v{version.n}<span className="gen-dots"><i>.</i><i>.</i><i>.</i></span>
        </div>
        <div className="gen-stage">{stage} · {elapsed}{lastAt && <span className="muted"> · last activity {sinceLast} ago</span>}</div>
        {staleMin >= 3 && version.status === "running" && (
          <div className="warn small">No activity for {Math.floor(staleMin)} min. If the Mac slept or Blender stopped answering, the run is stopped automatically after 8 min; you can also cancel it in the Versions panel.</div>
        )}
        {lastText && <div className="gen-last muted">{lastText.text.slice(0, 160)}</div>}
        <div className="gen-hint muted small">Watch Blender to see it happen. This page updates on its own.</div>
      </div>
    </div>
  );
}
