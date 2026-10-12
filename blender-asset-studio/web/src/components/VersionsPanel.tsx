import { api } from "../api";
import type { Asset, Version } from "../types";

const fmtCost = (c: number | null) => (c === null ? "" : `$${c.toFixed(2)}`);
const fmtDur = (ms: number | null) => (ms === null ? "" : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function VersionsPanel({ asset, viewing, onView, onChanged }: { asset: Asset; viewing: number; onView: (n: number) => void; onChanged: () => void }) {
  const total = asset.versions.reduce((s, v) => s + (v.costUsd ?? 0), 0);
  const list = [...asset.versions].sort((a, b) => b.n - a.n);
  const setCurrent = async (v: Version) => {
    await api.patchAsset(asset.id, { currentVersion: v.n });
    onChanged();
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <span>Versions · {asset.versions.length}</span>
        <span className="muted small">{fmtCost(total)} total</span>
      </div>
      {list.map((v) => {
        const thumb = v.files.views.find((f) => f.endsWith("hero.png")) ?? v.files.views[0];
        return (
          <div key={v.n} className={"version-row" + (v.n === viewing ? " active" : "")} onClick={() => onView(v.n)}>
            <div className="asset-thumb">{thumb ? <img src={api.fileUrl(asset.id, v.n, thumb)} alt="" /> : <span>v{v.n}</span>}</div>
            <div className="asset-meta">
              <div className="row gap wrap">
                <b>v{v.n}</b>
                {v.n === asset.currentVersion && <span className="tag blue">current</span>}
                <span className={`tag ${v.status}`}>{v.status}</span>
                {v.scopedPart && <span className="tag">{v.scopedPart}</span>}
                <span className="muted small">{ago(v.createdAt)}</span>
              </div>
              <div className="muted small ellipsis" title={v.prompt}>{v.prompt}</div>
              <div className="muted small">
                {[v.parent !== null && !v.fromScratch ? `from v${v.parent}` : "fresh", v.effort, fmtDur(v.durationMs), fmtCost(v.costUsd), v.model ?? ""].filter(Boolean).join(" · ")}
              </div>
              {v.status === "done" && v.n !== asset.currentVersion && (
                <button className="small link" onClick={(e) => { e.stopPropagation(); void setCurrent(v); }}>make current</button>
              )}
              {(v.status === "queued" || v.status === "running") && (
                <button className="small link" onClick={(e) => { e.stopPropagation(); void api.cancel(asset.id, v.n).then(onChanged); }}>cancel</button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
