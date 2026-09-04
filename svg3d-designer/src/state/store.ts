import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type {
  AlignMode,
  DocumentSettings,
  GroupLayer,
  Layer,
  Plate,
  PrintBed,
  ShapeLayer,
  ShapeRegion,
  Transform2D,
  Units,
  ViewMode2D3D,
} from "../types";
import {
  applyTransform2D,
  collectAllDescendantIds,
  collectShapeLayers,
  flattenForDisplay,
  boundsOverlap,
  type Bounds,
  getLayerWorldBounds,
  getMultiLayerWorldBounds,
  getTopLevelId,
  getWorldRegions,
  getWorldTransform,
  IDENTITY_TRANSFORM,
  invertTransform2D,
} from "./sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import {
  differenceRegions,
  intersectionRegions,
  regionsIntersectionArea,
  unionRegions,
  xorRegions,
} from "../geometry/booleanOps";
import { showToast } from "./toastStore";

/**
 * Solves for the local transform that, composed under `newParentWorld`
 * (using the same per-level rule `getWorldTransform` composes with), lands
 * exactly on `world` — i.e. "how do I express this same absolute position
 * relative to a different parent." Used any time a layer is reparented
 * (grouping, ungrouping) so the move never visibly shifts anything.
 */
function rebaseWorldToParent(world: Transform2D, newParentWorld: Transform2D): Transform2D {
  const rad = (newParentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = world.x - newParentWorld.x;
  const dy = world.y - newParentWorld.y;
  return {
    x: (dx * cos + dy * sin) / newParentWorld.scaleX,
    y: (-dx * sin + dy * cos) / newParentWorld.scaleY,
    z: world.z - newParentWorld.z,
    rotation: world.rotation - newParentWorld.rotation,
    scaleX: world.scaleX / newParentWorld.scaleX,
    scaleY: world.scaleY / newParentWorld.scaleY,
  };
}

/** Cmd+C/Cmd+V clipboard — deliberately a plain module variable, not part
 * of the store: it must survive selection changes and isn't itself
 * document content, so it shouldn't be undo-tracked or persisted. */
let clipboard: { layers: Record<string, Layer>; rootIds: string[] } | null = null;

/**
 * Every top-level (root) layer belongs to exactly one plate — `plateOf`
 * maps a root layer id to its plate's id. An entry only exists for
 * layers that are (or were) root-level; a root with no entry defaults to
 * the first plate, which covers every layer created before plates existed
 * (or restored from an older save) without needing a migration pass.
 */
export function getRootIdsForPlate(
  state: Pick<SceneState, "rootIds" | "plateOf" | "plates">,
  plateId: string,
): string[] {
  const fallback = state.plates[0]?.id;
  return state.rootIds.filter((id) => (state.plateOf[id] ?? fallback) === plateId);
}

/** "Plate 1", "Plate 2", ... — picks the next free number rather than just
 * `plates.length + 1`, so re-adding a plate after deleting one in the
 * middle never collides with a name that's still in use. */
function nextPlateName(plates: Plate[]): string {
  const used = new Set(
    plates.map((p) => /^Plate (\d+)$/.exec(p.name)).filter((m): m is RegExpExecArray => !!m).map((m) => parseInt(m[1], 10)),
  );
  let n = 1;
  while (used.has(n)) n++;
  return `Plate ${n}`;
}

function defaultPlates(): { plates: Plate[]; activePlateId: string } {
  const id = nanoid(8);
  return { plates: [{ id, name: "Plate 1" }], activePlateId: id };
}

export const BED_PRESETS: PrintBed[] = [
  { name: "Bambu Lab X1 Carbon", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab X1", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab X1E", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab X2D", width: 256, depth: 256, height: 260 },
  { name: "Bambu Lab P1S", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab P1P", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab P2S", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab A1", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab A1 mini", width: 180, depth: 180, height: 180 },
  { name: "Bambu Lab A2L", width: 330, depth: 320, height: 325 },
  { name: "Bambu Lab H2D", width: 350, depth: 320, height: 325 },
  { name: "Bambu Lab H2C", width: 330, depth: 320, height: 325 },
  { name: "Custom", width: 200, depth: 200, height: 200 },
];

// A pinned default bed preset — deliberately plain localStorage, not part
// of the scene/undo state: it's a standing app preference ("I always print
// on my X1 Carbon"), not document content, so it shouldn't be undoable and
// should survive across brand-new projects, not just this one document.
const PINNED_BED_PRESET_KEY = "svg3d-designer:pinnedBedPreset";

export function getPinnedBedPresetName(): string | null {
  try {
    return localStorage.getItem(PINNED_BED_PRESET_KEY);
  } catch {
    return null;
  }
}

export function setPinnedBedPresetName(name: string | null): void {
  try {
    if (name) localStorage.setItem(PINNED_BED_PRESET_KEY, name);
    else localStorage.removeItem(PINNED_BED_PRESET_KEY);
  } catch {
    // Private-browsing / storage-disabled — the pin just won't persist
    // across reloads, which is an acceptable degrade, not worth surfacing.
  }
}

function defaultDocument(): DocumentSettings {
  const pinnedName = getPinnedBedPresetName();
  const pinned = pinnedName ? BED_PRESETS.find((p) => p.name === pinnedName) : undefined;
  return {
    name: "Untitled",
    // A pinned bed should open pre-matched to it, not just carried in
    // `bed` while the artboard silently stays at the plain 100x100
    // default — otherwise "always open with this bed size" only half
    // worked (right printer, wrong-size artboard).
    widthMM: pinned ? pinned.width : 100,
    heightMM: pinned ? pinned.depth : 100,
    units: "mm",
    bed: { ...(pinned ?? BED_PRESETS[0]) },
  };
}

interface SceneState {
  document: DocumentSettings;
  layers: Record<string, Layer>;
  rootIds: string[];
  plates: Plate[];
  /** Root layer id -> plate id. Missing entries default to `plates[0]`. */
  plateOf: Record<string, string>;
  /** Which plate the canvas/viewport/layer panel currently show — a view
   * concern like `selection`/`viewMode`, not undo-tracked. */
  activePlateId: string;
  selection: string[];
  viewMode: ViewMode2D3D;
  showGrid: boolean;
  wireframe: boolean;

  addPlate: () => void;
  renamePlate: (id: string, name: string) => void;
  deletePlate: (id: string) => void;
  setActivePlate: (id: string) => void;
  /** Reassigns the top-level ancestor of each id to a different plate —
   * how an object "doesn't fit" on one plate moves to another. */
  moveRootsToPlate: (ids: string[], plateId: string) => void;

  newProject: () => void;
  importParsedScene: (input: {
    layers: Record<string, Layer>;
    rootIds: string[];
    widthMM: number;
    heightMM: number;
  }) => void;

  selectLayer: (id: string, additive?: boolean) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;

  renameLayer: (id: string, name: string) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  setLayerColor: (id: string, color: string) => void;
  setLayerTransform: (id: string, patch: Partial<Transform2D>) => void;
  setExtrusionDepth: (id: string, depth: number) => void;
  setCornerRadius: (id: string, radius: number) => void;
  setBevelBottom: (id: string, mm: number) => void;
  setBevelTop: (id: string, mm: number) => void;
  setIsHole: (id: string, value: boolean) => void;
  /**
   * Repositions a hole shape into a recessed pocket instead of a full
   * through-hole: sinks it `floorThicknessMM` above the bottom of whatever
   * solid(s) it overlaps, leaving that much material as a floor (e.g. to
   * embed a magnet without it showing through), while still fully
   * punching through the top. No-op if the hole doesn't overlap a solid.
   */
  snapHoleToRecessedPocket: (id: string, floorThicknessMM: number) => void;
  setLayerZ: (id: string, z: number) => void;
  autoStackLayers: () => void;
  fixFloatingLayers: (ids: string[]) => void;
  deleteLayer: (id: string) => void;
  deleteSelection: () => void;
  duplicateLayer: (id: string) => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  moveLayers: (ids: string[], targetParentId: string | null, index: number) => void;
  mergeLayers: (ids: string[]) => void;
  booleanOp: (ids: string[], op: "subtract" | "intersect" | "exclude") => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  alignSelection: (mode: AlignMode) => void;
  selectAll: () => void;

  setViewMode: (mode: ViewMode2D3D) => void;
  toggleGrid: () => void;
  toggleWireframe: () => void;
  setBed: (bed: Partial<PrintBed>) => void;
  setDocumentName: (name: string) => void;
  setUnits: (units: Units) => void;
  fitDocumentToSelection: () => void;
  matchDocumentToBed: () => void;
  createShapeLayer: (kind: "rect" | "circle" | "hole") => void;
}

/**
 * The slice of state that undo/redo tracks — deliberately just the document
 * content. View-only flags (viewMode, showGrid) are excluded so toggling
 * them never creates a history entry, and so is `selection`: a plain click
 * to select something isn't an undoable edit in Figma either, and tracking
 * it would flood the history with no-op steps every time you click around.
 */
export interface TrackedSceneSlice {
  document: DocumentSettings;
  layers: Record<string, Layer>;
  rootIds: string[];
  plates: Plate[];
  plateOf: Record<string, string>;
}

function partializeScene(state: SceneState): TrackedSceneSlice {
  return {
    document: state.document,
    layers: state.layers,
    rootIds: state.rootIds,
    plates: state.plates,
    plateOf: state.plateOf,
  };
}

export const useSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
  document: defaultDocument(),
  layers: {},
  rootIds: [],
  ...defaultPlates(),
  plateOf: {},
  selection: [],
  viewMode: "2d",
  showGrid: true,
  wireframe: false,

  addPlate: () =>
    set((state) => {
      const id = nanoid(8);
      const name = nextPlateName(state.plates);
      return { plates: [...state.plates, { id, name }], activePlateId: id, selection: [] };
    }),

  renamePlate: (id, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return {};
      return { plates: state.plates.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) };
    }),

  deletePlate: (id) =>
    set((state) => {
      // Always keep at least one plate — there's nowhere else for the
      // document's objects (or a freshly drawn shape) to live.
      if (state.plates.length <= 1) return {};
      const idsOnPlate = getRootIdsForPlate(state, id);

      const layers = { ...state.layers };
      let rootIds = state.rootIds;
      for (const rootId of idsOnPlate) {
        const toRemove = new Set([rootId, ...collectAllDescendantIds(state.layers, rootId)]);
        for (const rid of toRemove) delete layers[rid];
        rootIds = rootIds.filter((r) => r !== rootId);
      }

      const plateOf = { ...state.plateOf };
      for (const rootId of idsOnPlate) delete plateOf[rootId];

      const plates = state.plates.filter((p) => p.id !== id);
      const activePlateId = state.activePlateId === id ? plates[0].id : state.activePlateId;

      return {
        layers,
        rootIds,
        plateOf,
        plates,
        activePlateId,
        selection: state.selection.filter((sid) => !idsOnPlate.includes(sid)),
      };
    }),

  setActivePlate: (id) =>
    set((state) => (state.plates.some((p) => p.id === id) && id !== state.activePlateId ? { activePlateId: id, selection: [] } : {})),

  moveRootsToPlate: (ids, plateId) => {
    let movedCount = 0;
    let plateName = "";
    set((state) => {
      if (!state.plates.some((p) => p.id === plateId)) return {};
      const rootTargets = Array.from(new Set(ids.map((id) => getTopLevelId(state.layers, id))));
      const plateOf = { ...state.plateOf };
      const moved: string[] = [];
      for (const rootId of rootTargets) {
        if (!state.layers[rootId]) continue;
        if ((plateOf[rootId] ?? state.plates[0]?.id) === plateId) continue;
        plateOf[rootId] = plateId;
        moved.push(rootId);
      }
      if (moved.length === 0) return {};
      movedCount = moved.length;
      plateName = state.plates.find((p) => p.id === plateId)?.name ?? "";
      return { plateOf, selection: state.selection.filter((sid) => !moved.includes(sid)) };
    });
    if (movedCount > 0) {
      showToast(`Moved ${movedCount} object${movedCount === 1 ? "" : "s"} to ${plateName}`);
    }
  },

  newProject: () =>
    set({
      document: defaultDocument(),
      layers: {},
      rootIds: [],
      ...defaultPlates(),
      plateOf: {},
      selection: [],
    }),

  importParsedScene: ({ layers, rootIds, widthMM, heightMM }) =>
    set((state) => {
      // Merge the imported tree in as new top-level siblings, and grow the
      // document to fit if the import is larger than the current page.
      const plateOf = { ...state.plateOf };
      for (const id of rootIds) plateOf[id] = state.activePlateId;
      return {
        layers: { ...state.layers, ...layers },
        rootIds: [...state.rootIds, ...rootIds],
        plateOf,
        document: {
          ...state.document,
          widthMM: Math.max(state.document.widthMM, widthMM),
          heightMM: Math.max(state.document.heightMM, heightMM),
        },
        selection: rootIds.slice(),
      };
    }),

  selectLayer: (id, additive) =>
    set((state) => {
      if (!additive) return { selection: [id] };
      const has = state.selection.includes(id);
      return {
        selection: has
          ? state.selection.filter((s) => s !== id)
          : [...state.selection, id],
      };
    }),
  setSelection: (ids) => set({ selection: ids }),
  clearSelection: () => set({ selection: [] }),
  selectAll: () => set((state) => ({ selection: getRootIdsForPlate(state, state.activePlateId) })),

  renameLayer: (id, name) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: { ...state.layers[id], name },
      },
    })),

  toggleVisibility: (id) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, visible: !layer.visible },
        },
      };
    }),

  toggleLock: (id) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, locked: !layer.locked },
        },
      };
    }),

  setLayerColor: (id, color) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      return { layers: { ...state.layers, [id]: { ...layer, color } } };
    }),

  setLayerTransform: (id, patch) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, transform: { ...layer.transform, ...patch } },
        },
      };
    }),

  setExtrusionDepth: (id, depth) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      const clamped = Math.max(0.05, depth);
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, extrusionDepth: clamped } as ShapeLayer,
        },
      };
    }),

  setCornerRadius: (id, radius) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, cornerRadius: Math.max(0, radius) } as ShapeLayer,
        },
      };
    }),

  setBevelBottom: (id, mm) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, bevelBottom: Math.max(0, mm) } as ShapeLayer,
        },
      };
    }),

  setBevelTop: (id, mm) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, bevelTop: Math.max(0, mm) } as ShapeLayer,
        },
      };
    }),

  setIsHole: (id, value) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, isHole: value } as ShapeLayer,
        },
      };
    }),

  snapHoleToRecessedPocket: (id, floorThicknessMM) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      const holeBounds = getLayerWorldBounds(state.layers, id);
      if (!holeBounds) return {};

      // Same overlap test the actual cut (holeSubtraction.ts) uses — every
      // non-hole shape whose XY footprint this hole crosses.
      let bottomZ = Infinity;
      let topZ = -Infinity;
      for (const other of Object.values(state.layers)) {
        if (other.type !== "shape" || other.isHole || other.id === id) continue;
        const bounds = getLayerWorldBounds(state.layers, other.id);
        if (!bounds || !boundsOverlap(bounds, holeBounds)) continue;
        const world = getWorldTransform(state.layers, other.id);
        bottomZ = Math.min(bottomZ, world.z);
        topZ = Math.max(topZ, world.z + other.extrusionDepth);
      }
      if (!Number.isFinite(bottomZ)) return {}; // doesn't overlap anything (yet)

      // A small overshoot past the solid's own top guarantees a fully open
      // pocket mouth even at exact floating-point boundaries — the same
      // "cutter should protrude past what it clears" convention any CAD
      // tool uses for a through-cut.
      const TOP_OVERSHOOT_MM = 1;
      const parentWorldZ = layer.parentId ? getWorldTransform(state.layers, layer.parentId).z : 0;
      const newWorldZ = Math.max(0, bottomZ + Math.max(0, floorThicknessMM));
      const newDepth = Math.max(0.05, topZ + TOP_OVERSHOOT_MM - newWorldZ);

      return {
        layers: {
          ...state.layers,
          [id]: {
            ...layer,
            transform: { ...layer.transform, z: Math.max(0, newWorldZ - parentWorldZ) },
            extrusionDepth: newDepth,
          } as ShapeLayer,
        },
      };
    }),

  setLayerZ: (id, z) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      // Never below the print bed — works for a group too, so a whole
      // sub-assembly can be lifted together.
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, transform: { ...layer.transform, z: Math.max(0, z) } },
        },
      };
    }),

  autoStackLayers: () => {
    set((state) => {
      // Each layer sits on top of whatever it *actually* overlaps — real
      // polygon overlap, not just a bounding-box check — so two unrelated
      // shapes that merely have overlapping bounding boxes (e.g. two
      // circles near the same corner, or an L-shaped part) don't get
      // stacked on each other when their real outlines never touch. Scoped
      // to the active plate only — a different plate is a different
      // physical bed, so its objects have nothing to do with this stack.
      const order = flattenForDisplay(state.layers, getRootIdsForPlate(state, state.activePlateId))
        .map((r) => r.id)
        .filter((id) => state.layers[id]?.type === "shape");

      const layers = { ...state.layers };
      const placed: { regions: ReturnType<typeof getWorldRegions>; topZ: number }[] = [];

      for (const id of order) {
        const layer = layers[id] as ShapeLayer;
        const regions = getWorldRegions(layers, id);

        // baseZ is the tallest already-placed shape this one's real
        // outline genuinely overlaps — not merely bbox-adjacent to. A
        // shape only partially covered by that support (part of it
        // hanging over empty space) is left for the persistent
        // floating-shape banner to catch and offer a targeted fix for.
        let baseZ = 0;
        for (const p of placed) {
          if (p.topZ <= baseZ) continue; // can't raise baseZ any further
          if (regionsIntersectionArea(regions, p.regions) > 1e-6) baseZ = p.topZ;
        }

        // baseZ is a world-space height; convert it back to this layer's
        // own local Z, relative to whatever group it's nested in.
        const parentWorldZ = layer.parentId ? getWorldTransform(layers, layer.parentId).z : 0;
        const localZ = Math.max(0, baseZ - parentWorldZ);
        layers[id] = { ...layer, transform: { ...layer.transform, z: localZ } };

        placed.push({ regions, topZ: baseZ + layer.extrusionDepth });
      }
      return { layers };
    });
    showToast("Auto-stacked all layers");
  },

  fixFloatingLayers: (ids) => {
    let fixedCount = 0;
    set((state) => {
      const layers = { ...state.layers };
      const allIds = flattenForDisplay(state.layers, getRootIdsForPlate(state, state.activePlateId))
        .map((r) => r.id)
        .filter((id) => state.layers[id]?.type === "shape");
      // Support is computed against everyone else's CURRENT position, using
      // the original (pre-fix) snapshot — fixing one floating shape should
      // never change what another floating shape in the same batch is
      // measured against.
      const info = allIds.map((id, orderIndex) => {
        const layer = state.layers[id] as ShapeLayer;
        return {
          id,
          orderIndex,
          layer,
          regions: getWorldRegions(state.layers, id),
          z: getWorldTransform(state.layers, id).z,
        };
      });
      for (const id of ids) {
        const item = info.find((i) => i.id === id);
        if (!item) continue;
        // Only a shape earlier in layer order can be "underneath" this one
        // — the same document-order-is-stacking-order convention
        // autoStackLayers uses. Without this, raising a large background
        // shape that everything else was drawn on top of would have it
        // "rest on" whatever it overlaps and invert the stack, burying the
        // foreground shapes it was actually supposed to support.
        const others = info.filter((o) => o.id !== id && o.orderIndex < item.orderIndex);
        let baseZ = 0;
        for (const o of others) {
          const topZ = o.z + o.layer.extrusionDepth;
          if (topZ <= baseZ) continue;
          if (regionsIntersectionArea(item.regions, o.regions) > 1e-6) baseZ = topZ;
        }
        const parentWorldZ = item.layer.parentId ? getWorldTransform(layers, item.layer.parentId).z : 0;
        const localZ = Math.max(0, baseZ - parentWorldZ);
        layers[id] = { ...layers[id], transform: { ...layers[id].transform, z: localZ } } as ShapeLayer;
        fixedCount++;
      }
      return { layers };
    });
    if (fixedCount > 0) showToast(`Fixed ${fixedCount} floating shape${fixedCount === 1 ? "" : "s"}`);
  },

  deleteLayer: (id) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      const toRemove = new Set([id, ...collectAllDescendantIds(state.layers, id)]);
      const layers = { ...state.layers };
      for (const rid of toRemove) delete layers[rid];

      let rootIds = state.rootIds;
      let plateOf = state.plateOf;
      if (layer.parentId) {
        const parent = layers[layer.parentId];
        if (parent && parent.type === "group") {
          layers[parent.id] = {
            ...parent,
            children: parent.children.filter((c) => c !== id),
          };
        }
      } else {
        rootIds = rootIds.filter((r) => r !== id);
        if (id in plateOf) {
          plateOf = { ...plateOf };
          delete plateOf[id];
        }
      }

      return {
        layers,
        rootIds,
        plateOf,
        selection: state.selection.filter((s) => !toRemove.has(s)),
      };
    }),

  deleteSelection: () => {
    const { selection, layers, deleteLayer } = get();
    if (selection.length === 0) return;
    // Count every layer actually removed, not just the top-level selected
    // ones — deleting one folder with several shapes inside it removes all
    // of them, and a toast saying "Deleted 1 layer" for that is misleading.
    let count = 0;
    for (const id of selection) {
      if (!layers[id]) continue;
      count += 1 + collectAllDescendantIds(layers, id).length;
    }
    selection.forEach((id) => deleteLayer(id));
    showToast(count === 1 ? "Deleted 1 layer" : `Deleted ${count} layers`);
  },

  duplicateLayer: (id) =>
    set((state) => {
      const layers = { ...state.layers };
      const rootIds = [...state.rootIds];

      function cloneSubtree(sourceId: string, parentId: string | null): string {
        const src = layers[sourceId];
        const newId = nanoid(8);
        if (src.type === "group") {
          const newChildren = src.children.map((c) => cloneSubtree(c, newId));
          layers[newId] = { ...src, id: newId, parentId, children: newChildren };
        } else {
          layers[newId] = { ...src, id: newId, parentId };
        }
        return newId;
      }

      const original = layers[id];
      if (!original) return {};
      const newId = cloneSubtree(id, original.parentId);
      layers[newId] = { ...layers[newId], name: `${original.name} copy` };

      let plateOf = state.plateOf;
      if (original.parentId) {
        const parent = layers[original.parentId];
        if (parent && parent.type === "group") {
          const idx = parent.children.indexOf(id);
          const children = [...parent.children];
          children.splice(idx + 1, 0, newId);
          layers[parent.id] = { ...parent, children };
        }
      } else {
        const idx = rootIds.indexOf(id);
        rootIds.splice(idx + 1, 0, newId);
        plateOf = { ...plateOf, [newId]: plateOf[id] ?? state.activePlateId };
      }

      return { layers, rootIds, plateOf, selection: [newId] };
    }),

  duplicateSelection: () => {
    let count = 0;
    set((state) => {
      const layers = { ...state.layers };
      const rootIds = [...state.rootIds];
      const newIds: string[] = [];

      function cloneSubtree(sourceId: string, parentId: string | null): string {
        const src = layers[sourceId];
        const newId = nanoid(8);
        if (src.type === "group") {
          const newChildren = src.children.map((c) => cloneSubtree(c, newId));
          layers[newId] = { ...src, id: newId, parentId, children: newChildren };
        } else {
          layers[newId] = { ...src, id: newId, parentId };
        }
        return newId;
      }

      // Only duplicate top-of-selection items — a selected descendant of an
      // already-selected group would otherwise get cloned twice.
      const selectedSet = new Set(state.selection);
      const topLevel = state.selection.filter((id) => {
        let cur = layers[id];
        while (cur?.parentId) {
          if (selectedSet.has(cur.parentId)) return false;
          cur = layers[cur.parentId];
        }
        return true;
      });

      let plateOf = state.plateOf;
      for (const id of topLevel) {
        const original = layers[id];
        if (!original) continue;
        const newId = cloneSubtree(id, original.parentId);
        layers[newId] = { ...layers[newId], name: `${original.name} copy` };
        newIds.push(newId);

        if (original.parentId) {
          const parent = layers[original.parentId];
          if (parent && parent.type === "group") {
            const idx = parent.children.indexOf(id);
            const children = [...parent.children];
            children.splice(idx + 1, 0, newId);
            layers[parent.id] = { ...parent, children };
          }
        } else {
          const idx = rootIds.indexOf(id);
          rootIds.splice(idx + 1, 0, newId);
          plateOf = { ...plateOf, [newId]: plateOf[id] ?? state.activePlateId };
        }
      }

      if (newIds.length === 0) return {};
      count = newIds.length;
      return { layers, rootIds, plateOf, selection: newIds };
    });
    if (count > 0) showToast(count === 1 ? "Duplicated 1 layer" : `Duplicated ${count} layers`);
  },

  copySelection: () => {
    const state = get();
    // Only copy top-of-selection items, same as duplicateSelection.
    const selectedSet = new Set(state.selection);
    const topLevel = state.selection.filter((id) => {
      let cur = state.layers[id];
      while (cur?.parentId) {
        if (selectedSet.has(cur.parentId)) return false;
        cur = state.layers[cur.parentId];
      }
      return true;
    });
    if (topLevel.length === 0) return;

    const snapshotLayers: Record<string, Layer> = {};
    function collect(id: string) {
      const layer = state.layers[id];
      if (!layer) return;
      snapshotLayers[id] = layer;
      if (layer.type === "group") layer.children.forEach(collect);
    }
    topLevel.forEach(collect);

    const cloned = structuredClone(snapshotLayers);
    // Bake each top-level item's full world transform into its own clone —
    // paste always lands at the document root (parentId null), so what was
    // relative to some original parent group must become correct on its
    // own, exactly as if that parent's transform had been applied once.
    for (const id of topLevel) {
      cloned[id] = { ...cloned[id], transform: getWorldTransform(state.layers, id) };
    }

    clipboard = { layers: cloned, rootIds: [...topLevel] };
    showToast(topLevel.length === 1 ? "Copied 1 layer" : `Copied ${topLevel.length} layers`);
  },

  pasteClipboard: () => {
    if (!clipboard) return;
    const source = clipboard;
    // A small nudge so a paste doesn't land exactly on top of its source,
    // matching the common copy/paste convention (and duplicateSelection's
    // own offset-free-but-reordered placement wouldn't be visible here
    // since pasted items always land at the root, away from any sibling
    // list position to offset within).
    const PASTE_OFFSET_MM = 8;
    let count = 0;
    set((state) => {
      const layers = { ...state.layers };
      const rootIds = [...state.rootIds];
      const newIds: string[] = [];

      function cloneSubtree(sourceId: string, parentId: string | null): string {
        const src = source.layers[sourceId];
        const newId = nanoid(8);
        if (src.type === "group") {
          const newChildren = src.children.map((c) => cloneSubtree(c, newId));
          layers[newId] = { ...src, id: newId, parentId, children: newChildren };
        } else {
          layers[newId] = { ...src, id: newId, parentId };
        }
        return newId;
      }

      for (const id of source.rootIds) {
        if (!source.layers[id]) continue;
        const newId = cloneSubtree(id, null);
        const layer = layers[newId];
        layers[newId] = {
          ...layer,
          transform: {
            ...layer.transform,
            x: layer.transform.x + PASTE_OFFSET_MM,
            y: layer.transform.y + PASTE_OFFSET_MM,
          },
        };
        newIds.push(newId);
        rootIds.push(newId);
      }

      if (newIds.length === 0) return {};
      count = newIds.length;
      // Paste always lands on whichever plate is currently active — even
      // if the copy happened on a different one.
      const plateOf = { ...state.plateOf };
      for (const id of newIds) plateOf[id] = state.activePlateId;
      return { layers, rootIds, plateOf, selection: newIds };
    });
    if (count > 0) showToast(count === 1 ? "Pasted 1 layer" : `Pasted ${count} layers`);
  },

  alignSelection: (mode) =>
    set((state) => {
      // Only align top-of-selection items — an already-selected descendant
      // of a selected group would otherwise get moved twice.
      const selectedSet = new Set(state.selection);
      const topLevel = state.selection.filter((id) => {
        let cur = state.layers[id];
        while (cur?.parentId) {
          if (selectedSet.has(cur.parentId)) return false;
          cur = state.layers[cur.parentId];
        }
        return true;
      });
      if (topLevel.length === 0) return {};

      // A single object aligns to the artboard (Figma's own behavior);
      // several align to each other's combined bounding box instead.
      const ref: Bounds | null =
        topLevel.length === 1
          ? { minX: 0, minY: 0, maxX: state.document.widthMM, maxY: state.document.heightMM }
          : getMultiLayerWorldBounds(state.layers, topLevel);
      if (!ref) return {};

      const layers = { ...state.layers };
      for (const id of topLevel) {
        const layer = layers[id];
        if (!layer) continue;
        const bounds = getLayerWorldBounds(layers, id);
        if (!bounds) continue;
        const parentWorld = layer.parentId ? getWorldTransform(layers, layer.parentId) : IDENTITY_TRANSFORM;

        let dxWorld = 0;
        let dyWorld = 0;
        switch (mode) {
          case "left":
            dxWorld = ref.minX - bounds.minX;
            break;
          case "centerH":
            dxWorld = (ref.minX + ref.maxX) / 2 - (bounds.minX + bounds.maxX) / 2;
            break;
          case "right":
            dxWorld = ref.maxX - bounds.maxX;
            break;
          case "top":
            dyWorld = ref.minY - bounds.minY;
            break;
          case "middleV":
            dyWorld = (ref.minY + ref.maxY) / 2 - (bounds.minY + bounds.maxY) / 2;
            break;
          case "bottom":
            dyWorld = ref.maxY - bounds.maxY;
            break;
        }

        // transform.x/y is always parent-local, not world — un-rotate and
        // un-scale the desired world-space nudge into the parent's local
        // basis before applying it (inverse of getWorldTransform's own
        // per-level composition: rotate by -parentRotation, then divide by
        // parentScale).
        const rad = (parentWorld.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const localDx = (dxWorld * cos + dyWorld * sin) / parentWorld.scaleX;
        const localDy = (-dxWorld * sin + dyWorld * cos) / parentWorld.scaleY;

        layers[id] = {
          ...layer,
          transform: { ...layer.transform, x: layer.transform.x + localDx, y: layer.transform.y + localDy },
        };
      }

      return { layers };
    }),

  moveLayers: (ids, targetParentId, index) =>
    set((state) => {
      if (targetParentId && ids.includes(targetParentId)) return {};

      // Only move top-of-selection ids — a selected descendant of an
      // already-selected group would otherwise get moved twice (once
      // directly, once again as part of its ancestor), the same
      // invariant mergeLayers/groupSelection/duplicateSelection enforce.
      const idSet = new Set(ids);
      const topLevel = ids.filter((id) => {
        let cur = state.layers[id];
        while (cur?.parentId) {
          if (idSet.has(cur.parentId)) return false;
          cur = state.layers[cur.parentId];
        }
        return true;
      });
      if (topLevel.length === 0) return {};

      // Guard against dropping any of them into their own descendant.
      for (const id of topLevel) {
        if (!targetParentId) continue;
        const descendants = new Set(collectAllDescendantIds(state.layers, id));
        if (descendants.has(targetParentId) || targetParentId === id) return {};
      }

      const layers = { ...state.layers };
      let rootIds = [...state.rootIds];
      // The world position each moved layer keeps composing INTO its new
      // parent must stay exactly what it already looked like — otherwise
      // dragging a shape into a folder in the layer panel silently
      // relocates it on the canvas, since its stored x/y is interpreted
      // relative to whatever parent it has.
      const targetParentWorld = targetParentId
        ? getWorldTransform(state.layers, targetParentId)
        : IDENTITY_TRANSFORM;

      let insertAt = index;
      let plateOf = state.plateOf;
      for (const id of topLevel) {
        const layer = layers[id];
        if (!layer) continue;
        const world = getWorldTransform(layers, id);
        const wasRoot = !layer.parentId;

        if (layer.parentId) {
          const oldParent = layers[layer.parentId];
          if (oldParent && oldParent.type === "group") {
            layers[oldParent.id] = {
              ...oldParent,
              children: oldParent.children.filter((c) => c !== id),
            };
          }
        } else {
          rootIds = rootIds.filter((r) => r !== id);
        }

        layers[id] = {
          ...layer,
          parentId: targetParentId,
          transform: rebaseWorldToParent(world, targetParentWorld),
        };

        if (targetParentId) {
          const newParent = layers[targetParentId];
          if (newParent && newParent.type === "group") {
            const children = [...newParent.children];
            const clamped = Math.max(0, Math.min(insertAt, children.length));
            children.splice(clamped, 0, id);
            layers[targetParentId] = { ...newParent, children };
            insertAt = clamped + 1;
          }
          // Filed into a group — it's no longer a root, so it no longer
          // has a plate of its own (it now follows its new parent's).
          if (wasRoot && id in plateOf) {
            plateOf = { ...plateOf };
            delete plateOf[id];
          }
        } else {
          const clamped = Math.max(0, Math.min(insertAt, rootIds.length));
          rootIds.splice(clamped, 0, id);
          insertAt = clamped + 1;
          // Pulled out to the top level from inside a group — it needs a
          // plate now, and it's whichever one is currently being viewed.
          if (!wasRoot) plateOf = { ...plateOf, [id]: state.activePlateId };
        }
      }

      return { layers, rootIds, plateOf };
    }),

  mergeLayers: (ids) => {
    let mergedCount = 0;
    set((state) => {
      const unique = Array.from(new Set(ids)).filter((id) => state.layers[id]);

      // Keep only top-of-selection ids — if both a group and one of its own
      // descendants are selected, merging by the descendant's list would
      // try to remove the group while also rewriting it as a parent, which
      // corrupts the tree. This mirrors duplicateSelection's same filter.
      const selectedSet = new Set(unique);
      const selected = unique.filter((id) => {
        let cur = state.layers[id];
        while (cur?.parentId) {
          if (selectedSet.has(cur.parentId)) return false;
          cur = state.layers[cur.parentId];
        }
        return true;
      });
      if (selected.length === 0) return {};

      // Paint order (front-most last) — same walk the layer panel and the
      // 2D/3D renderers use, so "merge" keeps the visually top-most shape's
      // color/depth, matching what Figma's Flatten does.
      const order = flattenForDisplay(state.layers, state.rootIds).map((r) => r.id);
      const rankOf = (id: string) => order.indexOf(id);

      const topId = [...selected].sort((a, b) => rankOf(a) - rankOf(b)).pop()!;
      const topLayer = state.layers[topId];
      if (!topLayer) return {};

      const shapeLayers = selected
        .flatMap((id) => collectShapeLayers(state.layers, id))
        .sort((a, b) => rankOf(a.id) - rankOf(b.id));
      // Need at least two actual shapes to combine — either from multiple
      // selected items, or from a single selected group with 2+ children.
      if (shapeLayers.length < 2) return {};

      // Bake each source layer's full world transform into its points, so
      // the merged shape is correct in document space with an identity
      // transform of its own — exactly what "flatten" means.
      const bakedRegions: ShapeRegion[] = [];
      for (const shapeLayer of shapeLayers) {
        const world = getWorldTransform(state.layers, shapeLayer.id);
        // Bake each source's own corner rounding into its points first (in
        // its local space, before the transform can distort it), so a
        // rounded source layer still looks rounded once flattened.
        const rounded = roundRegions(shapeLayer.regions, shapeLayer.cornerRadius);
        for (const region of rounded) {
          bakedRegions.push({
            outer: { points: region.outer.points.map((p) => applyTransform2D(p, world)) },
            holes: region.holes.map((h) => ({ points: h.points.map((p) => applyTransform2D(p, world)) })),
          });
        }
      }
      // A real boolean union — overlapping shapes fill solid (like Figma's
      // Union), not naive concatenation, which behaves like Exclude
      // wherever shapes overlap.
      let regions = unionRegions(bakedRegions);

      // The merged shape's own transform is identity, so the points above
      // (baked to absolute world space, needed for the union math to line
      // sources up correctly regardless of their individual transforms)
      // are exactly its final position ONLY when it has no parent. Inside
      // a group, that same parent's transform is applied again at render
      // time on top of already-world-baked points — re-express the points
      // relative to the parent instead, so they land in the right place
      // once, not twice.
      if (topLayer.parentId) {
        const parentWorld = getWorldTransform(state.layers, topLayer.parentId);
        regions = regions.map((region) => ({
          outer: { points: region.outer.points.map((p) => invertTransform2D(p, parentWorld)) },
          holes: region.holes.map((h) => ({ points: h.points.map((p) => invertTransform2D(p, parentWorld)) })),
        }));
      }

      const frontMost = shapeLayers[shapeLayers.length - 1];
      const mergedId = nanoid(8);
      // Keep the merged shape sitting at the same physical height the
      // front-most source was at, expressed relative to its new parent.
      const frontMostWorldZ = getWorldTransform(state.layers, frontMost.id).z;
      const mergedParentWorldZ = topLayer.parentId
        ? getWorldTransform(state.layers, topLayer.parentId).z
        : 0;

      const merged: ShapeLayer = {
        id: mergedId,
        type: "shape",
        name: `${topLayer.name} (merged)`,
        visible: true,
        locked: false,
        color: frontMost.color,
        transform: { ...IDENTITY_TRANSFORM, z: Math.max(0, frontMostWorldZ - mergedParentWorldZ) },
        parentId: topLayer.parentId,
        regions,
        extrusionDepth: frontMost.extrusionDepth,
        cornerRadius: 0,
        bevelBottom: 0,
        bevelTop: 0,
        isHole: false,
      };

      const toRemove = new Set<string>();
      for (const id of selected) {
        toRemove.add(id);
        collectAllDescendantIds(state.layers, id).forEach((d) => toRemove.add(d));
      }

      const layers = { ...state.layers };
      for (const id of toRemove) delete layers[id];
      layers[mergedId] = merged;

      // Every parent that held one of the selected/removed items needs its
      // children list fixed up — not just the top-most one's. The top-most
      // item's own slot becomes the merged layer's new home; every other
      // affected parent just loses the reference (otherwise it would be
      // left pointing at an id that no longer exists in `layers`).
      const touchedParentIds = new Set<string>();
      for (const id of selected) {
        const l = state.layers[id];
        if (l.parentId) touchedParentIds.add(l.parentId);
      }
      for (const pid of touchedParentIds) {
        const original = state.layers[pid];
        if (!original || original.type !== "group") continue;
        const children =
          pid === topLayer.parentId
            ? original.children
                .map((c) => (c === topId ? mergedId : c))
                .filter((c) => c === mergedId || !toRemove.has(c))
            : original.children.filter((c) => !toRemove.has(c));
        layers[pid] = { ...layers[pid], children } as GroupLayer;
      }

      const rootIds = topLayer.parentId
        ? state.rootIds.filter((r) => !toRemove.has(r))
        : state.rootIds
            .map((r) => (r === topId ? mergedId : r))
            .filter((r) => r === mergedId || !toRemove.has(r));

      const plateOf = { ...state.plateOf };
      for (const id of toRemove) delete plateOf[id];
      if (!topLayer.parentId) plateOf[mergedId] = state.plateOf[topId] ?? state.activePlateId;

      mergedCount = shapeLayers.length;
      return { layers, rootIds, plateOf, selection: [mergedId] };
    });
    if (mergedCount > 0) showToast(`Merged ${mergedCount} shapes`);
  },

  /**
   * Subtract/Intersect/Exclude — Figma's other three boolean operations,
   * alongside Union (which "Merge layers"/mergeLayers already provides).
   * Unlike union, these aren't symmetric across a flat list of shapes: each
   * TOP-LEVEL selected item (a lone shape, or a whole group — its own
   * shapes unioned together first) becomes one distinct operand, combined
   * in back-to-front paint order — subject-minus-clips for Subtract
   * (Figma cuts the front object(s) OUT of the back one, e.g. drawing a
   * circle on top of a rectangle and subtracting punches a hole where the
   * circle was), and order-independent for Intersect/Exclude.
   */
  booleanOp: (ids, op) => {
    let resultCount = 0;
    set((state) => {
      const unique = Array.from(new Set(ids)).filter((id) => state.layers[id]);
      const selectedSet = new Set(unique);
      const selected = unique.filter((id) => {
        let cur = state.layers[id];
        while (cur?.parentId) {
          if (selectedSet.has(cur.parentId)) return false;
          cur = state.layers[cur.parentId];
        }
        return true;
      });
      if (selected.length < 2) return {};

      const order = flattenForDisplay(state.layers, state.rootIds).map((r) => r.id);
      const rankOf = (id: string) => order.indexOf(id);
      const orderedSelected = [...selected].sort((a, b) => rankOf(a) - rankOf(b));
      const topId = orderedSelected[orderedSelected.length - 1];
      const topLayer = state.layers[topId];
      if (!topLayer) return {};

      const bakeShape = (shapeLayer: ShapeLayer): ShapeRegion[] => {
        const world = getWorldTransform(state.layers, shapeLayer.id);
        const rounded = roundRegions(shapeLayer.regions, shapeLayer.cornerRadius);
        return rounded.map((region) => ({
          outer: { points: region.outer.points.map((p) => applyTransform2D(p, world)) },
          holes: region.holes.map((h) => ({ points: h.points.map((p) => applyTransform2D(p, world)) })),
        }));
      };

      // operands[0] is the back-most selected item (the Subtract subject);
      // the rest are cut away from it. Each operand's own shapes (if it's
      // a group with several) are unioned together first, same as a
      // single combined operand.
      const operandRegions: ShapeRegion[][] = [];
      let frontMost: ShapeLayer | undefined;
      for (const id of orderedSelected) {
        const shapeLayers = collectShapeLayers(state.layers, id).sort((a, b) => rankOf(a.id) - rankOf(b.id));
        if (shapeLayers.length === 0) continue;
        operandRegions.push(unionRegions(shapeLayers.flatMap(bakeShape)));
        frontMost = shapeLayers[shapeLayers.length - 1];
      }
      if (operandRegions.length < 2 || !frontMost) return {};

      let regions: ShapeRegion[];
      let label: string;
      if (op === "subtract") {
        regions = differenceRegions(operandRegions);
        label = "subtracted";
      } else if (op === "intersect") {
        regions = intersectionRegions(operandRegions);
        label = "intersected";
      } else {
        regions = xorRegions(operandRegions);
        label = "excluded";
      }
      if (regions.length === 0) return {};

      if (topLayer.parentId) {
        const parentWorld = getWorldTransform(state.layers, topLayer.parentId);
        regions = regions.map((region) => ({
          outer: { points: region.outer.points.map((p) => invertTransform2D(p, parentWorld)) },
          holes: region.holes.map((h) => ({ points: h.points.map((p) => invertTransform2D(p, parentWorld)) })),
        }));
      }

      const resultId = nanoid(8);
      const frontMostWorldZ = getWorldTransform(state.layers, frontMost.id).z;
      const resultParentWorldZ = topLayer.parentId ? getWorldTransform(state.layers, topLayer.parentId).z : 0;

      const result: ShapeLayer = {
        id: resultId,
        type: "shape",
        name: `${topLayer.name} (${label})`,
        visible: true,
        locked: false,
        color: frontMost.color,
        transform: { ...IDENTITY_TRANSFORM, z: Math.max(0, frontMostWorldZ - resultParentWorldZ) },
        parentId: topLayer.parentId,
        regions,
        extrusionDepth: frontMost.extrusionDepth,
        cornerRadius: 0,
        bevelBottom: 0,
        bevelTop: 0,
        isHole: false,
      };

      const toRemove = new Set<string>();
      for (const id of selected) {
        toRemove.add(id);
        collectAllDescendantIds(state.layers, id).forEach((d) => toRemove.add(d));
      }

      const layers = { ...state.layers };
      for (const id of toRemove) delete layers[id];
      layers[resultId] = result;

      const touchedParentIds = new Set<string>();
      for (const id of selected) {
        const l = state.layers[id];
        if (l.parentId) touchedParentIds.add(l.parentId);
      }
      for (const pid of touchedParentIds) {
        const original = state.layers[pid];
        if (!original || original.type !== "group") continue;
        const children =
          pid === topLayer.parentId
            ? original.children
                .map((c) => (c === topId ? resultId : c))
                .filter((c) => c === resultId || !toRemove.has(c))
            : original.children.filter((c) => !toRemove.has(c));
        layers[pid] = { ...layers[pid], children } as GroupLayer;
      }

      const rootIds = topLayer.parentId
        ? state.rootIds.filter((r) => !toRemove.has(r))
        : state.rootIds
            .map((r) => (r === topId ? resultId : r))
            .filter((r) => r === resultId || !toRemove.has(r));

      const plateOf = { ...state.plateOf };
      for (const id of toRemove) delete plateOf[id];
      if (!topLayer.parentId) plateOf[resultId] = state.plateOf[topId] ?? state.activePlateId;

      resultCount = 1;
      return { layers, rootIds, plateOf, selection: [resultId] };
    });
    if (resultCount > 0) {
      const label = op === "subtract" ? "Subtracted" : op === "intersect" ? "Intersected" : "Excluded";
      showToast(`${label} selection`);
    }
  },

  groupSelection: () => {
    let grouped = 0;
    set((state) => {
      // Keep only top-of-selection ids, same as mergeLayers/duplicateSelection.
      const selectedSet = new Set(state.selection);
      const selected = state.selection.filter((id) => {
        let cur = state.layers[id];
        while (cur?.parentId) {
          if (selectedSet.has(cur.parentId)) return false;
          cur = state.layers[cur.parentId];
        }
        return true;
      });
      // Grouping a single item (or nothing) is a no-op — there's nothing to
      // collect together that isn't already its own unit.
      if (selected.length < 2) return {};

      // Paint order (front-most last) — same walk mergeLayers uses to pick
      // where the new layer lands and what it inherits.
      const order = flattenForDisplay(state.layers, state.rootIds).map((r) => r.id);
      const rankOf = (id: string) => order.indexOf(id);
      const orderedSelected = [...selected].sort((a, b) => rankOf(a) - rankOf(b));
      const topId = orderedSelected[orderedSelected.length - 1];
      const topLayer = state.layers[topId];
      if (!topLayer) return {};

      const groupId = nanoid(8);
      const groupParentId = topLayer.parentId;
      const groupParentWorld = groupParentId
        ? getWorldTransform(state.layers, groupParentId)
        : IDENTITY_TRANSFORM;

      const layers = { ...state.layers };
      for (const id of orderedSelected) {
        const layer = layers[id];
        const world = getWorldTransform(state.layers, id);
        layers[id] = {
          ...layer,
          parentId: groupId,
          transform: rebaseWorldToParent(world, groupParentWorld),
        };
      }

      const group: GroupLayer = {
        id: groupId,
        type: "group",
        name: "Group",
        visible: true,
        locked: false,
        color: topLayer.color,
        transform: { ...IDENTITY_TRANSFORM },
        parentId: groupParentId,
        children: orderedSelected,
      };
      layers[groupId] = group;

      // Every parent that held one of the grouped items needs its children
      // list fixed up — not just the top-most one's, mirroring mergeLayers.
      const touchedParentIds = new Set<string>();
      for (const id of selected) {
        const l = state.layers[id];
        if (l.parentId) touchedParentIds.add(l.parentId);
      }
      for (const pid of touchedParentIds) {
        const original = state.layers[pid];
        if (!original || original.type !== "group") continue;
        const children =
          pid === groupParentId
            ? original.children
                .map((c) => (c === topId ? groupId : c))
                .filter((c) => c === groupId || !selectedSet.has(c))
            : original.children.filter((c) => !selectedSet.has(c));
        layers[pid] = { ...layers[pid], children } as GroupLayer;
      }

      const rootIds = groupParentId
        ? state.rootIds.filter((r) => !selectedSet.has(r))
        : state.rootIds
            .map((r) => (r === topId ? groupId : r))
            .filter((r) => r === groupId || !selectedSet.has(r));

      const plateOf = { ...state.plateOf };
      for (const id of selectedSet) delete plateOf[id];
      if (!groupParentId) plateOf[groupId] = state.plateOf[topId] ?? state.activePlateId;

      grouped = orderedSelected.length;
      return { layers, rootIds, plateOf, selection: [groupId] };
    });
    if (grouped > 0) showToast(`Grouped ${grouped} layers`);
  },

  ungroupSelection: () => {
    let ungrouped = 0;
    set((state) => {
      const groups = state.selection
        .map((id) => state.layers[id])
        .filter((l): l is GroupLayer => !!l && l.type === "group");
      if (groups.length === 0) return {};

      const layers = { ...state.layers };
      let rootIds = [...state.rootIds];
      let plateOf = state.plateOf;
      const newSelection: string[] = [];

      for (const group of groups) {
        const current = layers[group.id];
        if (!current || current.type !== "group") continue;
        const groupParentId = current.parentId;
        const groupParentWorld = groupParentId
          ? getWorldTransform(layers, groupParentId)
          : IDENTITY_TRANSFORM;

        for (const childId of current.children) {
          const child = layers[childId];
          if (!child) continue;
          const world = getWorldTransform(layers, childId);
          layers[childId] = {
            ...child,
            parentId: groupParentId,
            transform: rebaseWorldToParent(world, groupParentWorld),
          };
          newSelection.push(childId);
        }

        if (groupParentId) {
          const parent = layers[groupParentId];
          if (parent && parent.type === "group") {
            const idx = parent.children.indexOf(group.id);
            const children = [...parent.children];
            children.splice(idx, 1, ...current.children);
            layers[groupParentId] = { ...parent, children };
          }
        } else {
          const idx = rootIds.indexOf(group.id);
          rootIds = [...rootIds.slice(0, idx), ...current.children, ...rootIds.slice(idx + 1)];
          // The group's children just became roots in its place — they
          // inherit the group's own plate.
          const plateId = plateOf[group.id] ?? state.activePlateId;
          plateOf = { ...plateOf };
          for (const childId of current.children) plateOf[childId] = plateId;
        }

        if (group.id in plateOf) {
          plateOf = { ...plateOf };
          delete plateOf[group.id];
        }
        delete layers[group.id];
      }

      if (newSelection.length === 0) return {};
      ungrouped = groups.length;
      return { layers, rootIds, plateOf, selection: newSelection };
    });
    if (ungrouped > 0) showToast(ungrouped === 1 ? "Ungrouped 1 group" : `Ungrouped ${ungrouped} groups`);
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleWireframe: () => set((state) => ({ wireframe: !state.wireframe })),
  setBed: (bed) =>
    set((state) => ({ document: { ...state.document, bed: { ...state.document.bed, ...bed } } })),
  setDocumentName: (name) =>
    set((state) => ({ document: { ...state.document, name } })),
  setUnits: (units) =>
    set((state) => ({ document: { ...state.document, units } })),

  fitDocumentToSelection: () =>
    set((state) => {
      const bounds = getMultiLayerWorldBounds(state.layers, state.selection);
      if (!bounds) return {};
      const widthMM = Math.max(1, bounds.maxX - bounds.minX);
      const heightMM = Math.max(1, bounds.maxY - bounds.minY);
      return { document: { ...state.document, widthMM, heightMM } };
    }),

  matchDocumentToBed: () =>
    set((state) => ({
      document: {
        ...state.document,
        widthMM: state.document.bed.width,
        heightMM: state.document.bed.depth,
      },
    })),

  createShapeLayer: (kind) =>
    set((state) => {
      const id = nanoid(8);
      let w: number;
      let h: number;
      let regions: ShapeRegion[];

      if (kind === "rect") {
        w = 30;
        h = 20;
        regions = [
          {
            outer: {
              points: [
                { x: 0, y: 0 },
                { x: w, y: 0 },
                { x: w, y: h },
                { x: 0, y: h },
              ],
            },
            holes: [],
          },
        ];
      } else {
        // "hole" reuses the circle path — a round negative-space cutout
        // (screw holes, magnet pockets) is by far the common case, and the
        // Inspector's own hole tools (shape presets, recessed-pocket snap)
        // already assume that starting point.
        const r = kind === "hole" ? 4 : 10;
        w = r * 2;
        h = r * 2;
        const segments = 64;
        const points = Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * Math.PI * 2;
          return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r };
        });
        regions = [{ outer: { points }, holes: [] }];
      }

      const layer: ShapeLayer = {
        id,
        type: "shape",
        name: kind === "rect" ? "Rectangle" : kind === "hole" ? "Hole" : "Circle",
        visible: true,
        locked: false,
        color: "#4f46e5",
        transform: {
          ...IDENTITY_TRANSFORM,
          x: (state.document.widthMM - w) / 2,
          y: (state.document.heightMM - h) / 2,
        },
        parentId: null,
        regions,
        extrusionDepth: 1.2,
        cornerRadius: 0,
        bevelBottom: 0,
        bevelTop: 0,
        isHole: kind === "hole",
      };

      return {
        layers: { ...state.layers, [id]: layer },
        rootIds: [...state.rootIds, id],
        plateOf: { ...state.plateOf, [id]: state.activePlateId },
        selection: [id],
      };
    }),
    }),
    {
      partialize: partializeScene,
      limit: 100,
      equality: (a, b) =>
        a.layers === b.layers &&
        a.rootIds === b.rootIds &&
        a.document === b.document &&
        a.plates === b.plates &&
        a.plateOf === b.plateOf,
    },
  ),
);

/**
 * Continuous interactions (dragging a shape, scrubbing a slider) should be
 * ONE undo step, not one per intermediate update. Call beginGesture() right
 * before the first mutation, keep the snapshot it returns, then call
 * endGesture(snapshot, true) once the gesture ends (only if something
 * actually changed) — see Canvas2D's drag-move and the corner-radius slider
 * for the pattern. Every other action is tracked automatically.
 */
export function beginGesture(): TrackedSceneSlice {
  const snapshot = partializeScene(useSceneStore.getState());
  useSceneStore.temporal.getState().pause();
  return snapshot;
}

export function endGesture(preGestureSnapshot: TrackedSceneSlice, changed: boolean): void {
  useSceneStore.temporal.getState().resume();
  if (!changed) return;
  useSceneStore.temporal.setState((s) => ({
    pastStates: [...s.pastStates, preGestureSnapshot],
    futureStates: [],
  }));
}

export { IDENTITY_TRANSFORM };

/**
 * The root layer ids belonging to whichever plate is currently being
 * viewed — what the canvas, viewport and layer panel should actually
 * render/operate on, as opposed to `rootIds` (every root across every
 * plate). Uses useShallow so a re-render that doesn't actually change
 * which ids are on this plate still hands consumers back the SAME array
 * reference — without it, every unrelated state change would produce a
 * brand-new filtered array and defeat any `useMemo`/`useEffect` keyed on
 * it (e.g. Viewport3D's fairly expensive assembly rebuild).
 */
export function useActivePlateRootIds(): string[] {
  return useSceneStore(
    useShallow((s) => s.rootIds.filter((id) => (s.plateOf[id] ?? s.plates[0]?.id) === s.activePlateId)),
  );
}
