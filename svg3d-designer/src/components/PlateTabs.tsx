import { useState } from "react";
import { getRootIdsForPlate, useSceneStore } from "../state/store";
import { PlusIcon, TrashIcon } from "./icons";

const LAYER_IDS_MIME = "application/x-svg3d-layer-ids";

export function PlateTabs() {
  const plates = useSceneStore((s) => s.plates);
  const activePlateId = useSceneStore((s) => s.activePlateId);
  const rootIds = useSceneStore((s) => s.rootIds);
  const plateOf = useSceneStore((s) => s.plateOf);
  const addPlate = useSceneStore((s) => s.addPlate);
  const renamePlate = useSceneStore((s) => s.renamePlate);
  const deletePlate = useSceneStore((s) => s.deletePlate);
  const setActivePlate = useSceneStore((s) => s.setActivePlate);
  const moveRootsToPlate = useSceneStore((s) => s.moveRootsToPlate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function commitRename(id: string) {
    if (draftName.trim()) renamePlate(id, draftName);
    setEditingId(null);
  }

  function handleDeletePlate(id: string, name: string) {
    const count = getRootIdsForPlate({ rootIds, plateOf, plates }, id).length;
    if (count > 0 && !confirm(`Delete "${name}" and its ${count} object${count === 1 ? "" : "s"}?`)) return;
    deletePlate(id);
  }

  return (
    <div className="plate-tabs">
      {plates.map((plate) => {
        const isActive = plate.id === activePlateId;
        const isEditing = editingId === plate.id;
        return (
          <div
            key={plate.id}
            className={"plate-tab" + (isActive ? " active" : "") + (dropTargetId === plate.id ? " drop-target" : "")}
            onClick={() => !isEditing && setActivePlate(plate.id)}
            onDoubleClick={() => {
              setEditingId(plate.id);
              setDraftName(plate.name);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(LAYER_IDS_MIME)) return;
              e.preventDefault();
              setDropTargetId(plate.id);
            }}
            onDragLeave={() => setDropTargetId((t) => (t === plate.id ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTargetId(null);
              const raw = e.dataTransfer.getData(LAYER_IDS_MIME);
              if (!raw) return;
              try {
                const ids = JSON.parse(raw) as string[];
                if (Array.isArray(ids) && ids.length > 0) moveRootsToPlate(ids, plate.id);
              } catch {
                // Malformed payload (not from our own layer panel) — ignore.
              }
            }}
            title={isActive ? undefined : `Switch to ${plate.name} — or drag objects here to move them onto it`}
          >
            {isEditing ? (
              <input
                autoFocus
                className="plate-tab-name-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => commitRename(plate.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(plate.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="plate-tab-name">{plate.name}</span>
            )}
            {plates.length > 1 && !isEditing && (
              <button
                type="button"
                className="plate-tab-delete-btn"
                title="Delete plate"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePlate(plate.id, plate.name);
                }}
              >
                <TrashIcon size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="plate-tab-add-btn" title="Add plate" onClick={addPlate}>
        <PlusIcon size={13} />
      </button>
    </div>
  );
}
