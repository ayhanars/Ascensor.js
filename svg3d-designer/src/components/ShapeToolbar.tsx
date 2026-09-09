import { useSceneStore } from "../state/store";
import {
  CircleToolIcon,
  CursorToolIcon,
  CutToolIcon,
  HoleToolIcon,
  PenToolIcon,
  PolygonToolIcon,
  RectangleToolIcon,
  StarToolIcon,
} from "./icons";

type ShapeKind = "rect" | "circle" | "polygon" | "star" | "hole";

/**
 * Figma-style floating toolbar for adding shapes to the artboard. Mirrors
 * Figma's own shape set as closely as makes sense for something headed to
 * a 3D print — every one of these (Pen included, which builds one closed,
 * fillable custom outline) extrudes cleanly. Tools that have no printable
 * equivalent (freehand brush/pencil, text, frame, comment, plugin,
 * image/video) are left out entirely rather than added as dead buttons.
 *
 * Every shape button ARMS that tool rather than stamping a shape
 * immediately — Canvas2D then draws the actual shape from wherever the
 * user clicks or drags (see its own tryShapeToolDown), matching Figma's
 * own click-or-drag-to-draw convention instead of always dropping a
 * fixed-size default at the document's center.
 */
export function ShapeToolbar() {
  const selection = useSceneStore((s) => s.selection);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const penToolActive = useSceneStore((s) => s.penToolActive);
  const beginPenTool = useSceneStore((s) => s.beginPenTool);
  const cancelPenTool = useSceneStore((s) => s.cancelPenTool);
  const cutToolActive = useSceneStore((s) => s.cutToolActive);
  const setCutToolActive = useSceneStore((s) => s.setCutToolActive);
  const shapeToolActive = useSceneStore((s) => s.shapeToolActive);
  const setShapeToolActive = useSceneStore((s) => s.setShapeToolActive);

  const noToolActive = selection.length === 0 && !penToolActive && !cutToolActive && !shapeToolActive;

  // Arming any one of these tools abandons whatever the others were
  // doing — an in-progress pen path, a half-drawn cut line — the same
  // mutual-exclusivity every other tool switch here already has.
  function armShapeTool(kind: ShapeKind) {
    if (penToolActive) cancelPenTool();
    if (cutToolActive) setCutToolActive(false);
    setShapeToolActive(shapeToolActive === kind ? null : kind);
  }

  return (
    <div className="shape-toolbar">
      <button
        className={"shape-tool-btn" + (noToolActive ? " active" : "")}
        title="Select (click empty canvas, drag to marquee-select, or press Escape)"
        onClick={() => {
          if (penToolActive) cancelPenTool();
          if (cutToolActive) setCutToolActive(false);
          if (shapeToolActive) setShapeToolActive(null);
          clearSelection();
        }}
      >
        <CursorToolIcon />
      </button>
      <button
        className={"shape-tool-btn" + (penToolActive ? " active" : "")}
        title="Pen — click for a straight corner point, click-and-drag for a curved (smooth) point, click the first point (or press Enter) to close the shape, Escape to cancel, Backspace to undo the last point"
        onClick={() => {
          if (cutToolActive) setCutToolActive(false);
          if (shapeToolActive) setShapeToolActive(null);
          if (penToolActive) cancelPenTool();
          else beginPenTool();
        }}
      >
        <PenToolIcon />
      </button>
      <button
        className={"shape-tool-btn" + (cutToolActive ? " active" : "")}
        title="Cut — drag a straight line across a shape to split it into two separate shapes along that line. Escape to switch back to Select."
        onClick={() => {
          if (penToolActive) cancelPenTool();
          if (shapeToolActive) setShapeToolActive(null);
          setCutToolActive(!cutToolActive);
        }}
      >
        <CutToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className={"shape-tool-btn" + (shapeToolActive === "rect" ? " active" : "")}
        title="Rectangle — drag to draw it at the size and position you want, or click for a default size. Hold Shift while dragging for a perfect square."
        onClick={() => armShapeTool("rect")}
      >
        <RectangleToolIcon />
      </button>
      <button
        className={"shape-tool-btn" + (shapeToolActive === "circle" ? " active" : "")}
        title="Circle — drag to draw it at the size and position you want, or click for a default size. Hold Shift while dragging for a perfect circle."
        onClick={() => armShapeTool("circle")}
      >
        <CircleToolIcon />
      </button>
      <button
        className={"shape-tool-btn" + (shapeToolActive === "polygon" ? " active" : "")}
        title="Polygon — drag to draw it (edit its side count in the panel on the right), or click for a default size. Hold Shift for a regular (equal-sided) polygon."
        onClick={() => armShapeTool("polygon")}
      >
        <PolygonToolIcon />
      </button>
      <button
        className={"shape-tool-btn" + (shapeToolActive === "star" ? " active" : "")}
        title="Star — drag to draw it (edit its point count in the panel on the right), or click for a default size. Hold Shift for a regular star."
        onClick={() => armShapeTool("star")}
      >
        <StarToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className={"shape-tool-btn hole-tool-btn" + (shapeToolActive === "hole" ? " active" : "")}
        title="Hole (negative space) — cuts through whatever it overlaps. Drag to draw it, or click for a default size. Hold Shift while dragging for a perfect circle."
        onClick={() => armShapeTool("hole")}
      >
        <HoleToolIcon />
      </button>
    </div>
  );
}
