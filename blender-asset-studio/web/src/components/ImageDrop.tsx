import { useEffect, useState } from "react";

/** Drop, paste or pick one or more reference images. The first one is the main view. */
export default function ImageDrop({ files, onFiles, max = 8 }: { files: File[]; onFiles: (f: File[]) => void; max?: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);

  const add = (list: FileList | File[] | undefined | null) => {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) onFiles([...files, ...imgs].slice(0, max));
  };

  return (
    <div
      className={"drop" + (files.length ? " has" : "")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
      onPaste={(e) => add(e.clipboardData.files)}
    >
      {files.length > 0 && (
        <div className="drop-grid">
          {urls.map((u, i) => (
            <div key={u} className="drop-thumb">
              <img src={u} alt={i === 0 ? "main reference" : `reference ${i + 1}`} />
              <span className="drop-tag">{i === 0 ? "main" : i === 1 ? "detail" : `detail ${i}`}</span>
              <button type="button" className="drop-x" onClick={() => onFiles(files.filter((_, k) => k !== i))} title="remove">✕</button>
            </div>
          ))}
        </div>
      )}
      {files.length < max && (
        <label className="drop-label">
          {files.length ? "Add more: " : ""}Drop, paste, or <u>choose</u> image{files.length ? "s" : ""}
          {files.length === 0 && <span className="muted small"> · first = main view, then close-ups of materials and details</span>}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </label>
      )}
    </div>
  );
}
