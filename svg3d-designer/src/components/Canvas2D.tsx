import { useEffect, useRef, useState } from "react";
import { beginGesture, endGesture, useActivePlateRootIds, useSceneStore, type TrackedSceneSlice } from "../state/store";
import {
  applyTransform2D,
  boundsOverlap,
  getLayerWorldBounds,
  getLocalLayerBounds,
  getMultiLayerWorldBounds,
  getTopLevelId,
  getWorldTransform,
  invertTransform2D,
  isAncestorOrSelf,
  isEffectivelyLocked,
  stepIntoOnClick,
} from "../state/sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import { normalizeToBounds, regularPolygonPoints, starPolygonPoints } from "../geometry/primitives";
import type { Layer, PenAnchor, ShapeRegion, Transform2D } from "../types";
import { InfoIcon } from "./icons";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

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

/** One path-data segment from anchor `a` to anchor `b` — a straight `L`
 * when neither end has a handle, a cubic `C` otherwise. Used only for the
 * in-progress Pen tool draft preview; the finished shape's own points are
 * already flattened (see flattenPenAnchors) before they ever become a
 * ShapeLayer, so nothing downstream of that needs this. */
function penSegmentD(a: PenAnchor, b: PenAnchor): string {
  if (!a.handleOut && !b.handleIn) return `L ${b.x} ${b.y} `;
  const c1 = a.handleOut ?? { x: a.x, y: a.y };
  const c2 = b.handleIn ?? { x: b.x, y: b.y };
  return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y} `;
}

function fitView(width: number, height: number): ViewBox {
  const pad = Math.max(width, height) * 0.15 + 10;
  return { x: -pad, y: -pad, w: width + pad * 2, h: height + pad * 2 };
}

// Wheel/pinch zoom: multiplies deltaY into an exponential zoom factor. The
// old 0.001 needed several full pinch gestures or wheel notches to move
// the zoom level at all — this makes a single mouse-wheel notch (~deltaY
// 100) and a trackpad pinch both give a clearly visible step.
const ZOOM_SENSITIVITY = 0.003;
// Discrete zoom step for keyboard shortcuts (Z / Option+Z, +/-) — a single
// keypress should read as one clear zoom level change, like a zoom button.
const ZOOM_KEY_FACTOR = 1.4;
// How far the selection outline sits outside a shape's own edge — see the
// comment where it's used for why this can't just be 0.
const SELECTION_OUTLINE_MARGIN_MM = 0.6;

/** Never let a resize handle drag scale a shape down to (or past) zero —
 * that flips into negative scale, which corrupts triangle winding on
 * export (see extrude.ts's own comment on why scale is never negative). */
const MIN_RESIZE_SCALE = 0.02;

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Rotates a 2D vector by `deg`, matching the exact convention SVG's own
 * `rotate()` transform uses (a standard rotation matrix applied in this
 * app's Y-down document space) — so this can invert or replay that same
 * rotation when converting between world and local space during a resize
 * drag. */
function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Maps a point in a shape's own local (unscaled) coordinate space to
 * document/world space, mirroring exactly what `renderLayer`'s
 * `translate(...) rotate(...) scale(...)` attribute does — scale first,
 * then rotate, then translate. */
function localToWorld(local: { x: number; y: number }, t: Transform2D): { x: number; y: number } {
  const scaled = rotateVec(local.x * t.scaleX, local.y * t.scaleY, t.rotation);
  return { x: scaled.x + t.x, y: scaled.y + t.y };
}

interface Props {
  resetSignal: number;
}

export function Canvas2D({ resetSignal }: Props) {
  const document_ = useSceneStore((s) => s.document);
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useActivePlateRootIds();
  const selection = useSceneStore((s) => s.selection);
  const selectLayer = useSceneStore((s) => s.selectLayer);
  const setSelection = useSceneStore((s) => s.setSelection);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const showGrid = useSceneStore((s) => s.showGrid);
  const penToolActive = useSceneStore((s) => s.penToolActive);
  const penDraftAnchors = useSceneStore((s) => s.penDraftAnchors);
  const addPenAnchor = useSceneStore((s) => s.addPenAnchor);
  const finishPenTool = useSceneStore((s) => s.finishPenTool);
  const updatePenAnchorPosition = useSceneStore((s) => s.updatePenAnchorPosition);
  const updatePenAnchorHandle = useSceneStore((s) => s.updatePenAnchorHandle);
  const editingPenShapeId = useSceneStore((s) => s.editingPenShapeId);
  const beginEditPenShape = useSceneStore((s) => s.beginEditPenShape);
  const endEditPenShape = useSceneStore((s) => s.endEditPenShape);
  const updatePenShapeAnchorPosition = useSceneStore((s) => s.updatePenShapeAnchorPosition);
  const updatePenShapeAnchorHandle = useSceneStore((s) => s.updatePenShapeAnchorHandle);
  const setPenShapeAnchorType = useSceneStore((s) => s.setPenShapeAnchorType);
  const deletePenShapeAnchor = useSceneStore((s) => s.deletePenShapeAnchor);
  const addImageLayer = useSceneStore((s) => s.addImageLayer);
  const cutToolActive = useSceneStore((s) => s.cutToolActive);
  const cutShapesByLine = useSceneStore((s) => s.cutShapesByLine);
  const shapeToolActive = useSceneStore((s) => s.shapeToolActive);
  const setShapeToolActive = useSceneStore((s) => s.setShapeToolActive);
  const createShapeLayerAt = useSceneStore((s) => s.createShapeLayerAt);

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>(() => fitView(document_.widthMM, document_.heightMM));
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<ViewBox | null>(null);
  const [showHint, setShowHint] = useState(false);
  // Live cursor position in document (mm) space while the pen tool is
  // armed — drives the rubber-band preview line from the last placed point
  // to wherever the pointer currently is, the same live-preview feedback
  // Figma's own pen tool gives before you've clicked the next point.
  const [penHoverPoint, setPenHoverPoint] = useState<{ x: number; y: number } | null>(null);
  // A real bezier pen gesture, in progress between pointerdown and
  // pointerup: `anchorPoint` is where the new anchor will land (or, when
  // closing, the existing first anchor's own position), `closing` is set
  // if this gesture will finish the path rather than extend it. Committed
  // to the store's anchor list (or handed to finishPenTool) only on
  // pointerup, once it's known whether the gesture was a plain click (a
  // straight "corner" anchor) or a click-and-drag (a curved "smooth" one)
  // — matches Illustrator/Figma/Photoshop's own pen tool exactly.
  const penGestureRef = useRef<{ anchorPoint: { x: number; y: number }; closing: boolean; moved: boolean } | null>(
    null,
  );
  // Live drag position for the handle currently being pulled out, while a
  // pen gesture from penGestureRef is in progress — drives the handle-line
  // preview render. Separate from penHoverPoint, which only applies
  // between gestures (idle rubber-band to the next click).
  const [penDragPoint, setPenDragPoint] = useState<{ x: number; y: number } | null>(null);
  // The Cut tool's in-progress knife line, in document (mm) space — set on
  // pointerdown while cutToolActive, updated on every pointermove, and
  // resolved into an actual cutShapesByLine call (or discarded, if it
  // never really moved) on pointerup.
  const cutGestureRef = useRef<{ start: { x: number; y: number }; moved: boolean } | null>(null);
  const [cutLine, setCutLine] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(
    null,
  );
  // The shape tool's in-progress drag-to-draw box, in document (mm) space
  // — set on pointerdown while shapeToolActive, updated on every
  // pointermove (Shift constrains it to a square/circle), and resolved
  // into an actual createShapeLayerAt call on pointerup. A gesture that
  // never really moved (a plain click) still creates a shape, at a
  // default size centered on the click point, rather than doing nothing.
  const shapeGestureRef = useRef<{ start: { x: number; y: number }; moved: boolean } | null>(null);
  const [shapeDrawBounds, setShapeDrawBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  // Dragging the LAST placed anchor's own dot (to reposition it) or one of
  // its handles (to reshape the curve on either side of it) — the "go back
  // and adjust the arc you just drew" gesture, distinct from penGestureRef
  // above (which only ever places a NEW anchor). Only the last anchor is
  // ever adjustable this way: any earlier one's dot can sit exactly where
  // a "click to close the path" gesture also hit-tests once there are
  // enough anchors to close at all, and real pen tools don't let you drag
  // older anchors around either — that's what the Direct Selection tool is
  // for. Unlike penGestureRef, this writes straight to the store on every
  // move (the anchor's already a committed part of the draft, not a
  // not-yet-real point still being decided), so the render just reads
  // penDraftAnchors directly — no separate live-preview state needed.
  const penAdjustRef = useRef<{ index: number; kind: "anchor" | "handleIn" | "handleOut" } | null>(null);
  useEffect(() => {
    if (!penToolActive) {
      setPenHoverPoint(null);
      setPenDragPoint(null);
      penGestureRef.current = null;
      penAdjustRef.current = null;
    }
  }, [penToolActive]);
  // Ctrl/Cmd held while the Pen tool is armed temporarily switches to
  // direct-selection behavior — every already-placed anchor (not just the
  // last one) and its handles become draggable, the same "manipulate
  // existing points without leaving the Pen tool" passthrough Illustrator/
  // Figma give. Released (or the window loses focus) reverts to the
  // ordinary draw-only behavior where only the last anchor is adjustable.
  const [penCtrlHeld, setPenCtrlHeld] = useState(false);
  useEffect(() => {
    if (!penToolActive) {
      setPenCtrlHeld(false);
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") setPenCtrlHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") setPenCtrlHeld(false);
    }
    function onBlur() {
      setPenCtrlHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [penToolActive]);
  // A drag on one of Edit Path mode's own anchors/handles — mirrors
  // penAdjustRef above, but against a FINISHED shape's persistent
  // penAnchors (via updatePenShapeAnchorPosition/Handle) rather than the
  // in-progress draft, and undo-tracked per gesture (see beginGesture/
  // endGesture) since every one of those edits is a real, trackable
  // change to the layer, unlike drafting a not-yet-committed path.
  const editPenAdjustRef = useRef<{
    shapeId: string;
    index: number;
    kind: "anchor" | "handleIn" | "handleOut";
    preGestureSnapshot: TrackedSceneSlice;
    moved: boolean;
  } | null>(null);
  // Leaving Edit Path mode whenever the edited shape stops being the
  // selection (clicking elsewhere, clearing selection, Escape already
  // handled explicitly in App.tsx) keeps this mode from lingering silently
  // once the user has clearly moved on to something else.
  useEffect(() => {
    if (editingPenShapeId && !selection.includes(editingPenShapeId)) endEditPenShape();
  }, [selection, editingPenShapeId, endEditPenShape]);
  // Smart alignment guides: while dragging shapes, a dashed line highlights
  // any edge/center that lines up with another shape's, so you can actually
  // see the alignment happen instead of eyeballing it against the (visually
  // very similar) selection outline.
  const [alignGuides, setAlignGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHint) return;
    function onDocDown(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) setShowHint(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowHint(false);
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showHint]);

  const dragState = useRef<{
    mode: "pan" | "move" | "marquee" | null;
    startClientX: number;
    startClientY: number;
    startSvg: { x: number; y: number };
    startVb: ViewBox;
    moved: boolean;
    originals: Record<string, { x: number; y: number }>;
    preGestureSnapshot: TrackedSceneSlice | null;
    /** Marquee only: shift/cmd/ctrl held at drag start — adds to the
     * existing selection instead of replacing it, matching how a single
     * shift-click already behaves. */
    additive: boolean;
    /** move only: set when the click landed within the already-selected
     * group/shape — the gesture keeps the current selection (so if it
     * turns into a drag, the whole thing moves together, unchanged) and
     * only resolves as a "step one level deeper" click if pointerup finds
     * the pointer never actually moved. Without this, a click that landed
     * on a group's member would drill in immediately even when it was
     * really the start of a drag. */
    pendingDrillRawId: string | null;
  } | null>(null);

  // A resize-handle drag is kept entirely separate from dragState above
  // (pan/move/marquee) rather than folded into that union — its shape is
  // different enough (an anchor point that must stay fixed in world space,
  // which axes are actually being resized, the shape's own local bounds)
  // that sharing one type would mean every other mode carrying fields it
  // never uses.
  const resizeState = useRef<{
    id: string;
    handle: ResizeHandle;
    origTransform: Transform2D;
    /** The local-space point that must stay at the same world position
     * throughout the drag — the opposite corner/edge from the one being
     * dragged. */
    anchorLocal: { x: number; y: number };
    /** anchorWorld computed once at drag start from origTransform — the
     * fixed point every subsequent frame solves a new transform around. */
    anchorWorld: { x: number; y: number };
    /** handleLocal - anchorLocal, in local (unscaled) space — fixed for
     * the whole drag; only ever nonzero on the axis/axes this handle
     * actually resizes. */
    dLocal: { x: number; y: number };
    resizesX: boolean;
    resizesY: boolean;
    /** Original scaleY/scaleX ratio — held while Shift is down during a
     * corner-handle drag so a reference image resizes proportionally
     * instead of stretching, matching Figma/Photoshop's Shift-resize. */
    aspectRatio: number;
    preGestureSnapshot: TrackedSceneSlice;
    moved: boolean;
  } | null>(null);

  // Space+drag pans, matching the 3D viewport's own convention — plain
  // drag on empty canvas is reserved for marquee-select instead.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isEditableTarget(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    setVb(fitView(document_.widthMM, document_.heightMM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // A raw phone-camera JPG/PNG can easily be several MB — and the whole
  // project (this image included) autosaves as one JSON blob into
  // localStorage, which has only a ~5-10MB origin quota shared by every
  // saved project. Embedding the source file as-is risks silently
  // breaking autosave for the entire project, not just this image. Down-
  // scaling to a still-plenty-sharp-for-tracing size before it ever
  // becomes a data URL keeps a reference image from being able to do that.
  const REFERENCE_IMAGE_MAX_DIMENSION = 1600;

  // Dropping a JPG/PNG onto the canvas adds it as a 2D-only reference
  // layer (see addImageLayer/ImageLayer) — a tracing aid the 3D preview
  // and every exporter simply never sees. Handled here rather than at the
  // app-level file-drop handler (which is SVG-import-only) so the drop
  // lands at the exact point the cursor released, in document mm.
  function handleImageDrop(e: React.DragEvent) {
    const file = Array.from(e.dataTransfer.files).find((f) => /^image\/(png|jpe?g)$/i.test(f.type));
    if (!file) return false;
    e.preventDefault();
    // Deliberately NOT stopPropagation()'d: the app-level drop handler
    // owns the "Drop SVG/image to import" overlay's on/off state
    // (dragCounter/isDragOver) and only resets it from its own onDrop —
    // stopping the event here left that overlay stuck on screen after
    // every successful image drop. App's own onDrop already knows to
    // treat an image file as "handled here, nothing further to do"
    // rather than showing its SVG-only error for it.
    const center = clientToSvg(e.clientX, e.clientY);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const naturalWidth = img.naturalWidth || 1;
      const naturalHeight = img.naturalHeight || 1;
      const scale = Math.min(1, REFERENCE_IMAGE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // PNG stays lossless (reference images are often screenshots/line
      // art where JPEG artifacting would hurt); anything else compresses
      // as JPEG, which is far smaller for a photo.
      const isPng = file.type === "image/png";
      const src = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.85);
      addImageLayer({
        src,
        naturalWidth,
        naturalHeight,
        name: file.name.replace(/\.[^.]+$/, "") || "Reference Image",
        center,
      });
    };
    img.src = objectUrl;
    return true;
  }

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

  function zoomAround(center: { x: number; y: number }, factor: number) {
    setVb((old) => ({
      w: old.w * factor,
      h: old.h * factor,
      x: center.x - (center.x - old.x) * factor,
      y: center.y - (center.y - old.y) * factor,
    }));
  }

  // +/- mirror the universal browser-zoom convention (viewport-centered,
  // repeat allowed — holding the key zooms continuously, same as a
  // browser's own Cmd/Ctrl +/-). Cmd/Ctrl+0 resets to a true 100%.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        const v = vbRef.current;
        zoomAround(
          { x: document_.widthMM / 2, y: document_.heightMM / 2 },
          document_.widthMM / v.w,
        );
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      // A factor < 1 shrinks the viewBox, i.e. zooms IN (higher zoom%).
      let factor = 0;
      if (e.key === "+" || e.key === "=") factor = 1 / ZOOM_KEY_FACTOR;
      else if (e.key === "-" || e.key === "_") factor = ZOOM_KEY_FACTOR;
      if (!factor) return;
      e.preventDefault();
      const v = vbRef.current;
      zoomAround({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, factor);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document_.widthMM, document_.heightMM]);

  // Figma's zoom tool: holding Z (Option/Alt+Z for zoom-out) swaps the
  // cursor to a magnifying glass and does nothing by itself — a *click* on
  // the artboard while it's held zooms one step centered on exactly where
  // you clicked. This used to be an instant zoom fired straight off the Z
  // keydown, with no e.repeat guard: holding the key let the OS's own key
  // -repeat fire dozens of keydowns a second, each compounding the zoom
  // factor multiplicatively into an unusable runaway zoom in under a
  // second — which is what "zooms enormously" was.
  const [zoomToolArmed, setZoomToolArmed] = useState(false);
  const [zoomToolOut, setZoomToolOut] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // e.code, not e.key: with Option/Alt held, macOS remaps the letter
      // "z" produces (e.g. to "Ω") — matching on e.key meant that once the
      // user pressed Option to zoom out, the keyup for the Z key no longer
      // matched "z"/"Z" at all, so it never cleared zoomToolArmed and the
      // magnifier cursor + zoom-on-click stuck on permanently. e.code is
      // the physical key and is immune to modifier remapping (same reason
      // Space is matched by e.code elsewhere in this file).
      if (e.code === "KeyZ" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZoomToolArmed(true);
      }
      if (e.key === "Alt") setZoomToolOut(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "KeyZ") setZoomToolArmed(false);
      if (e.key === "Alt") setZoomToolOut(false);
    }
    // Losing focus mid-hold (e.g. Alt-tabbing away) would otherwise leave
    // the tool stuck armed with no keyup ever coming.
    function onBlur() {
      setZoomToolArmed(false);
      setZoomToolOut(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /** Handles a click while the zoom tool is armed; returns whether it did
   * (callers should skip their normal select/pan/move handling if so). */
  function tryZoomToolClick(e: React.PointerEvent): boolean {
    if (!zoomToolArmed) return false;
    // Without this, a click that lands on a shape (rather than empty
    // background) bubbles from the shape's own onPointerDown up to the
    // svg's, and both handlers call this — applying the zoom TWICE for
    // one click.
    e.stopPropagation();
    zoomAround(clientToSvg(e.clientX, e.clientY), zoomToolOut ? ZOOM_KEY_FACTOR : 1 / ZOOM_KEY_FACTOR);
    return true;
  }

  /** A gesture starting this close (in real screen pixels, not document mm
   * — so it feels the same at any zoom level) to the path's own first
   * anchor closes it, the same "click back on the start" convention every
   * vector pen tool uses. */
  const PEN_CLOSE_THRESHOLD_PX = 10;
  /** Below this much real on-screen movement, a pen gesture reads as a
   * plain click (a straight "corner" anchor) rather than a drag (a curved
   * "smooth" one) — matches the small dead-zone every other drag-vs-click
   * gesture in this file already uses, just named for this one. */
  const PEN_DRAG_THRESHOLD_PX = 3;

  function svgPointToClient(p: { x: number; y: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = p.x;
    pt.y = p.y;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const t = pt.matrixTransform(ctm);
    return { x: t.x, y: t.y };
  }

  /** Reflects `handle` through `anchor` — the symmetric-handle convention
   * every pen tool uses when you drag a smooth anchor: the incoming and
   * outgoing tangents point in exactly opposite directions, so the curve
   * stays smooth (no visible kink) through that anchor. */
  function mirrorPoint(anchor: { x: number; y: number }, handle: { x: number; y: number }): { x: number; y: number } {
    return { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y };
  }

  /** Shift-constrain: rounds the angle from `from` to `to` to the nearest
   * `stepDeg` (45° by default — corner/handle placement in every vector
   * tool), keeping the same distance. Used for both a new anchor's
   * position relative to the previous one AND a handle's direction
   * relative to its own anchor, so Shift means the same thing whether
   * you're placing a point or pulling a curve out of it. */
  function snapAngle(
    from: { x: number; y: number },
    to: { x: number; y: number },
    stepDeg = 45,
  ): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) return to;
    const angle = Math.atan2(dy, dx);
    const stepRad = (stepDeg * Math.PI) / 180;
    const snapped = Math.round(angle / stepRad) * stepRad;
    return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
  }

  /** Starts a pen-tool gesture on pointerdown; returns whether it did
   * (callers should skip their normal select/pan/move handling if so) —
   * same shape as tryZoomToolClick above. The actual anchor/close commit
   * happens on pointerup (see onPointerUp below), once it's known whether
   * this was a click or a click-and-drag. */
  function tryPenToolDown(e: React.PointerEvent): boolean {
    if (!penToolActive) return false;
    // Ctrl/Cmd held: direct-selection passthrough (see penCtrlHeld) — a
    // click that lands on an existing anchor/handle is handled by that
    // element's own onPointerDown (beginPenAdjust, called before this ever
    // runs, via stopPropagation); anything else is an ordinary
    // select/marquee click, not a new-anchor placement, while the
    // modifier is held.
    if (e.ctrlKey || e.metaKey) return false;
    e.stopPropagation();
    const p = clientToSvg(e.clientX, e.clientY);
    const first = penDraftAnchors[0];
    const firstClient = penDraftAnchors.length >= 3 && first ? svgPointToClient(first) : null;
    const closing = !!firstClient && Math.hypot(e.clientX - firstClient.x, e.clientY - firstClient.y) <= PEN_CLOSE_THRESHOLD_PX;
    penGestureRef.current = { anchorPoint: closing ? first : p, closing, moved: false };
    setPenDragPoint(null);
    (e.target as Element).setPointerCapture(e.pointerId);
    return true;
  }

  /** Starts a Cut-tool knife-line gesture on pointerdown — same
   * "did I handle it" shape as tryZoomToolClick/tryPenToolDown. The
   * actual cut is resolved on pointerup, once it's known the line
   * actually moved (a plain click with no drag cuts nothing). */
  function tryCutToolDown(e: React.PointerEvent): boolean {
    if (!cutToolActive) return false;
    e.stopPropagation();
    const p = clientToSvg(e.clientX, e.clientY);
    cutGestureRef.current = { start: p, moved: false };
    setCutLine({ start: p, end: p });
    (e.target as Element).setPointerCapture(e.pointerId);
    return true;
  }

  /** Default size (mm) for a plain click with no real drag — a shape
   * tool's own fallback, so clicking without dragging still places
   * something useful instead of nothing. */
  const SHAPE_DEFAULT_SIZE: Record<"rect" | "circle" | "polygon" | "star" | "hole", { w: number; h: number }> = {
    rect: { w: 30, h: 20 },
    circle: { w: 20, h: 20 },
    polygon: { w: 20, h: 20 },
    star: { w: 20, h: 20 },
    hole: { w: 8, h: 8 },
  };

  /** Turns a drag's start/current point into a normalized (positive
   * width/height) bounds box — the same "opposite corners, either
   * direction" math a resize handle already needs. `constrainSquare`
   * (Shift held) forces width===height, extending the shorter axis to
   * match the longer one's drag distance rather than cropping it, so the
   * box always grows from the same fixed start corner. */
  function computeShapeDragBounds(
    start: { x: number; y: number },
    current: { x: number; y: number },
    constrainSquare: boolean,
  ): { x: number; y: number; width: number; height: number } {
    let x1 = current.x;
    let y1 = current.y;
    if (constrainSquare) {
      const dx = x1 - start.x;
      const dy = y1 - start.y;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      x1 = start.x + (dx < 0 ? -size : size);
      y1 = start.y + (dy < 0 ? -size : size);
    }
    return {
      x: Math.min(start.x, x1),
      y: Math.min(start.y, y1),
      width: Math.abs(x1 - start.x),
      height: Math.abs(y1 - start.y),
    };
  }

  /** Starts a shape-tool drag-to-draw gesture on pointerdown — same
   * "did I handle it" shape as tryZoomToolClick/tryPenToolDown/
   * tryCutToolDown. The actual shape is created on pointerup, once it's
   * known whether this was a plain click (default size) or a real drag
   * (custom size/position). */
  function tryShapeToolDown(e: React.PointerEvent): boolean {
    if (!shapeToolActive) return false;
    e.stopPropagation();
    const p = clientToSvg(e.clientX, e.clientY);
    shapeGestureRef.current = { start: p, moved: false };
    setShapeDrawBounds({ x: p.x, y: p.y, width: 0, height: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
    return true;
  }

  /** Starts dragging the last anchor's own dot (reposition) or one of its
   * handles (reshape). See penAdjustRef's comment for why only the last
   * anchor gets this. */
  function beginPenAdjust(e: React.PointerEvent, index: number, kind: "anchor" | "handleIn" | "handleOut") {
    e.stopPropagation();
    penAdjustRef.current = { index, kind };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  /** Starts dragging an anchor's own dot or one of its handles while in
   * Edit Path mode. Cmd/Ctrl+click on an anchor dot instead deletes it
   * outright (no drag) — Illustrator/Figma's own "modifier-click a point to
   * remove it" gesture, and the only way to shrink a finished path's anchor
   * count back down since drawing itself never removes points. */
  function beginEditPenAdjust(e: React.PointerEvent, shapeId: string, index: number, kind: "anchor" | "handleIn" | "handleOut") {
    e.stopPropagation();
    if (kind === "anchor" && (e.metaKey || e.ctrlKey)) {
      deletePenShapeAnchor(shapeId, index);
      return;
    }
    editPenAdjustRef.current = { shapeId, index, kind, preGestureSnapshot: beginGesture(), moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  /** Cycles an anchor's type corner → smooth → symmetric → corner on
   * double-click, while in Edit Path mode — the quickest way to satisfy
   * "convert anchors between corner/smooth/symmetric" without adding a
   * whole separate piece of UI chrome for it. */
  function cyclePenAnchorType(e: React.MouseEvent, shapeId: string, index: number) {
    e.stopPropagation();
    const layer = layers[shapeId];
    if (!layer || layer.type !== "shape" || !layer.penAnchors) return;
    const current = layer.penAnchors[index]?.type ?? "corner";
    const next = current === "corner" ? "smooth" : current === "smooth" ? "symmetric" : "corner";
    setPenShapeAnchorType(shapeId, index, next);
  }

  // A native (non-passive) listener is required here: React attaches wheel
  // handlers as passive by default, so e.preventDefault() inside a React
  // onWheel prop is silently ignored — the browser's own pinch-zoom keeps
  // firing on top of ours, which is exactly what zooms the whole page
  // instead of just the canvas, and makes both fight for smoothness.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey) {
        // Trackpad pinch (Mac reports it as wheel+ctrlKey) or Ctrl/Cmd+scroll: zoom.
        // ZOOM_SENSITIVITY tuned so a single mouse-wheel notch (~deltaY 100)
        // gives a clearly visible step and a trackpad pinch tracks the
        // fingers closely — the previous 0.001 needed several full pinch
        // gestures to change the zoom level at all.
        const factor = Math.exp(e.deltaY * ZOOM_SENSITIVITY);
        zoomAround(clientToSvg(e.clientX, e.clientY), factor);
      } else {
        // Plain scroll / two-finger trackpad swipe: pan, same as Figma.
        setVb((old) => {
          const scale = old.w / (svg!.clientWidth || 1);
          return { ...old, x: old.x + e.deltaX * scale, y: old.y + e.deltaY * scale };
        });
      }
    }

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      preGestureSnapshot: null,
      additive: false,
      pendingDrillRawId: null,
    };
    setIsPanning(true);
  }

  function beginMarquee(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const start = clientToSvg(e.clientX, e.clientY);
    dragState.current = {
      mode: "marquee",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: start,
      startVb: vb,
      moved: false,
      originals: {},
      preGestureSnapshot: null,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      pendingDrillRawId: null,
    };
    setMarqueeRect({ x: start.x, y: start.y, w: 0, h: 0 });
  }

  function beginMove(e: React.PointerEvent, ids: string[], pendingDrillRawId: string | null = null) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const originals: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const layer = layers[id];
      // A locked shape that ended up in a multi-selection some other way
      // (marquee-selected before being locked, part of a shift-clicked
      // group) still shouldn't move along with the rest of the drag.
      if (layer && !isEffectivelyLocked(layers, id)) originals[id] = { x: layer.transform.x, y: layer.transform.y };
    }
    dragState.current = {
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: clientToSvg(e.clientX, e.clientY),
      startVb: vb,
      moved: false,
      originals,
      // The whole drag — however many pointermove events it produces —
      // should collapse into a single undo step.
      preGestureSnapshot: beginGesture(),
      additive: false,
      pendingDrillRawId,
    };
  }

  /** Which local point stays fixed, and which axes actually change, for
   * each of the 8 resize handles — see the derivation in the resizeState
   * doc comment above: dragging a handle keeps the OPPOSITE corner/edge
   * fixed in world space, Photoshop's own free-transform convention. */
  function resizeHandleGeometry(
    handle: ResizeHandle,
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ): { anchorLocal: { x: number; y: number }; handleLocal: { x: number; y: number }; resizesX: boolean; resizesY: boolean } {
    const { minX, minY, maxX, maxY } = b;
    switch (handle) {
      case "e":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: maxX, y: minY }, resizesX: true, resizesY: false };
      case "w":
        return { anchorLocal: { x: maxX, y: minY }, handleLocal: { x: minX, y: minY }, resizesX: true, resizesY: false };
      case "n":
        return { anchorLocal: { x: minX, y: maxY }, handleLocal: { x: minX, y: minY }, resizesX: false, resizesY: true };
      case "s":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: minX, y: maxY }, resizesX: false, resizesY: true };
      case "ne":
        return { anchorLocal: { x: minX, y: maxY }, handleLocal: { x: maxX, y: minY }, resizesX: true, resizesY: true };
      case "nw":
        return { anchorLocal: { x: maxX, y: maxY }, handleLocal: { x: minX, y: minY }, resizesX: true, resizesY: true };
      case "se":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: maxX, y: maxY }, resizesX: true, resizesY: true };
      case "sw":
        return { anchorLocal: { x: maxX, y: minY }, handleLocal: { x: minX, y: maxY }, resizesX: true, resizesY: true };
    }
  }

  function beginResize(e: React.PointerEvent, id: string, handle: ResizeHandle) {
    const layer = layers[id];
    if (!layer || (layer.type !== "shape" && layer.type !== "image")) return;
    const localBounds = getLocalLayerBounds(layer);
    if (!localBounds) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const t = layer.transform;
    const { anchorLocal, handleLocal, resizesX, resizesY } = resizeHandleGeometry(handle, localBounds);
    resizeState.current = {
      id,
      handle,
      origTransform: t,
      anchorLocal,
      anchorWorld: localToWorld(anchorLocal, t),
      dLocal: { x: handleLocal.x - anchorLocal.x, y: handleLocal.y - anchorLocal.y },
      resizesX,
      resizesY,
      aspectRatio: t.scaleX !== 0 ? t.scaleY / t.scaleX : 1,
      preGestureSnapshot: beginGesture(),
      moved: false,
    };
  }

  // How close two edges/centers need to be (in document mm) to count as
  // "aligned" — scaled by the current zoom so it reads as a consistent
  // few screen pixels whether zoomed in or out.
  const ALIGN_TOLERANCE_FRACTION = 0.004;

  function computeAlignGuides(draggedIds: string[], liveLayers: Record<string, Layer>): { v: number[]; h: number[] } {
    const draggedBounds = getMultiLayerWorldBounds(liveLayers, draggedIds);
    if (!draggedBounds) return { v: [], h: [] };
    const tolerance = Math.max(0.3, vbRef.current.w * ALIGN_TOLERANCE_FRACTION);
    const draggedSet = new Set(draggedIds);

    const dCenterX = (draggedBounds.minX + draggedBounds.maxX) / 2;
    const dCenterY = (draggedBounds.minY + draggedBounds.maxY) / 2;

    const v = new Set<number>();
    const h = new Set<number>();

    for (const id of rootIds) {
      if (draggedSet.has(id)) continue;
      const b = getLayerWorldBounds(liveLayers, id);
      if (!b) continue;
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;

      if (Math.abs(draggedBounds.minX - b.minX) < tolerance) v.add(b.minX);
      if (Math.abs(draggedBounds.maxX - b.maxX) < tolerance) v.add(b.maxX);
      if (Math.abs(dCenterX - centerX) < tolerance) v.add(centerX);
      if (Math.abs(draggedBounds.minY - b.minY) < tolerance) h.add(b.minY);
      if (Math.abs(draggedBounds.maxY - b.maxY) < tolerance) h.add(b.maxY);
      if (Math.abs(dCenterY - centerY) < tolerance) h.add(centerY);
    }

    return { v: Array.from(v), h: Array.from(h) };
  }

  function onPointerMove(e: React.PointerEvent) {
    const resize = resizeState.current;
    if (resize) {
      const pointerWorld = clientToSvg(e.clientX, e.clientY);
      const rel = { x: pointerWorld.x - resize.anchorWorld.x, y: pointerWorld.y - resize.anchorWorld.y };
      // Un-rotate the pointer's world-space offset from the anchor back
      // into the shape's own local frame — this is what lets a rotated
      // shape's handle still drag along its own edge direction instead of
      // the screen's X/Y, the same way Photoshop's free-transform handles
      // track a rotated layer's own axes.
      const localDelta = rotateVec(rel.x, rel.y, -resize.origTransform.rotation);
      const t = resize.origTransform;
      const scaleX = resize.resizesX
        ? Math.max(MIN_RESIZE_SCALE, localDelta.x / resize.dLocal.x)
        : t.scaleX;
      let scaleY = resize.resizesY
        ? Math.max(MIN_RESIZE_SCALE, localDelta.y / resize.dLocal.y)
        : t.scaleY;
      // Shift-held corner drag locks the resize to the shape's original
      // aspect ratio instead of stretching it — most useful for a
      // reference image, where you almost always want to keep it in
      // proportion while scaling it up or down.
      if (e.shiftKey && resize.resizesX && resize.resizesY) {
        scaleY = scaleX * resize.aspectRatio;
      }
      // Solve position from the SAME equation beginResize's anchorWorld
      // came from, just inverted: with the new scale fixed, where must
      // the origin sit so the anchor point still lands exactly on
      // anchorWorld?
      const anchorContribution = rotateVec(resize.anchorLocal.x * scaleX, resize.anchorLocal.y * scaleY, t.rotation);
      resize.moved = true;
      setLayerTransform(resize.id, {
        scaleX,
        scaleY,
        x: resize.anchorWorld.x - anchorContribution.x,
        y: resize.anchorWorld.y - anchorContribution.y,
      });
      return;
    }

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
      const movedIds = Object.keys(drag.originals);
      const liveLayers = useSceneStore.getState().layers;
      setAlignGuides(computeAlignGuides(movedIds, liveLayers));
    } else if (drag.mode === "marquee") {
      const cur = clientToSvg(e.clientX, e.clientY);
      setMarqueeRect({
        x: Math.min(drag.startSvg.x, cur.x),
        y: Math.min(drag.startSvg.y, cur.y),
        w: Math.abs(cur.x - drag.startSvg.x),
        h: Math.abs(cur.y - drag.startSvg.y),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (cutGestureRef.current) {
      const { start, moved } = cutGestureRef.current;
      if (moved) {
        const end = clientToSvg(e.clientX, e.clientY);
        cutShapesByLine(start, end);
      }
      cutGestureRef.current = null;
      setCutLine(null);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    if (shapeGestureRef.current) {
      const { start, moved } = shapeGestureRef.current;
      const kind = shapeToolActive;
      if (kind) {
        const bounds = moved
          ? computeShapeDragBounds(start, clientToSvg(e.clientX, e.clientY), e.shiftKey)
          : (() => {
              const { w, h } = SHAPE_DEFAULT_SIZE[kind];
              return { x: start.x - w / 2, y: start.y - h / 2, width: w, height: h };
            })();
        createShapeLayerAt(kind, bounds);
      }
      // Draw one shape, then back to Select — matches Figma's own default
      // (and every other armed tool this app already returns from after
      // a single use, e.g. finishing a Cut).
      setShapeToolActive(null);
      shapeGestureRef.current = null;
      setShapeDrawBounds(null);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    if (penAdjustRef.current) {
      penAdjustRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    if (editPenAdjustRef.current) {
      const { preGestureSnapshot, moved } = editPenAdjustRef.current;
      endGesture(preGestureSnapshot, moved);
      editPenAdjustRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    const penGesture = penGestureRef.current;
    if (penGesture) {
      const rawDrop = clientToSvg(e.clientX, e.clientY);
      // Shift constrains the HANDLE's own direction out of the anchor to
      // 45° steps — not the anchor's position, which for a click-and-drag
      // gesture never moves from where the mouse first went down.
      const drop = e.shiftKey ? snapAngle(penGesture.anchorPoint, rawDrop) : rawDrop;
      if (penGesture.closing) {
        // A drag on the closing click curves the final segment back into
        // the first anchor — handed to finishPenTool as that anchor's own
        // handleIn, same as if it had always had that handle.
        finishPenTool(penGesture.moved ? drop : undefined);
      } else if (penGesture.moved) {
        // A smooth anchor: symmetric handles, so the curve stays smooth
        // (no visible kink) both into and out of this anchor.
        addPenAnchor({
          x: penGesture.anchorPoint.x,
          y: penGesture.anchorPoint.y,
          handleOut: drop,
          handleIn: mirrorPoint(penGesture.anchorPoint, drop),
          type: "symmetric",
        });
      } else {
        // A plain click: a straight "corner" anchor, no handles at all.
        // Shift here constrains the ANCHOR's own position relative to the
        // previous one instead (there's no handle direction to snap yet).
        const prev = penDraftAnchors[penDraftAnchors.length - 1];
        const point = e.shiftKey && prev ? snapAngle(prev, penGesture.anchorPoint) : penGesture.anchorPoint;
        addPenAnchor({ x: point.x, y: point.y, type: "corner" });
      }
      penGestureRef.current = null;
      setPenDragPoint(null);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    const resize = resizeState.current;
    if (resize) {
      endGesture(resize.preGestureSnapshot, resize.moved);
      resizeState.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    const drag = dragState.current;
    if (drag?.mode === "pan" && !drag.moved) clearSelection();
    if (drag?.mode === "move") setAlignGuides({ v: [], h: [] });
    if (drag?.mode === "move" && drag.preGestureSnapshot) {
      endGesture(drag.preGestureSnapshot, drag.moved);
      // The pointer never actually moved — this was a plain click on an
      // already-selected group/shape, not the start of a drag, so now
      // (and only now) resolve it as "step one level deeper" instead of
      // moving the current selection as-is.
      if (!drag.moved && drag.pendingDrillRawId) {
        const singleSelected = selection.length === 1 ? selection[0] : undefined;
        selectLayer(stepIntoOnClick(layers, singleSelected, drag.pendingDrillRawId), false);
      }
    }
    if (drag?.mode === "marquee") {
      if (drag.moved && marqueeRect) {
        const box = {
          minX: marqueeRect.x,
          minY: marqueeRect.y,
          maxX: marqueeRect.x + marqueeRect.w,
          maxY: marqueeRect.y + marqueeRect.h,
        };
        // Top-level items only — matches "Select All" (Cmd/Ctrl+A), which
        // also only ever selects rootIds, not individual nested children.
        const hitIds = rootIds.filter((id) => {
          const b = getLayerWorldBounds(layers, id);
          return b && boundsOverlap(b, box);
        });
        if (drag.additive) {
          setSelection([...new Set([...selection, ...hitIds])]);
        } else {
          setSelection(hitIds);
        }
      } else if (!drag.moved) {
        clearSelection();
      }
      setMarqueeRect(null);
    }
    dragState.current = null;
    setIsPanning(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function handleShapeDown(e: React.PointerEvent, rawId: string) {
    e.stopPropagation();
    if (tryZoomToolClick(e)) return;
    // The pen tool places a point wherever you click, existing shapes
    // included — the same "draw right through anything" behavior Figma's
    // own pen tool has, rather than selecting/moving whatever's underneath.
    if (tryPenToolDown(e)) return;
    // Same idea for Cut: the knife line starts wherever you press down,
    // shape or empty canvas alike — cutShapesByLine figures out on its own
    // which shapes the finished line actually crosses.
    if (tryCutToolDown(e)) return;
    // A shape tool draws right on top of whatever's under the cursor too
    // — you're placing a brand-new shape, not interacting with what's
    // already there.
    if (tryShapeToolDown(e)) return;
    // Space+drag pans even when the pointer happens to come down on a
    // shape — without this, the shape's own handler (which runs first and
    // stops the event before it ever reaches the canvas-level pan check)
    // always started moving that shape instead, no matter where you
    // pressed down.
    if (spaceHeld) {
      beginPan(e);
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (additive) {
      // Shift-click always toggles the exact shape under the cursor — no
      // top-level resolution here, unlike a plain click. rawId is always
      // an individual leaf shape's own id already (only shapes have a
      // pointer handler; a group renders as a plain unclickable <g>
      // wrapper around its children), so this is precisely "add/remove
      // this one shape," letting you build a multi-selection out of
      // individual children inside a group without needing to drill in
      // first. Climbing to the group here (as a plain click does) was the
      // bug: shift-clicking two children of the same group ended up
      // selecting the parent group twice instead of the two children.
      const id = rawId;
      const nextSelection = selection.includes(id)
        ? selection.filter((s) => s !== id)
        : // Drop any ancestor of the newly clicked shape that's already
          // selected — having both a group and one of its own children
          // selected at once would double-apply a drag (the child moves
          // via its own transform AND via its parent's), the exact
          // "top-of-selection only" invariant mergeLayers/groupSelection/
          // duplicateSelection already enforce elsewhere.
          [...selection.filter((s) => !isAncestorOrSelf(layers, s, id)), id];
      setSelection(nextSelection);
      beginMove(e, nextSelection);
      return;
    }

    // A plain click on a group's member — or on any member of an existing
    // MULTI-selection built via shift-click/marquee — should keep moving
    // the whole current selection as one unit, not just the shape under
    // the cursor. This has to be resolved ONLY once the gesture turns out
    // to be a genuine click with no movement (see below); if this same
    // mousedown turns into a drag, it must move whatever's currently
    // selected exactly as-is, unchanged. Getting this wrong (checking only
    // a single-shape selection, as this used to) silently narrowed ANY
    // multi-selection down to just the one shape you happened to grab the
    // instant you tried to drag it — selecting several shapes and dragging
    // one looked like it "deselected everything but that one."
    const clickedWithinSelection = selection.some((s) => isAncestorOrSelf(layers, s, rawId));
    if (clickedWithinSelection) {
      // Resolved in onPointerUp: if the pointer never actually moved, this
      // was a plain click, not a drag — collapse to just this shape (or,
      // for a single already-selected group, step one level deeper),
      // Figma's own "click to select the group, click again to work on
      // what's inside it," generalized to any nesting depth or selection
      // size.
      beginMove(e, selection, rawId);
      return;
    }

    const id = getTopLevelId(layers, rawId);
    selectLayer(id, false);
    beginMove(e, [id]);
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

    if (layer.type === "image") {
      return (
        <g key={id} transform={transformAttr}>
          <image
            href={layer.src}
            x={0}
            y={0}
            width={layer.width}
            height={layer.height}
            opacity={layer.opacity}
            preserveAspectRatio="none"
            style={{
              cursor:
                penToolActive || cutToolActive || shapeToolActive ? "crosshair"
                : isEffectivelyLocked(layers, id) ? "default"
                : "move",
            }}
            onPointerDown={(e) => {
              if (tryZoomToolClick(e)) return;
              if (tryPenToolDown(e)) return;
              if (!isEffectivelyLocked(layers, id)) handleShapeDown(e, id);
            }}
          />
        </g>
      );
    }

    const pathD = regionsToPathD(roundRegions(layer.regions, layer.cornerRadius));
    return (
      <g key={id} transform={transformAttr}>
        <path
          d={pathD}
          fill={layer.isHole ? "#ef4444" : layer.color}
          fillOpacity={layer.isHole ? 0.35 : 1}
          fillRule="evenodd"
          stroke={layer.isHole ? "#ef4444" : "none"}
          strokeWidth={layer.isHole ? 1 : 0}
          strokeDasharray={layer.isHole ? "3 2" : undefined}
          vectorEffect={layer.isHole ? "non-scaling-stroke" : undefined}
          style={{
            cursor: zoomToolArmed
              ? zoomToolOut ? "zoom-out" : "zoom-in"
              : penToolActive || cutToolActive || shapeToolActive ? "crosshair"
              : isEffectivelyLocked(layers, id) ? "default" : "move",
          }}
          onPointerDown={(e) => {
            // The zoom tool zooms on anything you click, lock included —
            // it's not a selection action. Same for the pen tool: it draws
            // right through a locked shape rather than being blocked by it.
            if (tryZoomToolClick(e)) return;
            if (tryPenToolDown(e)) return;
            // A shape locked directly OR inherited from a locked ancestor
            // group is entirely inert to canvas clicks — matches Figma:
            // locking a group freezes everything inside it too, not just
            // whatever's locked at the top level.
            if (!isEffectivelyLocked(layers, id)) handleShapeDown(e, id);
          }}
          onDoubleClick={(e) => {
            // Double-click re-opens a finished Pen shape's own anchors/
            // handles (Figma's "the Pen tool never really stops being
            // available on a vector path" model) instead of only ever
            // exposing the flattened, already-tessellated outline through
            // the ordinary bounding-box resize handles. Shapes never drawn
            // with the Pen tool have no penAnchors and just fall through to
            // whatever double-click already did (nothing, today).
            if (penToolActive || cutToolActive || shapeToolActive) return;
            if (isEffectivelyLocked(layers, id)) return;
            if (!layer.penAnchors) return;
            e.stopPropagation();
            beginEditPenShape(id);
          }}
        />
      </g>
    );
  }

  const gridSize = 10;
  const zoomPct = Math.round((document_.widthMM / vb.w) * 100);
  // A fixed mm size (the old `vb.w * constant` formulas below, before this
  // fix) only stays a constant SCREEN size across the middle of the zoom
  // range — pinned to whatever CSS pixel width the SVG happened to have
  // when that constant was tuned. Zoom in far enough and the same mm size
  // covers more and more real screen pixels, growing without bound — the
  // exact "pen dots are huge when I zoom in" bug. Converting through the
  // SVG's OWN CURRENT rendered width instead keeps every on-canvas
  // interaction target (anchors, handles) truly constant in screen
  // pixels at any zoom level, and stays correct across a window resize
  // too (the old formula silently assumed the SVG's CSS size never
  // changed from whatever fitView last picked).
  const svgClientWidthPx = svgRef.current?.clientWidth || 800;
  const pxToMM = (px: number) => (px * vb.w) / svgClientWidthPx;

  return (
    <>
      <svg
        ref={svgRef}
        className={
          "canvas2d" +
          (isPanning ? " panning" : "") +
          (spaceHeld ? " space-pan" : "") +
          (zoomToolArmed ? (zoomToolOut ? " zoom-out-tool" : " zoom-in-tool") : "") +
          (penToolActive ? " pen-tool" : "") +
          (cutToolActive ? " cut-tool" : "") +
          (shapeToolActive ? " shape-draw-tool" : "")
        }
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => /^image\//i.test(i.type))) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDrop={(e) => {
          handleImageDrop(e);
        }}
        onPointerDown={(e) => {
          if (tryZoomToolClick(e)) return;
          if (tryPenToolDown(e)) return;
          if (tryCutToolDown(e)) return;
          if (tryShapeToolDown(e)) return;
          if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
            if (spaceHeld) beginPan(e);
            else beginMarquee(e);
          }
        }}
        onPointerMove={(e) => {
          const editAdjust = editPenAdjustRef.current;
          if (editAdjust) {
            const layer = layers[editAdjust.shapeId];
            if (layer && layer.type === "shape" && layer.penAnchors) {
              const world = getWorldTransform(layers, editAdjust.shapeId);
              const local = invertTransform2D(clientToSvg(e.clientX, e.clientY), world);
              editAdjust.moved = true;
              if (editAdjust.kind === "anchor") {
                const anchors = layer.penAnchors;
                const prev = anchors[(editAdjust.index - 1 + anchors.length) % anchors.length];
                updatePenShapeAnchorPosition(
                  editAdjust.shapeId,
                  editAdjust.index,
                  e.shiftKey && prev ? snapAngle(prev, local) : local,
                );
              } else {
                const anchor = layer.penAnchors[editAdjust.index];
                updatePenShapeAnchorHandle(
                  editAdjust.shapeId,
                  editAdjust.index,
                  editAdjust.kind,
                  e.shiftKey && anchor ? snapAngle(anchor, local) : local,
                  e.altKey,
                );
              }
            }
            return;
          }
          if (cutGestureRef.current) {
            const p = clientToSvg(e.clientX, e.clientY);
            const start = cutGestureRef.current.start;
            const startClient = svgPointToClient(start);
            const distClient = startClient ? Math.hypot(e.clientX - startClient.x, e.clientY - startClient.y) : 0;
            if (distClient > PEN_DRAG_THRESHOLD_PX) cutGestureRef.current.moved = true;
            setCutLine({ start, end: p });
            return;
          }
          if (shapeGestureRef.current) {
            const p = clientToSvg(e.clientX, e.clientY);
            const start = shapeGestureRef.current.start;
            const startClient = svgPointToClient(start);
            const distClient = startClient ? Math.hypot(e.clientX - startClient.x, e.clientY - startClient.y) : 0;
            if (distClient > PEN_DRAG_THRESHOLD_PX) shapeGestureRef.current.moved = true;
            setShapeDrawBounds(computeShapeDragBounds(start, p, e.shiftKey));
            return;
          }
          if (penToolActive) {
            const p = clientToSvg(e.clientX, e.clientY);
            const adjust = penAdjustRef.current;
            if (adjust) {
              if (adjust.kind === "anchor") {
                const prev = penDraftAnchors[adjust.index - 1];
                updatePenAnchorPosition(adjust.index, e.shiftKey && prev ? snapAngle(prev, p) : p);
              } else {
                const anchor = penDraftAnchors[adjust.index];
                updatePenAnchorHandle(adjust.index, adjust.kind, e.shiftKey && anchor ? snapAngle(anchor, p) : p, e.altKey);
              }
              return;
            }
            const gesture = penGestureRef.current;
            if (gesture) {
              const anchorClient = svgPointToClient(gesture.anchorPoint);
              const clientDist = anchorClient ? Math.hypot(e.clientX - anchorClient.x, e.clientY - anchorClient.y) : 0;
              if (clientDist > PEN_DRAG_THRESHOLD_PX) gesture.moved = true;
              setPenDragPoint(e.shiftKey ? snapAngle(gesture.anchorPoint, p) : p);
            } else {
              setPenHoverPoint(p);
            }
            return;
          }
          onPointerMove(e);
        }}
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
          // Outset a hair past the shape's own edge. Drawn exactly on top of
          // it, the outline's inner half anti-aliases straight into the
          // fill (a near-identical accent-blue against an indigo shape,
          // there's nothing to see) and only shows where a corner happens
          // to land on bare background — which is why a plain rectangle
          // showed no visible outline at all while a circle's square
          // bounding box (corners poking past the round fill) did.
          const m = SELECTION_OUTLINE_MARGIN_MM;
          return (
            <rect
              key={id}
              className="selection-box"
              x={b.minX - m}
              y={b.minY - m}
              width={Math.max(0.01, b.maxX - b.minX + m * 2)}
              height={Math.max(0.01, b.maxY - b.minY + m * 2)}
              pointerEvents="none"
            />
          );
        })}

        {marqueeRect && (
          <rect
            className="marquee-box"
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.w}
            height={marqueeRect.h}
            pointerEvents="none"
          />
        )}

        {cutLine && (
          <line
            className="cut-line"
            x1={cutLine.start.x}
            y1={cutLine.start.y}
            x2={cutLine.end.x}
            y2={cutLine.end.y}
          />
        )}

        {shapeDrawBounds && shapeToolActive && (() => {
          const { x, y, width: w, height: h } = shapeDrawBounds;
          if (shapeToolActive === "rect") {
            return <rect className="shape-draw-preview" x={x} y={y} width={w} height={h} />;
          }
          if (shapeToolActive === "circle" || shapeToolActive === "hole") {
            return <ellipse className="shape-draw-preview" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />;
          }
          const localPoints =
            shapeToolActive === "polygon"
              ? normalizeToBounds(regularPolygonPoints(6), w, h)
              : normalizeToBounds(starPolygonPoints(5, 0.45), w, h);
          const pointsAttr = localPoints.map((p) => `${x + p.x},${y + p.y}`).join(" ");
          return <polygon className="shape-draw-preview" points={pointsAttr} />;
        })()}

        {(() => {
          // Photoshop-style drag-to-resize handles — only for a single,
          // unlocked shape (not a group: a group's "size" would need its
          // own combined-bounds notion this doesn't have yet, and multiple
          // shapes have no single unambiguous handle to grab). Positioned
          // at the same axis-aligned world bounds the selection outline
          // above already uses, which is exact for an unrotated shape and
          // a reasonable approximation for a rotated one — the resize math
          // itself (see beginResize/onPointerMove) works in the shape's
          // true local+rotated frame regardless of where the handle is
          // drawn, so a rotated shape still resizes correctly even though
          // its handles sit at the bounding box rather than its own
          // rotated corners.
          if (selection.length !== 1) return null;
          const id = selection[0];
          if (id === editingPenShapeId) return null;
          const layer = layers[id];
          if (!layer || (layer.type !== "shape" && layer.type !== "image") || isEffectivelyLocked(layers, id))
            return null;
          const b = getLayerWorldBounds(layers, id);
          if (!b) return null;
          const size = Math.max(1.2, vb.w * 0.01);
          const half = size / 2;
          const midX = (b.minX + b.maxX) / 2;
          const midY = (b.minY + b.maxY) / 2;
          const handles: { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
            { handle: "nw", x: b.minX, y: b.minY, cursor: "nwse-resize" },
            { handle: "n", x: midX, y: b.minY, cursor: "ns-resize" },
            { handle: "ne", x: b.maxX, y: b.minY, cursor: "nesw-resize" },
            { handle: "e", x: b.maxX, y: midY, cursor: "ew-resize" },
            { handle: "se", x: b.maxX, y: b.maxY, cursor: "nwse-resize" },
            { handle: "s", x: midX, y: b.maxY, cursor: "ns-resize" },
            { handle: "sw", x: b.minX, y: b.maxY, cursor: "nesw-resize" },
            { handle: "w", x: b.minX, y: midY, cursor: "ew-resize" },
          ];
          return (
            <>
              {handles.map((h) => (
                <rect
                  key={h.handle}
                  className="selection-handle"
                  x={h.x - half}
                  y={h.y - half}
                  width={size}
                  height={size}
                  style={{ cursor: h.cursor }}
                  onPointerDown={(e) => beginResize(e, id, h.handle)}
                />
              ))}
            </>
          );
        })()}

        {alignGuides.v.map((x) => (
          <line
            key={`v${x}`}
            className="align-guide"
            x1={x}
            y1={vb.y}
            x2={x}
            y2={vb.y + vb.h}
            pointerEvents="none"
          />
        ))}
        {alignGuides.h.map((y) => (
          <line
            key={`h${y}`}
            className="align-guide"
            x1={vb.x}
            y1={y}
            x2={vb.x + vb.w}
            y2={y}
            pointerEvents="none"
          />
        ))}

        {penToolActive && penDraftAnchors.length > 0 && (() => {
          const gesture = penGestureRef.current;
          const dragging = !!(gesture?.moved && penDragPoint);

          // What the path would look like if the current gesture (or, with
          // no gesture running, just the hover position) were committed
          // right now — the same live preview every pen tool gives before
          // you've actually clicked/released the next anchor.
          let previewTarget: PenAnchor | null = null;
          if (gesture) {
            if (gesture.closing) {
              previewTarget = dragging ? { ...penDraftAnchors[0], handleIn: penDragPoint! } : penDraftAnchors[0];
            } else {
              previewTarget = dragging
                ? {
                    x: gesture.anchorPoint.x,
                    y: gesture.anchorPoint.y,
                    type: "symmetric",
                    handleOut: penDragPoint!,
                    handleIn: mirrorPoint(gesture.anchorPoint, penDragPoint!),
                  }
                : { x: gesture.anchorPoint.x, y: gesture.anchorPoint.y, type: "corner" };
            }
          } else if (penHoverPoint) {
            previewTarget = { x: penHoverPoint.x, y: penHoverPoint.y, type: "corner" };
          }

          let d = `M ${penDraftAnchors[0].x} ${penDraftAnchors[0].y} `;
          for (let i = 1; i < penDraftAnchors.length; i++) d += penSegmentD(penDraftAnchors[i - 1], penDraftAnchors[i]);
          const last = penDraftAnchors[penDraftAnchors.length - 1];
          if (previewTarget) d += penSegmentD(last, previewTarget);

          const handleR = pxToMM(3.5);
          const mirroredHandle = dragging ? mirrorPoint(gesture!.anchorPoint, penDragPoint!) : null;
          const lastIndex = penDraftAnchors.length - 1;

          return (
            <>
              <path className="pen-draft-line" d={d} pointerEvents="none" />
              {dragging && mirroredHandle && (
                <>
                  <line
                    className="pen-draft-handle-line"
                    x1={mirroredHandle.x}
                    y1={mirroredHandle.y}
                    x2={penDragPoint!.x}
                    y2={penDragPoint!.y}
                    pointerEvents="none"
                  />
                  <circle className="pen-draft-handle" cx={penDragPoint!.x} cy={penDragPoint!.y} r={handleR} pointerEvents="none" />
                  <circle className="pen-draft-handle" cx={mirroredHandle.x} cy={mirroredHandle.y} r={handleR} pointerEvents="none" />
                </>
              )}
              {/* Every already-placed anchor's own handles, live and
                  draggable — normally just the last-placed one (the "go
                  back and adjust the arc you just drew" gesture right after
                  placing it), or ALL of them while Ctrl/Cmd is held (the
                  direct-selection passthrough — see penCtrlHeld). Skipped
                  while a new anchor is actively being placed above (that
                  preview already covers this same spot visually). */}
              {!gesture &&
                penDraftAnchors.map((anchor, i) => {
                  if (i !== lastIndex && !penCtrlHeld) return null;
                  if (!anchor.handleOut && !anchor.handleIn) return null;
                  return (
                    <g key={`h${i}`}>
                      {anchor.handleOut && anchor.handleIn && (
                        <line
                          className="pen-draft-handle-line"
                          x1={anchor.handleIn.x}
                          y1={anchor.handleIn.y}
                          x2={anchor.handleOut.x}
                          y2={anchor.handleOut.y}
                          pointerEvents="none"
                        />
                      )}
                      {anchor.handleOut && (
                        <circle
                          className="pen-draft-handle"
                          cx={anchor.handleOut.x}
                          cy={anchor.handleOut.y}
                          r={handleR * 1.4}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => beginPenAdjust(e, i, "handleOut")}
                        />
                      )}
                      {anchor.handleIn && (
                        <circle
                          className="pen-draft-handle"
                          cx={anchor.handleIn.x}
                          cy={anchor.handleIn.y}
                          r={handleR * 1.4}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => beginPenAdjust(e, i, "handleIn")}
                        />
                      )}
                    </g>
                  );
                })}
              {penDraftAnchors.map((p, i) => {
                const isFirst = i === 0;
                const isLast = i === lastIndex;
                const closable = isFirst && penDraftAnchors.length >= 3;
                const adjustable = (isLast || penCtrlHeld) && !gesture;
                const r = pxToMM(4) * (isFirst ? 1.6 : 1);
                return (
                  <circle
                    key={i}
                    className={"pen-draft-point" + (isFirst ? " first-point" : "") + (closable ? " closable" : "")}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    pointerEvents={adjustable ? "all" : "none"}
                    style={adjustable ? { cursor: "move" } : undefined}
                    onPointerDown={adjustable ? (e) => beginPenAdjust(e, i, "anchor") : undefined}
                  />
                );
              })}
            </>
          );
        })()}

        {(() => {
          // Edit Path mode: a finished Pen shape's real anchors/handles,
          // re-opened for direct editing (see beginEditPenShape). Every
          // point is draggable here, unlike the draft-drawing render above
          // which only ever lets you adjust the LAST anchor — once a path
          // is finished there's no "closing hotspot" to protect, so every
          // anchor can be a live drag target.
          if (!editingPenShapeId) return null;
          const layer = layers[editingPenShapeId];
          if (!layer || layer.type !== "shape" || !layer.penAnchors || layer.penAnchors.length < 3) return null;
          const world = getWorldTransform(layers, editingPenShapeId);
          const anchorsWorld = layer.penAnchors.map((a) => ({
            ...a,
            ...applyTransform2D(a, world),
            handleIn: a.handleIn ? applyTransform2D(a.handleIn, world) : undefined,
            handleOut: a.handleOut ? applyTransform2D(a.handleOut, world) : undefined,
          }));

          let d = `M ${anchorsWorld[0].x} ${anchorsWorld[0].y} `;
          for (let i = 0; i < anchorsWorld.length; i++) {
            d += penSegmentD(anchorsWorld[i], anchorsWorld[(i + 1) % anchorsWorld.length]);
          }

          const handleR = pxToMM(3.5);
          const anchorR = pxToMM(4);

          return (
            <>
              <path className="pen-edit-path" d={d} pointerEvents="none" />
              {anchorsWorld.map((a, i) => (
                <g key={i}>
                  {a.handleOut && a.handleIn && (
                    <line
                      className="pen-draft-handle-line"
                      x1={a.handleIn.x}
                      y1={a.handleIn.y}
                      x2={a.handleOut.x}
                      y2={a.handleOut.y}
                      pointerEvents="none"
                    />
                  )}
                  {a.handleOut && (
                    <>
                      <line
                        className="pen-draft-handle-line"
                        x1={a.x}
                        y1={a.y}
                        x2={a.handleOut.x}
                        y2={a.handleOut.y}
                        pointerEvents="none"
                      />
                      <circle
                        className="pen-draft-handle"
                        cx={a.handleOut.x}
                        cy={a.handleOut.y}
                        r={handleR}
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => beginEditPenAdjust(e, editingPenShapeId, i, "handleOut")}
                      />
                    </>
                  )}
                  {a.handleIn && (
                    <>
                      <line
                        className="pen-draft-handle-line"
                        x1={a.x}
                        y1={a.y}
                        x2={a.handleIn.x}
                        y2={a.handleIn.y}
                        pointerEvents="none"
                      />
                      <circle
                        className="pen-draft-handle"
                        cx={a.handleIn.x}
                        cy={a.handleIn.y}
                        r={handleR}
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => beginEditPenAdjust(e, editingPenShapeId, i, "handleIn")}
                      />
                    </>
                  )}
                </g>
              ))}
              {anchorsWorld.map((a, i) => (
                <circle
                  key={i}
                  className={"pen-draft-point pen-edit-point" + (a.type !== "corner" ? " curved" : "")}
                  cx={a.x}
                  cy={a.y}
                  r={anchorR}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => beginEditPenAdjust(e, editingPenShapeId, i, "anchor")}
                  onDoubleClick={(e) => cyclePenAnchorType(e, editingPenShapeId, i)}
                />
              ))}
            </>
          );
        })()}
      </svg>
      <div className="canvas-status-bar" ref={hintRef}>
        <button
          type="button"
          className={"canvas-info-btn" + (showHint ? " active" : "")}
          aria-label="Canvas controls help"
          onClick={() => setShowHint((v) => !v)}
        >
          <InfoIcon size={13} />
        </button>
        {showHint && (
          <div className="canvas-hint">
            Drag empty space to select · Space+drag or scroll to pan · Cmd/Ctrl+scroll, pinch, or hold Z (Option+Z to
            zoom out) and click to zoom · Cmd/Ctrl+0 for 100% · Click a shape to select, drag to move
          </div>
        )}
        <div className="zoom-indicator">{zoomPct}%</div>
      </div>
    </>
  );
}
