import { useSceneStore } from "../state/store";
import { CircleToolIcon, CursorToolIcon, HoleToolIcon, RectangleToolIcon } from "./icons";

/** Figma-style floating toolbar for adding primitive shapes to the artboard. */
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
