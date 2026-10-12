import { api } from "../api";
import type { Version } from "../types";

export default function ViewStrip({ assetId, version, active, onPick }: { assetId: string; version: Version; active: string | null; onPick: (rel: string | null) => void }) {
  const items: { rel: string | null; label: string }[] = [{ rel: null, label: "3D model" }];
  (version.files.references?.length ? version.files.references : version.files.reference ? [version.files.reference] : []).forEach((r, i) =>
    items.push({ rel: r, label: i === 0 ? "reference" : `ref ${i + 1}` }),
  );
  for (const v of version.files.views) items.push({ rel: v, label: v.replace("views/", "").replace(".png", "") });
  return (
    <div className="strip">
      {items.map((it) => (
        <button key={it.label} className={"strip-item" + (it.rel === active ? " on" : "")} onClick={() => onPick(it.rel)} title={it.label}>
          <div className="strip-thumb">{it.rel ? <img src={api.fileUrl(assetId, version.n, it.rel)} alt="" /> : <span>⬢</span>}</div>
          <span>{it.label}</span>
        </button>
      ))}
      {version.files.glb && (
        <a className="strip-item dl" href={api.fileUrl(assetId, version.n, version.files.glb)} download={`${assetId}-v${version.n}.glb`}>
          <div className="strip-thumb"><span>⬇</span></div>
          <span>glb</span>
        </a>
      )}
      {version.files.blend && (
        <a className="strip-item dl" href={api.fileUrl(assetId, version.n, version.files.blend)} download={`${assetId}-v${version.n}.blend`}>
          <div className="strip-thumb"><span>⬇</span></div>
          <span>blend</span>
        </a>
      )}
      {version.files.script && (
        <a className="strip-item dl" href={api.fileUrl(assetId, version.n, version.files.script)} target="_blank" rel="noreferrer">
          <div className="strip-thumb"><span>py</span></div>
          <span>script</span>
        </a>
      )}
    </div>
  );
}
