import type { AssetSummary } from "../types";

interface Props {
  assets: AssetSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (a: AssetSummary) => void;
  tab: "assets" | "textures";
  onTab: (t: "assets" | "textures") => void;
  textureCount: number;
}

const dot: Record<string, string> = { queued: "dot queued", running: "dot running", done: "dot done", failed: "dot failed" };

export default function AssetList({ assets, selectedId, onSelect, onNew, onDelete, tab, onTab, textureCount }: Props) {
  return (
    <aside className="asset-list">
      <div className="panel-head">
        <span className="tabs">
          <button className={tab === "assets" ? "on" : ""} onClick={() => onTab("assets")}>Assets · {assets.length}</button>
          <button className={tab === "textures" ? "on" : ""} onClick={() => onTab("textures")}>Textures · {textureCount}</button>
        </span>
        <button className="primary small" onClick={onNew}>+ New</button>
      </div>
      <div className="asset-scroll">
        {assets.length === 0 && <p className="muted pad">No assets yet. Create one with an image and a description.</p>}
        {assets.map((a) => (
          <div key={a.id} className={"asset-row" + (a.id === selectedId ? " active" : "")} onClick={() => onSelect(a.id)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(a.id); }}>
            <div className="asset-thumb">{a.thumb ? <img src={a.thumb} alt="" /> : <span>3D</span>}</div>
            <div className="asset-meta">
              <div className="asset-name">
                <span className={dot[a.status] ?? "dot"} /> {a.name}
              </div>
              <div className="muted small">
                v{a.currentVersion ?? "–"} · {a.versionCount} version{a.versionCount === 1 ? "" : "s"}
                {a.tags.length > 0 && " · " + a.tags.map((t) => "#" + t).join(" ")}
              </div>
            </div>
            <button className="asset-del" title={`Delete "${a.name}" and all its versions`} onClick={(e) => { e.stopPropagation(); onDelete(a); }}>🗑</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
