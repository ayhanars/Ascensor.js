import { useSceneStore } from "../state/store";
import { CircleToolIcon, RectangleToolIcon } from "./icons";

/** Figma-style floating toolbar for adding primitive shapes to the artboard. */
export function ShapeToolbar() {
  const createShapeLayer = useSceneStore((s) => s.createShapeLayer);

  return (
    <div className="shape-toolbar">
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
    </div>
  );
}
