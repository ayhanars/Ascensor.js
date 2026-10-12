import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Asset, AssetSummary, Health } from "./types";
import AssetList from "./components/AssetList";
import NewAssetForm from "./components/NewAssetForm";
import Viewer from "./components/Viewer";
import ViewStrip from "./components/ViewStrip";
import IteratePanel from "./components/IteratePanel";
import VersionsPanel from "./components/VersionsPanel";
import Inspector from "./components/Inspector";
import JobLog from "./components/JobLog";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [glbNonce, setGlbNonce] = useState(0);

  const refreshList = useCallback(() => api.listAssets().then(setAssets).catch(() => {}), []);
  const refreshAsset = useCallback(
    (id: string) =>
      api
        .getAsset(id)
        .then((a) => {
          setAsset(a);
          setViewing((cur) => (cur !== null && a.versions.some((v) => v.n === cur) ? cur : a.currentVersion ?? a.versions.at(-1)?.n ?? null));
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void refreshList();
    const h = () => api.health().then(setHealth).catch(() => setHealth(null));
    void h();
    const t = setInterval(h, 10000);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) return setAsset(null);
    void refreshAsset(selectedId);
    setSelectedPart(null);
    setActiveView(null);
  }, [selectedId, refreshAsset]);

  // poll while something is in flight
  const inFlight = asset?.versions.some((v) => v.status === "queued" || v.status === "running") ?? false;
  useEffect(() => {
    if (!selectedId || !inFlight) return;
    const t = setInterval(() => {
      void refreshAsset(selectedId);
      void refreshList();
    }, 3000);
    return () => clearInterval(t);
  }, [selectedId, inFlight, refreshAsset, refreshList]);

  // when the viewed version finishes, bump the GLB nonce so the viewer reloads
  const version = asset?.versions.find((v) => v.n === viewing) ?? null;
  const versionStatus = version?.status;
  useEffect(() => {
    if (versionStatus === "done") setGlbNonce((n) => n + 1);
  }, [versionStatus, viewing]);

  const onCreated = (id: string) => {
    setCreating(false);
    void refreshList();
    setSelectedId(id);
  };

  const rename = async () => {
    if (!asset) return;
    const name = prompt("Asset name", asset.name);
    if (name && name.trim() && name !== asset.name) {
      await api.patchAsset(asset.id, { name: name.trim() });
      void refreshAsset(asset.id);
      void refreshList();
    }
  };

  const remove = async () => {
    if (!asset || !confirm(`Delete "${asset.name}" and all its versions?`)) return;
    await api.deleteAsset(asset.id);
    setSelectedId(null);
    void refreshList();
  };

  const glbUrl = version?.files.glb ? api.fileUrl(asset!.id, version.n, version.files.glb) + `?v=${glbNonce}` : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="cube">⬢</span> Blender Asset Studio</div>
        <div className="topbar-status">
          <span className={"dot " + (health?.blender.ok ? "done" : "failed")} /> Blender {health ? (health.blender.ok ? "connected" : "offline") : "…"}
          {health?.queue.active && <span className="tag running">generating</span>}
          {health && health.queue.queued.length > 0 && <span className="tag">{health.queue.queued.length} queued</span>}
          <span className="muted small">model: {health?.model ?? "?"} · subscription login</span>
        </div>
      </header>
      <div className="body">
        <AssetList assets={assets} selectedId={selectedId} onSelect={(id) => { setCreating(false); setSelectedId(id); }} onNew={() => { setCreating(true); setSelectedId(null); }} />

        {creating && <main className="center"><NewAssetForm health={health} onCreated={onCreated} onCancel={() => setCreating(false)} /></main>}

        {!creating && !asset && (
          <main className="center">
            <div className="center-card empty">
              <h2>Pick an asset or create a new one</h2>
              <p className="muted">Each asset is a Blender script the agent wrote. Versions are edits to that script, so you can refine one part without losing the rest.</p>
              {health && !health.blender.ok && <p className="warn">Blender is not reachable: {health.blender.detail}</p>}
            </div>
          </main>
        )}

        {!creating && asset && version && (
          <>
            <main className="center">
              <div className="asset-head">
                <h1>{asset.name}</h1>
                <span className="tag">3D</span>
                {asset.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                <span className="muted small">{asset.id}</span>
                <span className="spacer" />
                <button className="small" onClick={rename}>Rename</button>
                <button className="small danger" onClick={remove}>Delete</button>
              </div>
              {activeView ? (
                <div className="viewer image-view">
                  <img src={api.fileUrl(asset.id, version.n, activeView)} alt={activeView} />
                </div>
              ) : (
                <Viewer glbUrl={glbUrl} selected={selectedPart} onSelect={setSelectedPart} triangles={version.triangles} />
              )}
              <ViewStrip assetId={asset.id} version={version} active={activeView} onPick={setActiveView} />
              {version.status === "failed" && <p className="err pad">v{version.n} failed: {version.error}</p>}
              {version.summary && (
                <details className="pad">
                  <summary>v{version.n} summary</summary>
                  <pre className="summary">{version.summary}</pre>
                </details>
              )}
            </main>
            <aside className="right">
              <IteratePanel
                asset={asset}
                version={version}
                health={health}
                scopedPart={selectedPart}
                onClearScope={() => setSelectedPart(null)}
                onQueued={(a) => { setAsset(a); setViewing(Math.max(...a.versions.map((v) => v.n))); void refreshList(); }}
              />
              <Inspector
                assetId={asset.id}
                version={version}
                part={version.parts.find((p) => p.name === selectedPart) ?? null}
                onUpdated={(v) => { setAsset({ ...asset, versions: asset.versions.map((x) => (x.n === v.n ? v : x)) }); setGlbNonce((n) => n + 1); }}
              />
              <VersionsPanel asset={asset} viewing={version.n} onView={(n) => { setViewing(n); setSelectedPart(null); setActiveView(null); }} onChanged={() => { void refreshAsset(asset.id); void refreshList(); }} />
              <JobLog assetId={asset.id} n={version.n} live={version.status === "queued" || version.status === "running"} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
