import { create } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type {
  AlignMode,
  DocumentSettings,
  GroupLayer,
  Layer,
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
  getWorldRegions,
  getWorldTransform,
  IDENTITY_TRANSFORM,
  invertTransform2D,
} from "./sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import { regionsArea, regionsIntersectionArea, unionRegions } from "../geometry/booleanOps";
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

function defaultDocument(): DocumentSettings {
  return {
    name: "Untitled",
    widthMM: 100,
    heightMM: 100,
    units: "mm",
    bed: { ...BED_PRESETS[0] },
  };
}

interface SceneState {
  document: DocumentSettings;
  layers: Record<string, Layer>;
  rootIds: string[];
  selection: string[];
  viewMode: ViewMode2D3D;
  showGrid: boolean;
  wireframe: boolean;

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
  deleteLayer: (id: string) => void;
  deleteSelection: () => void;
  duplicateLayer: (id: string) => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  moveLayer: (id: string, targetParentId: string | null, index: number) => void;
  mergeLayers: (ids: string[]) => void;
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
}

function partializeScene(state: SceneState): TrackedSceneSlice {
  return {
    document: state.document,
    layers: state.layers,
    rootIds: state.rootIds,
  };
}

export const useSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
  document: defaultDocument(),
  layers: {},
  rootIds: [],
  selection: [],
  viewMode: "2d",
  showGrid: true,
  wireframe: false,

  newProject: () =>
    set({
      document: defaultDocument(),
      layers: {},
      rootIds: [],
      selection: [],
    }),

  importParsedScene: ({ layers, rootIds, widthMM, heightMM }) =>
    set((state) => {
      // Merge the imported tree in as new top-level siblings, and grow the
      // document to fit if the import is larger than the current page.
      return {
        layers: { ...state.layers, ...layers },
        rootIds: [...state.rootIds, ...rootIds],
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
  selectAll: () => set((state) => ({ selection: [...state.rootIds] })),

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
    // Names of shapes that end up raised above the bed without their own
    // footprint being FULLY covered by whatever raised them — i.e. at
    // least part of the shape has nothing underneath it and can't
    // physically print as placed. Collected during the reducer below and
    // reported via a toast afterward (a store reducer must stay a pure
    // state transition; the side-effecting toast happens once, after).
    let floatingNames: string[] = [];

    set((state) => {
      // Each layer sits on top of whatever it *actually* overlaps — real
      // polygon overlap, not just a bounding-box check — so two unrelated
      // shapes that merely have overlapping bounding boxes (e.g. two
      // circles near the same corner, or an L-shaped part) don't get
      // stacked on each other when their real outlines never touch.
      const order = flattenForDisplay(state.layers, state.rootIds)
        .map((r) => r.id)
        .filter((id) => state.layers[id]?.type === "shape");

      const layers = { ...state.layers };
      const placed: { regions: ReturnType<typeof getWorldRegions>; topZ: number }[] = [];

      for (const id of order) {
        const layer = layers[id] as ShapeLayer;
        const regions = getWorldRegions(layers, id);
        const ownArea = regionsArea(regions);

        // baseZ is the tallest already-placed shape this one's real
        // outline genuinely overlaps — not merely bbox-adjacent to.
        let baseZ = 0;
        for (const p of placed) {
          if (p.topZ <= baseZ) continue; // can't raise baseZ any further
          if (regionsIntersectionArea(regions, p.regions) > 1e-6) baseZ = p.topZ;
        }

        // A shape resting on solid ground (baseZ 0) is always fully
        // supported by definition. One raised onto something else is only
        // safe to print if what it landed on actually covers its WHOLE
        // footprint — a shape whose bounding box merely brushed a taller
        // neighbor, but whose real outline only partly overlaps it, would
        // otherwise end up with part of it hanging in mid-air.
        if (baseZ > 0 && ownArea > 1e-6 && !layer.isHole) {
          const supportUnion = unionRegions(
            placed.filter((p) => p.topZ === baseZ).flatMap((p) => p.regions),
          );
          const supportedArea = regionsIntersectionArea(regions, supportUnion);
          if (supportedArea < ownArea * 0.98) floatingNames.push(layer.name);
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

    if (floatingNames.length > 0) {
      const shown = floatingNames.slice(0, 3).join(", ");
      const rest = floatingNames.length > 3 ? ` +${floatingNames.length - 3} more` : "";
      showToast(
        `Auto-stacked — ${floatingNames.length} shape${floatingNames.length === 1 ? "" : "s"} may be floating: ${shown}${rest}`,
      );
    } else {
      showToast("Auto-stacked all layers");
    }
  },

  deleteLayer: (id) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      const toRemove = new Set([id, ...collectAllDescendantIds(state.layers, id)]);
      const layers = { ...state.layers };
      for (const rid of toRemove) delete layers[rid];

      let rootIds = state.rootIds;
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
      }

      return {
        layers,
        rootIds,
        selection: state.selection.filter((s) => !toRemove.has(s)),
      };
    }),

  deleteSelection: () => {
    const { selection, deleteLayer } = get();
    if (selection.length === 0) return;
    const count = selection.length;
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
      }

      return { layers, rootIds, selection: [newId] };
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
        }
      }

      if (newIds.length === 0) return {};
      count = newIds.length;
      return { layers, rootIds, selection: newIds };
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
      return { layers, rootIds, selection: newIds };
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

  moveLayer: (id, targetParentId, index) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer) return {};
      // Guard against dropping a group into its own descendant.
      if (targetParentId) {
        const descendants = new Set(collectAllDescendantIds(state.layers, id));
        if (descendants.has(targetParentId) || targetParentId === id) return {};
      }

      const layers = { ...state.layers };
      let rootIds = [...state.rootIds];

      // Remove from old location.
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

      layers[id] = { ...layer, parentId: targetParentId };

      // Insert at new location.
      if (targetParentId) {
        const newParent = layers[targetParentId];
        if (newParent && newParent.type === "group") {
          const children = [...newParent.children];
          const clampedIndex = Math.max(0, Math.min(index, children.length));
          children.splice(clampedIndex, 0, id);
          layers[targetParentId] = { ...newParent, children };
        }
      } else {
        const clampedIndex = Math.max(0, Math.min(index, rootIds.length));
        rootIds.splice(clampedIndex, 0, id);
      }

      return { layers, rootIds };
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

      mergedCount = shapeLayers.length;
      return { layers, rootIds, selection: [mergedId] };
    });
    if (mergedCount > 0) showToast(`Merged ${mergedCount} shapes`);
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

      grouped = orderedSelected.length;
      return { layers, rootIds, selection: [groupId] };
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
        }

        delete layers[group.id];
      }

      if (newSelection.length === 0) return {};
      ungrouped = groups.length;
      return { layers, rootIds, selection: newSelection };
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
        selection: [id],
      };
    }),
    }),
    {
      partialize: partializeScene,
      limit: 100,
      equality: (a, b) => a.layers === b.layers && a.rootIds === b.rootIds && a.document === b.document,
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
