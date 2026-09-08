import { useSceneStore } from "../state/store";
import {
  ArrowToolIcon,
  CircleToolIcon,
  CursorToolIcon,
  HoleToolIcon,
  LineToolIcon,
  PolygonToolIcon,
  RectangleToolIcon,
  StarToolIcon,
} from "./icons";

/**
 * Figma-style floating toolbar for adding shapes to the artboard. Mirrors
 * Figma's own shape set as closely as makes sense for something headed to
 * a 3D print — every one of these is a closed, fillable outline that
 * extrudes cleanly. Tools that have no printable equivalent (freehand
 * brush/pencil, pen, text, frame, comment, plugin, image/video) are left
 * out entirely rather than added as dead buttons.
 */
export function ShapeToolbar() {
  const createShapeLayer = useSceneStore((s) => s.createShapeLayer);
  const selection = useSceneStore((s) => s.selection);
  const clearSelection = useSceneStore((s) => s.clearSelection);

  return (
    <div className="shape-toolbar">
      <button
        className={"shape-tool-btn" + (selection.length === 0 ? " active" : "")}
        title="Select (click empty canvas, drag to marquee-select, or press Escape)"
        onClick={clearSelection}
      >
        <CursorToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className="shape-tool-btn"
        title="Add rectangle"
        onClick={() => createShapeLayer("rect")}
      >
        <RectangleToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add circle"
        onClick={() => createShapeLayer("circle")}
      >
        <CircleToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add polygon (edit its side count in the panel on the right)"
        onClick={() => createShapeLayer("polygon")}
      >
        <PolygonToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add star (edit its point count in the panel on the right)"
        onClick={() => createShapeLayer("star")}
      >
        <StarToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add line (a thin printable strip, not a bare stroke)"
        onClick={() => createShapeLayer("line")}
      >
        <LineToolIcon />
      </button>
      <button
        className="shape-tool-btn"
        title="Add arrow"
        onClick={() => createShapeLayer("arrow")}
      >
        <ArrowToolIcon />
      </button>
      <div className="shape-toolbar-divider" />
      <button
        className="shape-tool-btn hole-tool-btn"
        title="Add hole (negative space) — cuts through whatever it overlaps"
        onClick={() => createShapeLayer("hole")}
      >
        <HoleToolIcon />
      </button>
    </div>
  );
}
