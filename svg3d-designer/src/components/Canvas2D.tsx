import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "../state/store";
import { getLayerWorldBounds } from "../state/sceneUtils";
import type { Layer, ShapeRegion } from "../types";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function regionsToPathD(regions: ShapeRegion[]): string {
  let d = "";
  for (const region of regions) {
    d += pointsToD(region.outer.points);
    for (const hole of region.holes) d += pointsToD(hole.points);
  }
  return d;
}

function pointsToD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 1; i < points.length; i++) d += `L ${points[i].x} ${points[i].y} `;
  return d + "Z ";
}

function fitView(width: number, height: number): ViewBox {
  const pad = Math.max(width, height) * 0.15 + 10;
  return { x: -pad, y: -pad, w: width + pad * 2, h: height + pad * 2 };
}

interface Props {
  resetSignal: number;
}

export function Canvas2D({ resetSignal }: Props) {
  const document_ = useSceneStore((s) => s.document);
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);
  const selectLayer = useSceneStore((s) => s.selectLayer);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const showGrid = useSceneStore((s) => s.showGrid);

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>(() => fitView(document_.widthMM, document_.heightMM));
  const [isPanning, setIsPanning] = useState(false);

  const dragState = useRef<{
    mode: "pan" | "move" | null;
    startClientX: number;
    startClientY: number;
    startSvg: { x: number; y: number };
    startVb: ViewBox;
    moved: boolean;
    originals: Record<string, { x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
    setVb(fitView(document_.widthMM, document_.heightMM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    const cursor = clientToSvg(e.clientX, e.clientY);
    setVb((old) => {
      const w = old.w * factor;
      const h = old.h * factor;
      const x = cursor.x - (cursor.x - old.x) * factor;
      const y = cursor.y - (cursor.y - old.y) * factor;
      return { x, y, w, h };
    });
  }

  function beginPan(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: clientToSvg(e.clientX, e.clientY),
      startVb: vb,
      moved: false,
      originals: {},
    };
    setIsPanning(true);
  }

  function beginMove(e: React.PointerEvent, ids: string[]) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const originals: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const layer = layers[id];
      if (layer) originals[id] = { x: layer.transform.x, y: layer.transform.y };
    }
    dragState.current = {
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: clientToSvg(e.clientX, e.clientY),
      startVb: vb,
      moved: false,
      originals,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dxClient = e.clientX - drag.startClientX;
    const dyClient = e.clientY - drag.startClientY;
    if (Math.abs(dxClient) + Math.abs(dyClient) > 2) drag.moved = true;

    if (drag.mode === "pan") {
      const cur = clientToSvg(e.clientX, e.clientY);
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      setVb({ ...drag.startVb, x: drag.startVb.x - dx, y: drag.startVb.y - dy });
    } else if (drag.mode === "move") {
      const cur = clientToSvg(e.clientX, e.clientY);
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      for (const [id, orig] of Object.entries(drag.originals)) {
        setLayerTransform(id, { x: orig.x + dx, y: orig.y + dy });
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragState.current;
    if (drag?.mode === "pan" && !drag.moved) clearSelection();
    dragState.current = null;
    setIsPanning(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function handleShapeDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let nextSelection = selection;
    if (additive) {
      nextSelection = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
      selectLayer(id, true);
    } else if (!selection.includes(id)) {
      nextSelection = [id];
      selectLayer(id, false);
    }
    beginMove(e, nextSelection);
  }

  function renderLayer(id: string): React.ReactNode {
    const layer: Layer | undefined = layers[id];
    if (!layer || !layer.visible) return null;
    const t = layer.transform;
    const transformAttr = `translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})`;

    if (layer.type === "group") {
      return (
        <g key={id} transform={transformAttr}>
          {layer.children.map((c) => renderLayer(c))}
        </g>
      );
    }

    return (
      <g key={id} transform={transformAttr}>
        <path
          d={regionsToPathD(layer.regions)}
          fill={layer.color}
          fillRule="evenodd"
          stroke="none"
          style={{ cursor: layer.locked ? "default" : "move" }}
          onPointerDown={(e) => !layer.locked && handleShapeDown(e, id)}
        />
      </g>
    );
  }

  const gridSize = 10;
  const zoomPct = Math.round((document_.widthMM / vb.w) * 100);

  return (
    <>
      <svg
        ref={svgRef}
        className={"canvas2d" + (isPanning ? " panning" : "")}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (e.target === svgRef.current || (e.target as Element).tagName === "rect") beginPan(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#d8d8d8" strokeWidth={0.15} />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={document_.widthMM}
          height={document_.heightMM}
          fill="#ffffff"
          stroke="#c6c6c6"
          strokeWidth={0.3}
        />
        {showGrid && (
          <rect
            x={0}
            y={0}
            width={document_.widthMM}
            height={document_.heightMM}
            fill="url(#grid)"
            pointerEvents="none"
          />
        )}

        {rootIds.map((id) => renderLayer(id))}

        {selection.map((id) => {
          const b = getLayerWorldBounds(layers, id);
          if (!b) return null;
          return (
            <rect
              key={id}
              className="selection-box"
              x={b.minX}
              y={b.minY}
              width={Math.max(0.01, b.maxX - b.minX)}
              height={Math.max(0.01, b.maxY - b.minY)}
              pointerEvents="none"
            />
          );
        })}
      </svg>
      <div className="canvas-hint">Scroll to zoom · Drag empty space to pan · Click a shape to select, drag to move</div>
      <div className="zoom-indicator">{zoomPct}%</div>
    </>
  );
}
