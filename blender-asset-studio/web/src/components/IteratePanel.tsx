import { useEffect, useState } from "react";
import { api } from "../api";
import type { Asset, Effort, Health, Version } from "../types";
import EffortPicker from "./EffortPicker";
import ImageDrop from "./ImageDrop";

interface Props {
  asset: Asset;
  version: Version;
  health: Health | null;
  scopedPart: string | null;
  onClearScope: () => void;
  onQueued: (asset: Asset) => void;
}

export default function IteratePanel({ asset, version, health, scopedPart, onClearScope, onQueued }: Props) {
  const [prompt, setPrompt] = useState("");
  const [effort, setEffort] = useState<Effort>("quick");
  const [fromScratch, setFromScratch] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = Math.max(...asset.versions.map((v) => v.n)) + 1;
  const canIterate = version.status === "done";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const submit = async () => {
    if (!prompt.trim() || busy || (!canIterate && !fromScratch)) return;
    setErr(null);
    const fd = new FormData();
    fd.set("prompt", prompt.trim());
    fd.set("effort", effort);
    fd.set("fromScratch", String(fromScratch));
    fd.set("parent", String(version.n));
    if (scopedPart && !fromScratch) fd.set("scopedPart", scopedPart);
    if (file) fd.set("reference", file);
    setBusy(true);
    try {
      const a = await api.iterate(asset.id, fd);
      setPrompt("");
      setFile(null);
      onQueued(a);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head"><span>Iterate on v{version.n}</span></div>
      <p className="muted small">Continues from v{version.n}{version.n === asset.currentVersion ? " (current)" : ""}.</p>
      {scopedPart && !fromScratch && (
        <div className="chip-row">
          <span className="chip">scoped to <b>{scopedPart}</b> <button onClick={onClearScope}>✕</button></span>
        </div>
      )}
      <label>
        What should change?
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={scopedPart ? `Make the ${scopedPart} taller and add a railing…` : "Make the roof terrace bigger, add a blue awning…"}
        />
      </label>
      <details>
        <summary>Reference image <span className="muted">optional, inherits v{version.n}'s</span></summary>
        <ImageDrop file={file} onFile={setFile} />
      </details>
      <label>Effort</label>
      <EffortPicker value={effort} onChange={setEffort} efforts={health?.efforts ?? null} />
      <label className="check">
        <input type="checkbox" checked={fromScratch} onChange={(e) => setFromScratch(e.target.checked)} />
        Start from scratch <span className="muted">ignore earlier scripts and build a new take</span>
      </label>
      {err && <p className="err">{err}</p>}
      {!canIterate && !fromScratch && <p className="muted small">This version is {version.status}; iterate from a finished version or start from scratch.</p>}
      <button className="primary" onClick={submit} disabled={busy || !prompt.trim() || (!canIterate && !fromScratch)}>
        ✦ Generate v{next} <kbd>Ctrl ⏎</kbd>
      </button>
    </section>
  );
}
