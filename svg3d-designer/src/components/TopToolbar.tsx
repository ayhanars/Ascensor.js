import { useRef } from "react";
import { useSceneStore } from "../state/store";

interface Props {
  onImportFile: (file: File) => void;
  onExportStl: () => void;
  onResetView: () => void;
  exportDisabled: boolean;
}

export function TopToolbar({ onImportFile, onExportStl, onResetView, exportDisabled }: Props) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const showGrid = useSceneStore((s) => s.showGrid);
  const toggleGrid = useSceneStore((s) => s.toggleGrid);
  const newProject = useSceneStore((s) => s.newProject);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        onClick={toggleGrid}
        style={{ color: showGrid ? "var(--accent)" : undefined }}
      >
        Grid
      </button>

      <div className="toolbar-spacer" />
      <div style={{ color: "var(--text-faint)", fontSize: 11 }}>Phase 1 MVP</div>
    </div>
  );
}
