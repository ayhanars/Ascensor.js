import { useEffect, useState } from "react";
import { computeFloatingLayerSeverities, computeThinFeatureWarnings, type ThinFeatureWarning } from "../state/sceneUtils";
import { useActivePlateRootIds, useSceneStore } from "../state/store";

const CHECK_DEBOUNCE_MS = 450;

export function FloatingWarningBanner() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useActivePlateRootIds();
  const dismissedFloatingIds = useSceneStore((s) => s.dismissedFloatingIds);
  const fixFloatingLayers = useSceneStore((s) => s.fixFloatingLayers);
  const dismissFloatingWarning = useSceneStore((s) => s.dismissFloatingWarning);
  const setSelection = useSceneStore((s) => s.setSelection);
  const [severities, setSeverities] = useState<{ critical: string[]; partial: string[] }>({
    critical: [],
    partial: [],
  });
  const [thinFeatures, setThinFeatures] = useState<ThinFeatureWarning[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSeverities(computeFloatingLayerSeverities(layers, rootIds));
      setThinFeatures(computeThinFeatureWarnings(layers, rootIds));
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [layers, rootIds]);

  const criticalIds = severities.critical.filter((id) => layers[id]);
  const partialIds = severities.partial.filter((id) => layers[id] && !dismissedFloatingIds.includes(id));
  const thinFeatureWarnings = thinFeatures.filter((w) => layers[w.id]);
  const thinFeatureIds = thinFeatureWarnings.map((w) => w.id);
  const narrowestThinFeatureMM = thinFeatureWarnings.reduce(
    (min, w) => Math.min(min, w.minWidthMM),
    Infinity,
  );

  if (criticalIds.length === 0 && partialIds.length === 0 && thinFeatureIds.length === 0) return null;

  return (
    <div className="floating-warning-stack">
      {criticalIds.length > 0 && (
        <div className="floating-warning-banner floating-warning-banner--critical">
          <span className="floating-warning-icon">⚠</span>
          <span className="floating-warning-text">
            {criticalIds.length === 1
              ? "1 shape is floating above the model with no support underneath it"
              : `${criticalIds.length} shapes are floating above the model with no support underneath them`}
          </span>
          <button
            type="button"
            className="floating-warning-select-btn"
            onClick={() => setSelection(criticalIds)}
            title="Select the floating shape(s)"
          >
            Select
          </button>
          <button
            type="button"
            className="floating-warning-fix-btn"
            onClick={() => fixFloatingLayers(criticalIds)}
            title="Drop each floating shape down onto whatever actually supports it"
          >
            Fix
          </button>
        </div>
      )}
      {partialIds.length > 0 && (
        <div className="floating-warning-banner">
          <span className="floating-warning-icon">⚠</span>
          <span className="floating-warning-text">
            {partialIds.length === 1
              ? "1 shape only partially rests on what's below it"
              : `${partialIds.length} shapes only partially rest on what's below them`}
          </span>
          <button
            type="button"
            className="floating-warning-select-btn"
            onClick={() => setSelection(partialIds)}
            title="Select the partially-supported shape(s)"
          >
            Select
          </button>
          <button
            type="button"
            className="floating-warning-dismiss-btn"
            onClick={() => dismissFloatingWarning(partialIds)}
            title="This is fine — dismiss this warning for these shape(s)"
          >
            Dismiss
          </button>
        </div>
      )}
      {thinFeatureIds.length > 0 && (
        <div className="floating-warning-banner floating-warning-banner--critical">
          <span className="floating-warning-icon">⚠</span>
          <span className="floating-warning-text">
            {thinFeatureIds.length === 1
              ? `1 shape has a feature as thin as ${narrowestThinFeatureMM.toFixed(2)}mm — likely too narrow for a standard nozzle`
              : `${thinFeatureIds.length} shapes have a feature as thin as ${narrowestThinFeatureMM.toFixed(2)}mm — likely too narrow for a standard nozzle`}
          </span>
          <button
            type="button"
            className="floating-warning-select-btn"
            onClick={() => setSelection(thinFeatureIds)}
            title="Select the shape(s) with a too-thin feature — widen it in your source file and re-import, or thicken it here"
          >
            Select
          </button>
        </div>
      )}
    </div>
  );
}
