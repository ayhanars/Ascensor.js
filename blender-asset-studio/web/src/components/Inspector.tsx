import { useEffect, useState } from "react";
import { api } from "../api";
import type { PartInfo, Version } from "../types";

interface Props {
  assetId: string;
  version: Version;
  part: PartInfo | null;
  onUpdated: (v: Version) => void;
}

const toHex = (c: [number, number, number, number] | null) =>
  c ? "#" + c.slice(0, 3).map((x) => Math.round(Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2) * 255).toString(16).padStart(2, "0")).join("") : "#888888";
const fromHex = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2)) as [number, number, number];
const deg = (r: number) => Math.round((r * 180) / Math.PI * 10) / 10;
const rad = (d: number) => (d * Math.PI) / 180;

function Vec3({ label, value, onChange, step = 0.01 }: { label: string; value: [number, number, number]; onChange: (v: [number, number, number]) => void; step?: number }) {
  return (
    <div className="vec3">
      <span>{label}</span>
      {(["x", "y", "z"] as const).map((axis, i) => (
        <input
          key={axis}
          type="number"
          step={step}
          value={value[i]}
          onChange={(e) => {
            const next = [...value] as [number, number, number];
            next[i] = Number(e.target.value);
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

export default function Inspector({ assetId, version, part, onUpdated }: Props) {
  const [loc, setLoc] = useState<[number, number, number]>([0, 0, 0]);
  const [rot, setRot] = useState<[number, number, number]>([0, 0, 0]);
  const [scl, setScl] = useState<[number, number, number]>([1, 1, 1]);
  const [color, setColor] = useState("#888888");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedInBlender, setLoadedInBlender] = useState(false);

  useEffect(() => {
    if (!part) return;
    setLoc(part.location);
    setRot(part.rotation.map(deg) as [number, number, number]);
    setScl(part.scale);
    setColor(toHex(part.color));
    setErr(null);
  }, [part]);

  useEffect(() => setLoadedInBlender(false), [version.n]);

  if (!part) {
    return (
      <section className="panel">
        <div className="panel-head"><span>Inspector</span></div>
        <p className="muted small">Click a part in the viewer to see and edit it. {version.parts.length} parts in this version.</p>
        <div className="part-list">
          {version.parts.map((p) => (
            <span key={p.name} className="chip">{p.name}</span>
          ))}
        </div>
      </section>
    );
  }

  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      const v = await api.tweak(assetId, version.n, {
        object: part.name,
        location: loc,
        rotation: rot.map(rad),
        scale: scl,
        color: fromHex(color),
        reload: !loadedInBlender,
      });
      setLoadedInBlender(true);
      onUpdated(v);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head"><span>Inspector · {part.name}</span></div>
      <p className="muted small">
        {part.type.toLowerCase()} · {part.triangles} tris · {part.dimensions.map((d) => d.toFixed(2)).join(" × ")} m
        {part.material && ` · ${part.material}`}
      </p>
      <Vec3 label="Location (m)" value={loc} onChange={setLoc} />
      <Vec3 label="Rotation (°)" value={rot} onChange={setRot} step={1} />
      <Vec3 label="Scale" value={scl} onChange={setScl} />
      <label className="row gap">
        Base color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      {err && <p className="err">{err}</p>}
      <div className="row gap">
        <button className="primary" onClick={apply} disabled={busy || version.status !== "done"}>{busy ? "Applying in Blender…" : "Apply in Blender"}</button>
        <button onClick={() => { setLoc(part.location); setRot(part.rotation.map(deg) as [number, number, number]); setScl(part.scale); setColor(toHex(part.color)); }} disabled={busy}>Reset</button>
      </div>
      <p className="muted small">
        Applies to the live Blender scene, re-exports the GLB and records the change in tweaks.py so the next version keeps it.
        {!loadedInBlender && " The first apply re-runs this version's build.py in Blender first."}
      </p>
      {version.tweaks.length > 0 && <p className="muted small">{version.tweaks.length} tweak{version.tweaks.length === 1 ? "" : "s"} recorded on v{version.n}.</p>}
    </section>
  );
}
