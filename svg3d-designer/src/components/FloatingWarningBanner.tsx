import { useEffect, useState } from "react";
import { computeFloatingLayerIds } from "../state/sceneUtils";
import { useSceneStore } from "../state/store";

// Debounced rather than a synchronous useMemo: while a raised shape is
// being dragged across the canvas, its Z-alignment-based support check
// flickers on/off every frame as it passes over and off other shapes'
// footprints — waiting for a short pause in edits before checking keeps
// the banner from flashing during normal dragging and only shows up once
// the user has actually settled on a position.
const CHECK_DEBOUNCE_MS = 450;

export function FloatingWarningBanner() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const fixFloatingLayers = useSceneStore((s) => s.fixFloatingLayers);
  const setSelection = useSceneStore((s) => s.setSelection);
  const [floatingIds, setFloatingIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFloatingIds(computeFloatingLayerIds(layers, rootIds));
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [layers, rootIds]);

  // A layer can vanish (deleted, merged) between the debounce firing and
  // the next render — filter defensively so the banner never points at a
  // dangling id.
  const liveIds = floatingIds.filter((id) => layers[id]);
  if (liveIds.length === 0) return null;

  return (
    <div className="floating-warning-banner">
      <span className="floating-warning-icon">⚠</span>
      <span className="floating-warning-text">
        {liveIds.length === 1
          ? "1 shape is floating above the model with no support underneath it"
          : `${liveIds.length} shapes are floating above the model with no support underneath them`}
      </span>
      <button
        type="button"
        className="floating-warning-select-btn"
        onClick={() => setSelection(liveIds)}
        title="Select the floating shape(s)"
      >
        Select
      </button>
      <button
        type="button"
        className="floating-warning-fix-btn"
        onClick={() => fixFloatingLayers(liveIds)}
        title="Drop each floating shape down onto whatever actually supports it"
      >
        Fix
      </button>
    </div>
  );
}
