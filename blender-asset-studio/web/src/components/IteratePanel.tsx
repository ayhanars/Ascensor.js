import { useEffect, useState } from "react";
import { api } from "../api";
import type { Asset, Change, Effort, Health, KitTexture, Materials, Version } from "../types";
import ImageDrop from "./ImageDrop";
import RunOptions from "./RunOptions";

interface Props {
  asset: Asset;
  version: Version;
  health: Health | null;
  kit: KitTexture[];
  selectedPart: string | null;
  onClearPart: () => void;
  onQueued: (asset: Asset) => void;
}

/**
 * Change list: several requests, each optionally scoped to a part. Run as one version (the agent
 * applies all of them together) or as a chain (one version per change, each building on the last).
 */
export default function IteratePanel({ asset, version, health, kit, selectedPart, onClearPart, onQueued }: Props) {
  const [textures, setTextures] = useState<string[]>(version.textures ?? []);
  const [changes, setChanges] = useState<Change[]>([]);
  const [draft, setDraft] = useState("");
  const [draftPart, setDraftPart] = useState<string | null>(null);
  const [chain, setChain] = useState(false);
  const [effort, setEffort] = useState<Effort>("quick");
  const [model, setModel] = useState(version.requestedModel ?? "");
  const [materials, setMaterials] = useState<Materials>(version.materials ?? "flat");
  const [fromScratch, setFromScratch] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // clicking a part in the viewer scopes the draft to it
  useEffect(() => {
    if (selectedPart) setDraftPart(selectedPart);
  }, [selectedPart]);
  useEffect(() => {
    setMaterials(version.materials ?? "flat");
    setModel(version.requestedModel ?? "");
    setTextures(version.textures ?? []);
  }, [version.n, version.materials, version.requestedModel, version.textures]);

  const next = Math.max(...asset.versions.map((v) => v.n)) + 1;
  const canIterate = version.status === "done";
  const pending: Change[] = draft.trim() ? [...changes, { text: draft.trim(), part: fromScratch ? null : draftPart }] : changes;
  const count = pending.length;

  const addChange = () => {
    if (!draft.trim()) return;
    setChanges([...changes, { text: draft.trim(), part: fromScratch ? null : draftPart }]);
    setDraft("");
    setDraftPart(null);
    onClearPart();
  };

  const submit = async () => {
    if (!count || busy || (!canIterate && !fromScratch)) return;
    setErr(null);
    const fd = new FormData();
    fd.set("changes", JSON.stringify(pending));
    fd.set("effort", effort);
    fd.set("model", model);
    fd.set("materials", materials);
    fd.set("textures", JSON.stringify(textures));
    fd.set("fromScratch", String(fromScratch));
    fd.set("chain", String(chain && count > 1));
    fd.set("parent", String(version.n));
    for (const f of files) fd.append("references", f);
    setBusy(true);
    try {
      const a = await api.iterate(asset.id, fd);
      setChanges([]);
      setDraft("");
      setDraftPart(null);
      setFiles([]);
      onClearPart();
      onQueued(a);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const lastN = chain && count > 1 ? next + count - 1 : next;
  const label = chain && count > 1 ? `Generate v${next}–v${lastN}` : `Generate v${next}`;

  return (
    <section className="panel">
      <div className="panel-head"><span>Iterate on v{version.n}</span>{count > 0 && <span className="tag blue">{count} change{count === 1 ? "" : "s"}</span>}</div>
      <p className="muted small">Continues from v{version.n}{version.n === asset.currentVersion ? " (current)" : ""}. Click a part in the viewer to scope a change to it.</p>

      {changes.length > 0 && (
        <ol className="change-list">
          {changes.map((c, i) => (
            <li key={i}>
              {c.part && <span className="chip small">{c.part}</span>}
              <span className="change-text">{c.text}</span>
              <button className="small link" onClick={() => setChanges(changes.filter((_, k) => k !== i))} title="remove">✕</button>
            </li>
          ))}
        </ol>
      )}

      <div className="change-draft">
        {draftPart && !fromScratch && (
          <div className="chip-row">
            <span className="chip">for <b>{draftPart}</b> <button onClick={() => { setDraftPart(null); onClearPart(); }}>✕</button></span>
          </div>
        )}
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={draftPart ? `What should change on ${draftPart}?` : changes.length ? "Another change…" : "What should change? Add one, or several with the + button."}
        />
        <div className="row gap">
          <button className="small" onClick={addChange} disabled={!draft.trim()}>+ Add to list</button>
          {count > 1 && (
            <label className="check small">
              <input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} />
              One version per change
            </label>
          )}
        </div>
      </div>

      <details>
        <summary>Reference images <span className="muted">optional, inherits v{version.n}'s</span></summary>
        <ImageDrop files={files} onFiles={setFiles} />
      </details>
      <RunOptions health={health} effort={effort} onEffort={setEffort} model={model} onModel={setModel} materials={materials} onMaterials={setMaterials} kit={kit} textures={textures} onTextures={setTextures} />
      <label className="check">
        <input type="checkbox" checked={fromScratch} onChange={(e) => setFromScratch(e.target.checked)} />
        Start from scratch <span className="muted">ignore earlier scripts and build a new take</span>
      </label>
      {err && <p className="err">{err}</p>}
      {!canIterate && !fromScratch && <p className="muted small">This version is {version.status}; iterate from a finished version or start from scratch.</p>}
      <button className="primary" onClick={submit} disabled={busy || !count || (!canIterate && !fromScratch)}>
        ✦ {label} <kbd>Ctrl ⏎</kbd>
      </button>
      {chain && count > 1 && <p className="muted small">Each change becomes its own version, built on the one before, so you can compare and roll back step by step.</p>}
    </section>
  );
}
