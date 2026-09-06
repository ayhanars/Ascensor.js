import { useEffect, useState } from "react";
import { useSceneStore } from "../state/store";
import {
  deleteProject,
  listProjects,
  renameProjectMeta,
  type ProjectMeta,
} from "../state/projects";
import { TrashIcon } from "./icons";

interface Props {
  onClose: () => void;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function ProjectBrowser({ onClose }: Props) {
  const activeProjectId = useSceneStore((s) => s.activeProjectId);
  const documentName = useSceneStore((s) => s.document.name);
  const loadProject = useSceneStore((s) => s.loadProject);
  const newProject = useSceneStore((s) => s.newProject);

  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  // The currently-open project's own name lives in the store (it's just
  // been edited or autosaved) rather than whatever the index last saw —
  // reconcile so its card doesn't show a stale name for a beat.
  useEffect(() => {
    setProjects((prev) => prev.map((p) => (p.id === activeProjectId ? { ...p, name: documentName } : p)));
  }, [activeProjectId, documentName]);

  function refresh() {
    setProjects(listProjects());
  }

  function commitRename(id: string) {
    const trimmed = draftName.trim();
    if (trimmed) {
      renameProjectMeta(id, trimmed);
      if (id === activeProjectId) useSceneStore.getState().setDocumentName(trimmed);
      refresh();
    }
    setEditingId(null);
  }

  function handleOpen(id: string) {
    if (id === activeProjectId) {
      onClose();
      return;
    }
    loadProject(id);
    onClose();
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    if (id === activeProjectId) {
      // Never leave the deleted project as the one still open — autosave
      // would otherwise just write it right back into storage.
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) loadProject(remaining[0].id);
      else newProject();
    }
    deleteProject(id);
    refresh();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog-wide">
        <div className="dialog-header">Projects</div>
        <div className="dialog-body">
          <div className="project-section-title">Local Projects</div>
          <div className="project-grid">
            <button type="button" className="project-card project-card-new" onClick={() => { newProject(); onClose(); }}>
              <span className="project-card-new-plus">+</span>
              <span>New Project</span>
            </button>
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className={"project-card" + (isActive ? " active" : "")}
                  // Clicking the ALREADY-active card is a no-op rather than
                  // closing the dialog — closing on the first click of a
                  // double-click would fire before the second click ever
                  // reaches the rename handler below, and there's nothing
                  // else useful for a click on the project you're already in.
                  onClick={() => !isEditing && !isActive && handleOpen(p.id)}
                >
                  <button
                    type="button"
                    className="project-card-delete-btn"
                    title="Delete project"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.name);
                    }}
                  >
                    <TrashIcon size={12} />
                  </button>
                  {isEditing ? (
                    <input
                      autoFocus
                      className="project-card-name-input"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(p.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="project-card-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(p.id);
                        setDraftName(p.name);
                      }}
                      title={p.name}
                    >
                      {p.name}
                      {isActive && <span className="project-card-active-tag">current</span>}
                    </div>
                  )}
                  <div className="project-card-meta">Edited {formatRelativeTime(p.updatedAt)}</div>
                </div>
              );
            })}
          </div>

          <div className="project-section-title" style={{ marginTop: 18 }}>
            Cloud Projects
          </div>
          <div className="project-cloud-placeholder">
            Cloud sync isn't set up yet — projects stay on this device for now. Once it's available, they'll
            show up here too and follow you across devices.
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
