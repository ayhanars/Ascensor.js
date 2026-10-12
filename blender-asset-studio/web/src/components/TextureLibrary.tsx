import { useEffect, useState } from "react";
import { api } from "../api";
import type { KitTexture } from "../types";
import { deriveMaps, type DerivedMaps } from "../textureMaps";

/** Your own texture kit: drop a photo, get albedo + normal + roughness, tag it, size it in meters. */
export default function TextureLibrary({ textures, onChanged }: { textures: KitTexture[]; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [maps, setMaps] = useState<DerivedMaps | null>(null);
  const [mirror, setMirror] = useState(true);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [widthM, setWidthM] = useState("1");
  const [heightM, setHeightM] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<"albedo" | "normal" | "roughness">("albedo");
  const [previewUrls, setPreviewUrls] = useState<{ normal: string; roughness: string } | null>(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    setBusy("deriving maps…");
    setErr(null);
    deriveMaps(file, { mirrorTile: mirror })
      .then((m) => {
        if (!alive) return;
        setMaps(m);
        setPreviewUrls({ normal: URL.createObjectURL(m.normal), roughness: URL.createObjectURL(m.roughness) });
        if (!name) setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setBusy(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, mirror]);

  const take = (f: File | undefined | null) => {
    if (f && f.type.startsWith("image/")) setFile(f);
  };

  const save = async () => {
    if (!maps || !name.trim()) return setErr("Drop a photo and give it a name.");
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("tags", tags);
    fd.set("note", note);
    fd.set("widthM", widthM);
    fd.set("heightM", heightM);
    fd.set("seamless", String(mirror));
    fd.set("albedo", maps.albedo, "albedo.png");
    fd.set("normal", maps.normal, "normal.png");
    fd.set("roughness", maps.roughness, "roughness.png");
    setBusy("saving…");
    try {
      await api.createTexture(fd);
      setFile(null);
      setMaps(null);
      setPreviewUrls(null);
      setName("");
      setTags("");
      setNote("");
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (t: KitTexture) => {
    if (!confirm(`Delete texture "${t.name}"?`)) return;
    await api.deleteTexture(t.id);
    onChanged();
  };

  return (
    <div className="tex-page">
      <div className="center-card tex-form">
        <h2>Add to your texture kit</h2>
        <p className="muted">Drop a close-up photo of a surface: stucco, tiles, wood, fabric, stone. The browser derives a normal map and a roughness map from it. Tick "mirror-tile" for photos that are not seamless.</p>
        <div
          className={"drop" + (maps ? " has" : "")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
          onPaste={(e) => take(e.clipboardData.files[0])}
        >
          {maps ? (
            <>
              <img src={preview === "albedo" ? maps.preview : previewUrls?.[preview]} alt={preview} style={{ maxHeight: 260 }} />
              <div className="seg" style={{ width: 260 }}>
                {(["albedo", "normal", "roughness"] as const).map((k) => (
                  <button key={k} type="button" className={preview === k ? "on" : ""} onClick={() => setPreview(k)}>{k}</button>
                ))}
              </div>
              <span className="muted small">{maps.width} × {maps.height} px{mirror ? " · mirror-tiled, seamless" : ""}</span>
              <button type="button" className="small" onClick={() => { setFile(null); setMaps(null); setPreviewUrls(null); }}>remove</button>
            </>
          ) : (
            <label className="drop-label">
              Drop, paste, or <u>choose</u> a photo
              <input type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
          Mirror-tile to make it seamless <span className="muted">doubles the image; patterns mirror at the seams</span>
        </label>
        <div className="two-col">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cream stucco" /></label>
          <label>Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="wall, stucco, mediterranean" /></label>
        </div>
        <div className="two-col">
          <label>Tile width (m)<input type="number" step="0.05" min="0.01" value={widthM} onChange={(e) => setWidthM(e.target.value)} /></label>
          <label>Tile height (m)<input type="number" step="0.05" min="0.01" value={heightM} onChange={(e) => setHeightM(e.target.value)} /></label>
        </div>
        <label>Note for the agent <span className="muted">optional</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Use on all exterior walls; slightly rougher near the ground" /></label>
        {err && <p className="err">{err}</p>}
        <button className="primary" onClick={save} disabled={!!busy || !maps}>{busy ?? "Save to kit"}</button>
      </div>

      <div className="tex-grid">
        {textures.length === 0 && <p className="muted pad">No textures yet. Add a photo above, then tick it in any run's options.</p>}
        {textures.map((t) => (
          <div key={t.id} className="tex-card">
            <div className="tex-thumbs">
              <img src={api.textureUrl(t, "albedo")!} alt="" title="albedo" />
              {t.files.normal && <img src={api.textureUrl(t, "normal")!} alt="" title="normal" />}
              {t.files.roughness && <img src={api.textureUrl(t, "roughness")!} alt="" title="roughness" />}
            </div>
            <div className="asset-name">{t.name}</div>
            <div className="muted small">
              {t.sizeM[0]} × {t.sizeM[1]} m{t.seamless ? " · seamless" : ""}
              {t.tags.length > 0 && " · " + t.tags.map((x) => "#" + x).join(" ")}
            </div>
            {t.note && <div className="muted small ellipsis" title={t.note}>{t.note}</div>}
            <button className="small link" onClick={() => void remove(t)}>delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
