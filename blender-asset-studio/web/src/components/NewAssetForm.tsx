import { useState } from "react";
import { api } from "../api";
import type { Detail, Effort, Health, KitTexture, Materials } from "../types";
import ImageDrop from "./ImageDrop";
import RunOptions from "./RunOptions";

export default function NewAssetForm({ health, kit, onCreated, onCancel }: { health: Health | null; kit: KitTexture[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const [textures, setTextures] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [effort, setEffort] = useState<Effort>("standard");
  const [model, setModel] = useState("");
  const [materials, setMaterials] = useState<Materials>("flat");
  const [detail, setDetail] = useState<Detail>("game");
  const [files, setFiles] = useState<File[]>([]);
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
    fd.set("model", model);
    fd.set("materials", materials);
    fd.set("detail", detail);
    fd.set("textures", JSON.stringify(textures));
    for (const f of files) fd.append("references", f);
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
      <p className="muted">Drop reference images and describe what to build. Claude models it in Blender, compares with the images, and iterates.</p>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner cafe and restaurant" /></label>
      <label>Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="citykit, commercial, mediterranean" /></label>
      <label>Reference images <span className="muted">optional · first = main view, then close-ups</span></label>
      <ImageDrop files={files} onFiles={setFiles} />
      <label>
        Description
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A two-storey corner cafe-restaurant: ground floor with big folding glass doors, a front terrace with tables, chairs and umbrellas under a timber pergola, a canvas awning, first floor flat with a balcony. Cream and blue paint. Ground 4 x 6 m."
        />
      </label>
      <RunOptions health={health} effort={effort} onEffort={setEffort} model={model} onModel={setModel} materials={materials} onMaterials={setMaterials} detail={detail} onDetail={setDetail} kit={kit} textures={textures} onTextures={setTextures} />
      {err && <p className="err">{err}</p>}
      {health && !health.blender.ok && <p className="warn">Blender is not reachable: {health.blender.detail}</p>}
      <div className="row gap" style={{ marginTop: 14 }}>
        <button className="primary block" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "✦ Generate v1"}</button>
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
