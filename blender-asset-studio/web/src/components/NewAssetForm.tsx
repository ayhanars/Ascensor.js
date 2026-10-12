import { useState } from "react";
import { api } from "../api";
import type { Effort, Health } from "../types";
import EffortPicker from "./EffortPicker";
import ImageDrop from "./ImageDrop";

export default function NewAssetForm({ health, onCreated, onCancel }: { health: Health | null; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [effort, setEffort] = useState<Effort>("standard");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !prompt.trim()) return setErr("Name and description are required.");
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("tags", tags);
    fd.set("prompt", prompt.trim());
    fd.set("effort", effort);
    if (file) fd.set("reference", file);
    setBusy(true);
    try {
      const a = await api.createAsset(fd);
      onCreated(a.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-card">
      <h2>New asset</h2>
      <p className="muted">Drop a reference image and describe what to build. Claude will model it in Blender, compare to the image, and iterate.</p>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner cafe and restaurant" /></label>
      <label>Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="citykit, commercial, mediterranean" /></label>
      <label>Reference image <span className="muted">optional</span></label>
      <ImageDrop file={file} onFile={setFile} />
      <label>
        Description
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A two-storey corner cafe-restaurant: ground floor with big folding glass doors, a front terrace with tables, chairs and umbrellas under a timber pergola, a canvas awning, first floor flat with a balcony. Cream and blue paint. Ground 4 x 6 m."
        />
      </label>
      <label>Effort</label>
      <EffortPicker value={effort} onChange={setEffort} efforts={health?.efforts ?? null} />
      {err && <p className="err">{err}</p>}
      {health && !health.blender.ok && <p className="warn">Blender is not reachable: {health.blender.detail}</p>}
      <div className="row gap">
        <button className="primary" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Generate v1"}</button>
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
