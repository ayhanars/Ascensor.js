import { useRef } from "react";
import { useStore } from "zustand";
import { useSceneStore } from "../state/store";
import type { ResolvedTheme } from "../state/theme";
import { MoonIcon, RedoIcon, SunIcon, UndoIcon } from "./icons";

interface Props {
  onImportFile: (file: File) => void;
  onExportStl: () => void;
  onResetView: () => void;
  exportDisabled: boolean;
  theme: ResolvedTheme;
  onToggleTheme: () => void;
}

/** A real switch — pill track + sliding thumb — not just a button that
 * changes color when active. */
function ToggleSwitch({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <label className="toggle-switch" title={title}>
      <span className="toggle-switch-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={"toggle-switch-track" + (checked ? " on" : "")}
        onClick={onChange}
      >
        <span className="toggle-switch-thumb" />
      </button>
    </label>
  );
}

export function TopToolbar({
  onImportFile,
  onExportStl,
  onResetView,
  exportDisabled,
  theme,
  onToggleTheme,
}: Props) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const showGrid = useSceneStore((s) => s.showGrid);
  const toggleGrid = useSceneStore((s) => s.toggleGrid);
  const wireframe = useSceneStore((s) => s.wireframe);
  const toggleWireframe = useSceneStore((s) => s.toggleWireframe);
  const newProject = useSceneStore((s) => s.newProject);
  const autoStackLayers = useSceneStore((s) => s.autoStackLayers);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canUndo = useStore(useSceneStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useSceneStore.temporal, (s) => s.futureStates.length > 0);

  return (
    <div className="toolbar">
      <div className="toolbar-brand">SVG → 3D Print</div>
      <div className="toolbar-sep" />

      <button
        className="toolbar-btn"
        onClick={() => {
          if (confirm("Start a new project? Unsaved changes will be lost.")) newProject();
        }}
      >
        New
      </button>

      <button className="toolbar-btn" onClick={() => fileInputRef.current?.click()}>
        Import SVG
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = "";
        }}
      />

      <button className="toolbar-btn primary" onClick={onExportStl} disabled={exportDisabled}>
        Export STL
      </button>

      <div className="toolbar-sep" />

      <button
        className="toolbar-btn"
        title="Undo (Cmd/Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => useSceneStore.temporal.getState().undo()}
      >
        <UndoIcon />
      </button>
      <button
        className="toolbar-btn"
        title="Redo (Cmd/Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => useSceneStore.temporal.getState().redo()}
      >
        <RedoIcon />
      </button>

      <div className="toolbar-sep" />

      <div className="toolbar-toggle-group">
        <button className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")}>
          2D
        </button>
        <button className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")}>
          3D
        </button>
      </div>

      <button className="toolbar-btn" onClick={onResetView}>
        Reset View
      </button>

      <button
        className="toolbar-btn"
        onClick={autoStackLayers}
        title="Stack every layer bottom-to-top with no overlap, in layer-panel order"
      >
        Auto-Stack
      </button>

      <ToggleSwitch label="Grid" checked={showGrid} onChange={toggleGrid} />

      {viewMode === "3d" && (
        <ToggleSwitch
          label="Wireframe"
          checked={wireframe}
          onChange={toggleWireframe}
          title="See through solid surfaces to check nested or hidden geometry"
        />
      )}

      <div className="toolbar-spacer" />

      <button
        className="toolbar-btn"
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onClick={onToggleTheme}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
