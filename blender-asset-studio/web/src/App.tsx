import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Asset, AssetSummary, Health, KitTexture } from "./types";
import TextureLibrary from "./components/TextureLibrary";
import AssetList from "./components/AssetList";
import NewAssetForm from "./components/NewAssetForm";
import Viewer from "./components/Viewer";
import ViewStrip from "./components/ViewStrip";
import IteratePanel from "./components/IteratePanel";
import VersionsPanel from "./components/VersionsPanel";
import Inspector from "./components/Inspector";
import JobLog from "./components/JobLog";
import GeneratingOverlay from "./components/GeneratingOverlay";
import { useVersionLog } from "./hooks";
import UsageMeters from "./components/UsageMeters";

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
  const [tab, setTab] = useState<"assets" | "textures">("assets");
  const [kit, setKit] = useState<KitTexture[]>([]);
  const refreshKit = useCallback(() => api.listTextures().then(setKit).catch(() => {}), []);

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
    void refreshKit();
    const h = () => api.health().then(setHealth).catch(() => setHealth(null));
    void h();
    const t = setInterval(h, 10000);
    return () => clearInterval(t);
  }, [refreshList, refreshKit]);

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
  const versionLive = versionStatus === "queued" || versionStatus === "running";
  const logLines = useVersionLog(asset?.id ?? null, version?.n ?? null);
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

  const removeById = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its versions? This cannot be undone.`)) return;
    await api.deleteAsset(id);
    if (selectedId === id) setSelectedId(null);
    void refreshList();
  };
  const remove = () => asset && removeById(asset.id, asset.name);

  const glbUrl = version?.files.glb ? api.fileUrl(asset!.id, version.n, version.files.glb) + `?v=${glbNonce}` : null;
  const parentVersion = version?.parent !== null && version?.parent !== undefined ? asset?.versions.find((v) => v.n === version.parent) : undefined;
  const parentGlbUrl = parentVersion?.files.glb ? api.fileUrl(asset!.id, parentVersion.n, parentVersion.files.glb) : null;
  const refUrl = version?.files.reference
    ? api.fileUrl(asset!.id, version.n, version.files.reference)
    : parentVersion?.files.reference
      ? api.fileUrl(asset!.id, parentVersion.n, parentVersion.files.reference)
      : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="cube">⬢</span> Blender Asset Studio</div>
        <div className="topbar-status">
          <span className={"dot " + (health?.blender.ok ? "done" : "failed")} /> Blender {health ? (health.blender.ok ? "connected" : "offline") : "…"}
          {health?.queue.active && <span className="tag running">generating</span>}
          {health && health.queue.queued.length > 0 && <span className="tag">{health.queue.queued.length} queued</span>}
          <UsageMeters usage={health?.usage ?? null} />
          <span className="muted small">subscription login</span>
        </div>
      </header>
      <div className="body">
        <AssetList
          assets={assets}
          selectedId={selectedId}
          onSelect={(id) => { setCreating(false); setSelectedId(id); }}
          onNew={() => { setTab("assets"); setCreating(true); setSelectedId(null); }}
          onDelete={(a) => void removeById(a.id, a.name)}
          tab={tab}
          onTab={setTab}
          textureCount={kit.length}
        />

        {tab === "textures" && <main className="center"><TextureLibrary textures={kit} onChanged={() => void refreshKit()} /></main>}

        {tab === "assets" && creating && <main className="center"><NewAssetForm health={health} kit={kit} onCreated={onCreated} onCancel={() => setCreating(false)} /></main>}

        {tab === "assets" && !creating && !asset && (
          <main className="center">
            <div className="center-card empty">
              <h2>Pick an asset or create a new one</h2>
              <p className="muted">Each asset is a Blender script the agent wrote. Versions are edits to that script, so you can refine one part without losing the rest.</p>
              {health && !health.blender.ok && <p className="warn">Blender is not reachable: {health.blender.detail}</p>}
            </div>
          </main>
        )}

        {tab === "assets" && !creating && asset && version && (
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
                <div className="viewer-wrap">
                  <Viewer glbUrl={glbUrl} selected={selectedPart} onSelect={setSelectedPart} triangles={version.triangles} />
                  {versionLive && <GeneratingOverlay version={version} lines={logLines} parentGlbUrl={parentGlbUrl} refUrl={refUrl} />}
                </div>
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
                kit={kit}
                selectedPart={selectedPart}
                onClearPart={() => setSelectedPart(null)}
                onQueued={(a) => { setAsset(a); setViewing(Math.max(...a.versions.map((v) => v.n))); void refreshList(); }}
              />
              <Inspector
                assetId={asset.id}
                version={version}
                part={version.parts.find((p) => p.name === selectedPart) ?? null}
                onUpdated={(v) => { setAsset({ ...asset, versions: asset.versions.map((x) => (x.n === v.n ? v : x)) }); setGlbNonce((n) => n + 1); }}
              />
              <VersionsPanel asset={asset} viewing={version.n} onView={(n) => { setViewing(n); setSelectedPart(null); setActiveView(null); }} onChanged={() => { void refreshAsset(asset.id); void refreshList(); }} />
              <JobLog lines={logLines} live={versionLive} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
