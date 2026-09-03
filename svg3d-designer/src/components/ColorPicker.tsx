import { useEffect, useRef, useState } from "react";
import { beginGesture, endGesture, type TrackedSceneSlice } from "../state/store";

interface Hsv {
  h: number; // 0-360
  s: number; // 0-100
  v: number; // 0-100
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(r, g, b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

type ColorFormat = "hex" | "rgb" | "css" | "hsl" | "hsb";

/** A small number field for the RGB/HSL/HSB rows, editable the same way
 * NumberField/HexColorInput are elsewhere: shows the raw typed text while
 * focused so clearing-to-retype isn't fought, commits a parsed, clamped
 * number on every valid keystroke, and reconciles to the real value on
 * blur. */
function MiniNumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="color-picker-mini-input"
      value={draft ?? String(Math.round(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseFloat(raw);
        if (Number.isFinite(n)) onChange(clamp(n, min, max));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** "#f00" / "f00" -> "#ff0000"; already-6-digit input is just lowercased.
 * Returns null for anything that isn't a complete, valid hex color. */
export function normalizeHexColor(raw: string): string | null {
  const s = raw.trim().startsWith("#") ? raw.trim() : `#${raw.trim()}`;
  if (!HEX_COLOR_RE.test(s)) return null;
  if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return s.toLowerCase();
}

/**
 * A Figma-style color picker: click the swatch to open a popover with a
 * saturation/value square, a hue strip, and a format-switchable value field
 * (Hex / RGB / CSS / HSL / HSB) — replacing the OS's native color dialog
 * (which looks and behaves differently on every platform, and whose
 * picking session is only reachable through DOM events, not something we
 * control the layout or feel of). No alpha field: shape colors in this
 * app's data model are plain opaque hex, there's no opacity channel to edit.
 *
 * The whole open-to-close session collapses into ONE undo step, the same
 * pause/mutate/resume gesture pattern used everywhere else a drag needs to
 * be atomic (the range sliders, the old native color input) — see store.ts's
 * beginGesture/endGesture.
 */
export function ColorPickerButton({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => {
    const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [cssDraft, setCssDraft] = useState<string | null>(null);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<TrackedSceneSlice | null>(null);
  const changed = useRef(false);

  const POPOVER_WIDTH = 220;

  function openPicker() {
    const rgb = hexToRgb(value);
    setHsv(rgbToHsv(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0));
    setHexDraft(null);
    setCssDraft(null);
    // Fixed positioning computed from the trigger's own screen position,
    // clamped to the viewport — the swatch can sit anywhere in the
    // sidebar (flush left in the single-shape Color row, further right
    // in the multi-select "apply to all" row), and a popover anchored via
    // plain CSS left/right off its trigger spilled off-screen, or got
    // clipped by the Inspector panel's own scroll clipping, depending on
    // which one.
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      const left = clamp(rect.left, 8, window.innerWidth - POPOVER_WIDTH - 8);
      setPopoverPos({ top: rect.bottom + 6, left });
    }
    setOpen(true);
    gesture.current = beginGesture();
    changed.current = false;
  }

  function closePicker() {
    setOpen(false);
    if (gesture.current) {
      endGesture(gesture.current, changed.current);
      gesture.current = null;
    }
  }

  function apply(next: Hsv) {
    setHsv(next);
    changed.current = true;
    onChange(hsvToHex(next));
  }

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) closePicker();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function dragSv(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    function update(clientX: number, clientY: number) {
      const rect = svRef.current!.getBoundingClientRect();
      const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
      apply({ ...hsv, s, v });
    }
    update(e.clientX, e.clientY);
    function onMove(ev: PointerEvent) {
      update(ev.clientX, ev.clientY);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function dragHue(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    function update(clientX: number) {
      const rect = hueRef.current!.getBoundingClientRect();
      const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
      apply({ ...hsv, h });
    }
    update(e.clientX);
    function onMove(ev: PointerEvent) {
      update(ev.clientX);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const pureHue = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const rgbFloat = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const rgb = { r: Math.round(rgbFloat.r), g: Math.round(rgbFloat.g), b: Math.round(rgbFloat.b) };
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  function setRgb(next: Partial<typeof rgb>) {
    const merged = { ...rgb, ...next };
    apply(rgbToHsv(merged.r, merged.g, merged.b));
  }
  function setHsl(next: Partial<typeof hsl>) {
    const merged = { ...hsl, ...next };
    const nextRgb = hslToRgb(merged.h, merged.s, merged.l);
    apply(rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b));
  }

  return (
    <div className="color-picker-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={className}
        style={{ background: value }}
        onClick={() => (open ? closePicker() : openPicker())}
        aria-label="Color"
      />
      {open && (
        <div
          className="color-picker-popover"
          style={{ top: popoverPos.top, left: popoverPos.left, width: POPOVER_WIDTH }}
        >
          <div
            ref={svRef}
            className="color-picker-sv"
            style={{ background: pureHue }}
            onPointerDown={dragSv}
          >
            <div className="color-picker-sv-white" />
            <div className="color-picker-sv-black" />
            <div
              className="color-picker-sv-thumb"
              style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
            />
          </div>
          <div ref={hueRef} className="color-picker-hue" onPointerDown={dragHue}>
            <div className="color-picker-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <div className="color-picker-hex-row">
            <select
              className="color-picker-format-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as ColorFormat)}
            >
              <option value="hex">Hex</option>
              <option value="rgb">RGB</option>
              <option value="css">CSS</option>
              <option value="hsl">HSL</option>
              <option value="hsb">HSB</option>
            </select>

            {format === "hex" && (
              <input
                className="field-input"
                value={hexDraft ?? value}
                onChange={(e) => {
                  const raw = e.target.value;
                  setHexDraft(raw);
                  const normalized = normalizeHexColor(raw);
                  if (normalized) {
                    const parsed = hexToRgb(normalized)!;
                    apply(rgbToHsv(parsed.r, parsed.g, parsed.b));
                  }
                }}
                onBlur={() => setHexDraft(null)}
              />
            )}

            {format === "rgb" && (
              <div className="color-picker-mini-row">
                <MiniNumberInput value={rgb.r} min={0} max={255} onChange={(r) => setRgb({ r })} />
                <MiniNumberInput value={rgb.g} min={0} max={255} onChange={(g) => setRgb({ g })} />
                <MiniNumberInput value={rgb.b} min={0} max={255} onChange={(b) => setRgb({ b })} />
              </div>
            )}

            {format === "css" && (
              <input
                className="field-input"
                value={cssDraft ?? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCssDraft(raw);
                  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw);
                  if (m) {
                    apply(
                      rgbToHsv(
                        clamp(parseInt(m[1], 10), 0, 255),
                        clamp(parseInt(m[2], 10), 0, 255),
                        clamp(parseInt(m[3], 10), 0, 255),
                      ),
                    );
                  }
                }}
                onBlur={() => setCssDraft(null)}
              />
            )}

            {format === "hsl" && (
              <div className="color-picker-mini-row">
                <MiniNumberInput value={hsl.h} min={0} max={360} onChange={(h) => setHsl({ h })} />
                <MiniNumberInput value={hsl.s} min={0} max={100} onChange={(s) => setHsl({ s })} />
                <MiniNumberInput value={hsl.l} min={0} max={100} onChange={(l) => setHsl({ l })} />
              </div>
            )}

            {format === "hsb" && (
              <div className="color-picker-mini-row">
                <MiniNumberInput value={hsv.h} min={0} max={360} onChange={(h) => apply({ ...hsv, h })} />
                <MiniNumberInput value={hsv.s} min={0} max={100} onChange={(s) => apply({ ...hsv, s })} />
                <MiniNumberInput value={hsv.v} min={0} max={100} onChange={(v) => apply({ ...hsv, v })} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
