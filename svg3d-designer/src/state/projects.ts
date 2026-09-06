import type { DocumentSettings, Layer, Plate } from "../types";

/**
 * Local project storage — no server yet, so every project lives entirely
 * in this browser's localStorage. A lightweight index (name/timestamps
 * only) lets the project browser list everything without parsing every
 * project's full content, which is kept in its own separate key so
 * opening one project never requires reading the others.
 */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Exactly the document-content shape a project persists — matches the
 * scene store's own undo-tracked slice, kept as an independent type here
 * so this module has no dependency on the store. */
export interface ProjectContent {
  document: DocumentSettings;
  layers: Record<string, Layer>;
  rootIds: string[];
  plates: Plate[];
  plateOf: Record<string, string>;
  /** Optional so projects saved before this field existed still parse. */
  dismissedFloatingIds?: string[];
}

const INDEX_KEY = "svg3d-designer:projects:index";
const CONTENT_KEY_PREFIX = "svg3d-designer:projects:content:";
const ACTIVE_KEY = "svg3d-designer:projects:activeId";

function readIndex(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectMeta[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    // Storage full or disabled — the project list just won't remember
    // this change; nothing to recover from here.
  }
}

/** Most-recently-edited first, matching how a file browser normally sorts. */
export function listProjects(): ProjectMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Private browsing / storage disabled — reopening the app will just
    // fall back to creating a fresh project instead of resuming this one.
  }
}

export function loadProjectContent(id: string): ProjectContent | null {
  try {
    const raw = localStorage.getItem(CONTENT_KEY_PREFIX + id);
    return raw ? (JSON.parse(raw) as ProjectContent) : null;
  } catch {
    return null;
  }
}

export function saveProjectContent(id: string, content: ProjectContent): void {
  try {
    localStorage.setItem(CONTENT_KEY_PREFIX + id, JSON.stringify(content));
  } catch {
    // Quota exceeded or storage disabled — autosave silently no-ops rather
    // than crashing the app; the user's in-memory work is still intact
    // for the rest of this session.
  }
}

export function deleteProject(id: string): void {
  writeIndex(readIndex().filter((p) => p.id !== id));
  try {
    localStorage.removeItem(CONTENT_KEY_PREFIX + id);
  } catch {
    // Nothing more to do — the index entry is already gone either way.
  }
}

/** Creates the index entry the first time a project is saved, or bumps
 * its name/updatedAt on every autosave after that. */
export function touchProjectMeta(id: string, name: string): void {
  const list = readIndex();
  const idx = list.findIndex((p) => p.id === id);
  const now = Date.now();
  if (idx === -1) list.push({ id, name, createdAt: now, updatedAt: now });
  else list[idx] = { ...list[idx], name, updatedAt: now };
  writeIndex(list);
}

/** Renaming from the project browser (a project that isn't currently
 * open) only touches the index — the content file's own document.name
 * is reconciled the next time that project is actually opened and
 * autosaved, at which point touchProjectMeta overwrites this anyway. */
export function renameProjectMeta(id: string, name: string): void {
  const list = readIndex();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], name };
  writeIndex(list);
}
