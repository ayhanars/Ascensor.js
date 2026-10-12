import { useEffect, useState } from "react";

export default function ImageDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const take = (f: File | undefined) => {
    if (f && f.type.startsWith("image/")) onFile(f);
  };

  return (
    <div
      className={"drop" + (url ? " has" : "")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files[0]);
      }}
      onPaste={(e) => take(e.clipboardData.files[0])}
    >
      {url ? (
        <>
          <img src={url} alt="reference" />
          <button type="button" className="small" onClick={() => onFile(null)}>remove</button>
        </>
      ) : (
        <label className="drop-label">
          Drop, paste, or <u>choose</u> an image
          <input type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
        </label>
      )}
    </div>
  );
}
