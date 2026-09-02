import { create } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type {
  DocumentSettings,
  GroupLayer,
  Layer,
  PrintBed,
  ShapeLayer,
  ShapeRegion,
  Transform2D,
  ViewMode2D3D,
} from "../types";
import {
  applyTransform2D,
  collectAllDescendantIds,
  collectShapeLayers,
  flattenForDisplay,
  boundsOverlap,
  getLayerWorldBounds,
  getMultiLayerWorldBounds,
  getWorldTransform,
  IDENTITY_TRANSFORM,
} from "./sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import { unionRegions } from "../geometry/booleanOps";

export const BED_PRESETS: PrintBed[] = [
  { name: "Bambu Lab X1 Carbon", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab X1", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab X1E", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab P1S", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab P1P", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab A1", width: 256, depth: 256, height: 256 },
  { name: "Bambu Lab A1 mini", width: 180, depth: 180, height: 180 },
  { name: "Bambu Lab H2D", width: 350, depth: 320, height: 325 },
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
  setLayerZ: (id: string, z: number) => void;
  autoStackLayers: () => void;
  deleteLayer: (id: string) => void;
  deleteSelection: () => void;
  duplicateLayer: (id: string) => void;
  duplicateSelection: () => void;
  moveLayer: (id: string, targetParentId: string | null, index: number) => void;
  mergeLayers: (ids: string[]) => void;
  selectAll: () => void;

  setViewMode: (mode: ViewMode2D3D) => void;
  toggleGrid: () => void;
  setBed: (bed: Partial<PrintBed>) => void;
  setDocumentName: (name: string) => void;
  fitDocumentToSelection: () => void;
  matchDocumentToBed: () => void;
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

  autoStackLayers: () =>
    set((state) => {
      // Each layer sits on top of whatever it actually overlaps in X/Y —
      // not blindly on top of everything painted before it — so two
      // unrelated shapes on the same background (e.g. separate letters,
      // or an icon off to the side) end up resting at the same height
      // instead of one floating on top of the other.
      const order = flattenForDisplay(state.layers, state.rootIds)
        .map((r) => r.id)
        .filter((id) => state.layers[id]?.type === "shape");

      const layers = { ...state.layers };
      const placed: { bounds: ReturnType<typeof getLayerWorldBounds>; topZ: number }[] = [];

      for (const id of order) {
        const layer = layers[id] as ShapeLayer;
        const bounds = getLayerWorldBounds(layers, id);

        let baseZ = 0;
        if (bounds) {
          for (const p of placed) {
            if (p.bounds && boundsOverlap(bounds, p.bounds)) baseZ = Math.max(baseZ, p.topZ);
          }
        }

        // baseZ is a world-space height; convert it back to this layer's
        // own local Z, relative to whatever group it's nested in.
        const parentWorldZ = layer.parentId ? getWorldTransform(layers, layer.parentId).z : 0;
        const localZ = Math.max(0, baseZ - parentWorldZ);
        layers[id] = { ...layer, transform: { ...layer.transform, z: localZ } };

        if (bounds) placed.push({ bounds, topZ: baseZ + layer.extrusionDepth });
      }
      return { layers };
    }),

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
    selection.forEach((id) => deleteLayer(id));
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

  duplicateSelection: () =>
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
      return { layers, rootIds, selection: newIds };
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

  mergeLayers: (ids) =>
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
      const regions = unionRegions(bakedRegions);

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

      return { layers, rootIds, selection: [mergedId] };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  setBed: (bed) =>
    set((state) => ({ document: { ...state.document, bed: { ...state.document.bed, ...bed } } })),
  setDocumentName: (name) =>
    set((state) => ({ document: { ...state.document, name } })),

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
