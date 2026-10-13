import { useEffect, useRef, useState } from "react";

interface Props {
  file: File;
  onCrop: (blob: Blob | null) => void;
}

/**
 * Drag a rectangle over the reference to pick the single view the local engine should use
 * (one figure, front view, as little else as possible). No rectangle = the whole image.
 */
export default function CropImage({ file, onCrop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const cv = canvasRef.current!;
      const s = Math.min(1, 560 / img.naturalWidth, 360 / img.naturalHeight);
      setScale(s);
      cv.width = Math.round(img.naturalWidth * s);
      cv.height = Math.round(img.naturalHeight * s);
      setRect(null);
      draw(null);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const draw = (r: typeof rect) => {
    const cv = canvasRef.current, img = imgRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    if (r) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, r.x / scale, r.y / scale, r.w / scale, r.h / scale, r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  };

  const pos = (e: React.PointerEvent) => {
    const b = canvasRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) };
  };

  const finish = (r: typeof rect) => {
    setRect(r);
    draw(r);
    const img = imgRef.current;
    if (!r || !img || r.w < 8 || r.h < 8) return onCrop(null);
    const out = document.createElement("canvas");
    out.width = Math.round(r.w / scale);
    out.height = Math.round(r.h / scale);
    out.getContext("2d")!.drawImage(img, r.x / scale, r.y / scale, out.width, out.height, 0, 0, out.width, out.height);
    out.toBlob((b) => onCrop(b), "image/png");
  };

  return (
    <div className="crop">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          drag.current = pos(e);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = pos(e), d = drag.current;
          draw({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const p = pos(e), d = drag.current;
          drag.current = null;
          finish({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
        }}
      />
      <div className="row gap">
        <span className="muted small">{rect ? `crop ${Math.round(rect.w / scale)} × ${Math.round(rect.h / scale)} px` : "whole image"}</span>
        {rect && <button type="button" className="small" onClick={() => finish(null)}>use whole image</button>}
      </div>
    </div>
  );
}
