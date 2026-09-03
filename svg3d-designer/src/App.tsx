import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { TopToolbar } from "./components/TopToolbar";
import { LayerPanel } from "./components/LayerPanel";
import { Inspector } from "./components/Inspector";
import { Canvas2D } from "./components/Canvas2D";
import { Viewport3D } from "./components/Viewport3D";
import { ShapeToolbar } from "./components/ShapeToolbar";
import { ImportDialog } from "./components/ImportDialog";
import { useSceneStore } from "./state/store";
import { useTheme } from "./state/theme";
import { isEffectivelyVisible } from "./state/sceneUtils";
import { mergeSceneIntoSingleLayer, parseSvgToScene, type ParsedScene } from "./svg/parse";
import { exportSceneToStl } from "./export/stl";

function App() {
  const viewMode = useSceneStore((s) => s.viewMode);
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const documentName = useSceneStore((s) => s.document.name);
  const importParsedScene = useSceneStore((s) => s.importParsedScene);

  const [pendingImport, setPendingImport] = useState<ParsedScene | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [resetSignal, setResetSignal] = useState(0);
  const { resolved: theme, toggle: toggleTheme } = useTheme();

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseSvgToScene(text, file.name);
      if (parsed.rootIds.length === 0) {
        setImportError(
          `Nothing printable was found in "${file.name}". It may contain only text, images, or unfilled strokes, which aren't supported yet.`,
        );
        return;
      }
      setPendingImport(parsed);
    } catch {
      setImportError(`"${file.name}" could not be read as a valid SVG file.`);
    }
  }, []);

  const hasVisibleGeometry = Object.values(layers).some(
    (l) => l.type === "shape" && isEffectivelyVisible(layers, l.id),
  );

  // Global shortcuts, kept at Figma's level for the actions this app has:
  // undo/redo, duplicate, select all, merge, delete, deselect. Typing in
  // any form field is left entirely alone — the browser's own undo/select
  // handles that, and Delete/Backspace must still work to erase text.
  useEffect(() => {
    // Text-entry types have real native undo/select-all/delete-text
    // behavior we must not steal. Other input types (range, color,
    // checkbox, ...) have no such native behavior, so our shortcuts
    // should reach them normally — e.g. Cmd/Ctrl+Z after dragging the
    // corner-radius slider must still undo the scene change.
    const TEXT_ENTRY_TYPES = new Set([
      "text", "number", "search", "email", "tel", "url", "password", "date",
      "datetime-local", "month", "time", "week",
    ]);

    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.tagName === "INPUT") {
        const type = (el as HTMLInputElement).type || "text";
        return TEXT_ENTRY_TYPES.has(type);
      }
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const store = useSceneStore.getState();

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useSceneStore.temporal.getState().redo();
        else useSceneStore.temporal.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useSceneStore.temporal.getState().redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (store.selection.length > 0) store.duplicateSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        if (store.selection.length >= 1) {
          e.preventDefault();
          store.mergeLayers(store.selection);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) store.ungroupSelection();
        else if (store.selection.length >= 2) store.groupSelection();
        return;
      }
      if (e.key === "Escape") {
        store.clearSelection();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.selection.length > 0) {
          e.preventDefault();
          store.deleteSelection();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragCounter.current++;
        setIsDragOver(true);
      }}
      onDragLeave={() => {
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragOver(false);
        const file = Array.from(e.dataTransfer.files).find((f) => /\.svg$/i.test(f.name));
        if (file) handleImportFile(file);
        else setImportError("Drop a .svg file to import it.");
      }}
    >
      <TopToolbar
        onImportFile={handleImportFile}
        onExportStl={() => exportSceneToStl(layers, rootIds, documentName)}
        onResetView={() => setResetSignal((n) => n + 1)}
        exportDisabled={!hasVisibleGeometry}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="main-body">
        <LayerPanel />

        <div className="canvas-area">
          {viewMode === "2d" ? (
            <Canvas2D resetSignal={resetSignal} />
          ) : (
            <Viewport3D resetSignal={resetSignal} theme={theme} />
          )}
          {viewMode === "2d" && <ShapeToolbar />}
          {isDragOver && <div className="dropzone-overlay">Drop SVG to import</div>}
        </div>

        <Inspector />
      </div>

      {pendingImport && (
        <ImportDialog
          summary={pendingImport.summary}
          onCancel={() => setPendingImport(null)}
          onConfirm={(mode) => {
            const scene =
              mode === "layers"
                ? { layers: pendingImport.layers, rootIds: pendingImport.rootIds }
                : mergeSceneIntoSingleLayer(pendingImport, pendingImport.summary.fileName.replace(/\.svg$/i, ""));
            importParsedScene({
              layers: scene.layers,
              rootIds: scene.rootIds,
              widthMM: pendingImport.widthMM,
              heightMM: pendingImport.heightMM,
            });
            setPendingImport(null);
          }}
        />
      )}

      {importError && (
        <div className="dialog-backdrop" onMouseDown={() => setImportError(null)}>
          <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-header">Import problem</div>
            <div className="dialog-body">{importError}</div>
            <div className="dialog-footer">
              <button className="btn primary" onClick={() => setImportError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
