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

/**
 * Figma-style floating toolbar for adding shapes to the artboard. Mirrors
 * Figma's own shape set as closely as makes sense for something headed to
 * a 3D print — every one of these (Pen included, which builds one closed,
 * fillable custom outline) extrudes cleanly. Tools that have no printable
 * equivalent (freehand brush/pencil, text, frame, comment, plugin,
 * image/video) are left out entirely rather than added as dead buttons.
 */
export function ShapeToolbar() {
  const createShapeLayer = useSceneStore((s) => s.createShapeLayer);
  const selection = useSceneStore((s) => s.selection);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const penToolActive = useSceneStore((s) => s.penToolActive);
  const beginPenTool = useSceneStore((s) => s.beginPenTool);
  const cancelPenTool = useSceneStore((s) => s.cancelPenTool);
  const cutToolActive = useSceneStore((s) => s.cutToolActive);
  const setCutToolActive = useSceneStore((s) => s.setCutToolActive);

  // Switching to a stamp tool mid-draw should abandon the in-progress pen
  // path rather than leave it dangling behind the new shape — Canvas2D
  // would otherwise still be intercepting clicks for a draft the toolbar
  // no longer shows as active.
  function addShape(kind: Parameters<typeof createShapeLayer>[0]) {
    if (penToolActive) cancelPenTool();
    if (cutToolActive) setCutToolActive(false);
    createShapeLayer(kind);
  }

  return (
    <div className="shape-toolbar">
      <button
        className={"shape-tool-btn" + (selection.length === 0 && !penToolActive && !cutToolActive ? " active" : "")}
        title="Select (click empty canvas, drag to marquee-select, or press Escape)"
        onClick={() => {
          if (penToolActive) cancelPenTool();
          if (cutToolActive) setCutToolActive(false);
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
          setCutToolActive(!cutToolActive);
        }}
      >
        <CutToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className="shape-tool-btn"
        title="Add rectangle"
        onClick={() => addShape("rect")}
      >
        <RectangleToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add circle"
        onClick={() => addShape("circle")}
      >
        <CircleToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add polygon (edit its side count in the panel on the right)"
        onClick={() => addShape("polygon")}
      >
        <PolygonToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add star (edit its point count in the panel on the right)"
        onClick={() => addShape("star")}
      >
        <StarToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className="shape-tool-btn hole-tool-btn"
        title="Add hole (negative space) — cuts through whatever it overlaps"
        onClick={() => addShape("hole")}
      >
        <HoleToolIcon />
      </button>
    </div>
  );
}
