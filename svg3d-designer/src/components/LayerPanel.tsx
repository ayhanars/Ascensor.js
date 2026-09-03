import { useState } from "react";
import { useSceneStore } from "../state/store";
import { flattenForDisplay, isEffectivelyVisible, isEffectivelyLocked } from "../state/sceneUtils";
import {
  DuplicateIcon,
  EyeIcon,
  EyeOffIcon,
  GroupIcon,
  LockIcon,
  ShapeIcon,
  TrashIcon,
  UnlockIcon,
} from "./icons";
import type { Layer } from "../types";

type DropPosition = "above" | "below" | "inside";

function siblingContext(layers: Record<string, Layer>, rootIds: string[], id: string) {
  const layer = layers[id];
  if (!layer) return { parentId: null as string | null, siblings: rootIds };
  if (layer.parentId) {
    const parent = layers[layer.parentId];
    return { parentId: layer.parentId, siblings: parent && parent.type === "group" ? parent.children : [] };
  }
  return { parentId: null, siblings: rootIds };
}

export function LayerPanel() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);
  const selectLayer = useSceneStore((s) => s.selectLayer);
  const toggleVisibility = useSceneStore((s) => s.toggleVisibility);
  const toggleLock = useSceneStore((s) => s.toggleLock);
  const renameLayer = useSceneStore((s) => s.renameLayer);
  const deleteLayer = useSceneStore((s) => s.deleteLayer);
  const duplicateLayer = useSceneStore((s) => s.duplicateLayer);
  const moveLayers = useSceneStore((s) => s.moveLayers);
  const setSelection = useSceneStore((s) => s.setSelection);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  // Every id being dragged — the whole current selection when the dragged
  // row was already part of it, otherwise just that one row. Fixed at drag
  // start so a multi-selection actually moves together into a folder,
  // instead of dropping only the single row the pointer happened to grab.
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);

  const rows = flattenForDisplay(layers, rootIds);

  function commitRename(id: string) {
    const name = draftName.trim();
    if (name) renameLayer(id, name);
    setEditingId(null);
  }

  function handleDrop(targetId: string, position: DropPosition) {
    if (!dragId || dragIds.length === 0) return;
    const targetLayer = layers[targetId];
    if (!targetLayer) return;

    if (position === "inside" && targetLayer.type === "group") {
      moveLayers(dragIds, targetId, targetLayer.children.length);
    } else {
      const { parentId, siblings } = siblingContext(layers, rootIds, targetId);
      let index = siblings.indexOf(targetId);
      if (position === "below") index += 1;
      moveLayers(dragIds, parentId, index);
    }
    setDragId(null);
    setDragIds([]);
    setDropTarget(null);
  }

  if (rows.length === 0) {
    return (
      <div className="sidebar sidebar-left">
        <div className="sidebar-header">Layers</div>
        <div className="layer-empty">
          No layers yet.
          <br />
          Import an SVG to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar sidebar-left">
      <div className="sidebar-header">Layers</div>
      <div className="layer-list">
        {rows.map(({ id, depth }) => {
          const layer = layers[id];
          if (!layer) return null;
          const selected = selection.includes(id);
          const visible = isEffectivelyVisible(layers, id);
          const locked = isEffectivelyLocked(layers, id);
          const isEditing = editingId === id;
          const isDropTarget = dropTarget?.id === id;
          const isHole = layer.type === "shape" && layer.isHole;

          return (
            <div
              key={id}
              className={[
                "layer-row",
                selected ? "selected" : "",
                !layer.visible ? "dim" : "",
                isDropTarget ? `drop-${dropTarget.position}` : "",
                isHole ? "hole" : "",
              ].join(" ").trim()}
              style={{ paddingLeft: 8 + depth * 14 }}
              draggable={!isEditing}
              onDragStart={(e) => {
                setDragId(id);
                // Dragging a row that's already part of the current
                // multi-selection moves the WHOLE selection together;
                // dragging any other row selects and moves just that one
                // (replacing the old selection), matching how the canvas's
                // own drag already resolves this.
                if (selected && selection.length > 1) {
                  setDragIds(selection);
                } else {
                  setDragIds([id]);
                  setSelection([id]);
                }
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragId || dragIds.includes(id)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientY - rect.top) / rect.height;
                let position: DropPosition = ratio < 0.25 ? "above" : ratio > 0.75 ? "below" : "inside";
                if (position === "inside" && layer.type !== "group") {
                  position = ratio < 0.5 ? "above" : "below";
                }
                setDropTarget({ id, position });
              }}
              onDragLeave={() => setDropTarget((t) => (t?.id === id ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                // Without this, an internal row-to-row reorder drop bubbles
                // up to the app-level drag/drop handler meant for OS file
                // drops — which sees no dropped Files and pops the "Drop a
                // .svg file to import it" error dialog on every reorder.
                e.stopPropagation();
                if (dropTarget?.id === id) handleDrop(id, dropTarget.position);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragIds([]);
                setDropTarget(null);
              }}
              onClick={(e) => selectLayer(id, e.shiftKey || e.metaKey || e.ctrlKey)}
            >
              <span className="layer-type-icon">
                {layer.type === "group" ? <GroupIcon /> : <ShapeIcon />}
              </span>

              <span
                className={"layer-swatch" + (isHole ? " hole" : "")}
                style={{
                  background: isHole ? "transparent" : layer.type === "shape" ? layer.color : "transparent",
                  borderStyle: layer.type === "group" ? "dashed" : isHole ? "dashed" : "solid",
                }}
              />

              {isEditing ? (
                <input
                  autoFocus
                  className="layer-name-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={"layer-name" + (isHole ? " hole" : "")}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(id);
                    setDraftName(layer.name);
                  }}
                  title={isHole ? `${layer.name} (negative space)` : layer.name}
                >
                  {layer.name}
                </span>
              )}

              <div className="layer-actions">
                <button
                  className="icon-btn"
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateLayer(id);
                  }}
                >
                  <DuplicateIcon size={13} />
                </button>
                <button
                  className="icon-btn"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteLayer(id);
                  }}
                >
                  <TrashIcon size={13} />
                </button>
              </div>

              <button
                className={"icon-btn" + (locked && !layer.locked ? " muted" : "")}
                title={layer.locked ? "Unlock" : "Lock"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(id);
                }}
              >
                {layer.locked ? <LockIcon size={13} /> : <UnlockIcon size={13} />}
              </button>
              <button
                className={"icon-btn" + (!visible ? " muted" : "")}
                title={layer.visible ? "Hide" : "Show"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(id);
                }}
              >
                {layer.visible ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
