import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DocumentSettings,
  Layer,
  PrintBed,
  ShapeLayer,
  Transform2D,
  ViewMode2D3D,
} from "../types";
import { collectAllDescendantIds, IDENTITY_TRANSFORM } from "./sceneUtils";

export const BED_PRESETS: PrintBed[] = [
  { name: "Bambu A1 / P1S (256²)", width: 256, depth: 256, height: 256 },
  { name: "Bambu A1 mini (180²)", width: 180, depth: 180, height: 180 },
  { name: "Bambu X1C (256²)", width: 256, depth: 256, height: 256 },
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
  deleteLayer: (id: string) => void;
  deleteSelection: () => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, targetParentId: string | null, index: number) => void;

  setViewMode: (mode: ViewMode2D3D) => void;
  toggleGrid: () => void;
  setBed: (bed: Partial<PrintBed>) => void;
  setDocumentName: (name: string) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
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

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  setBed: (bed) =>
    set((state) => ({ document: { ...state.document, bed: { ...state.document.bed, ...bed } } })),
  setDocumentName: (name) =>
    set((state) => ({ document: { ...state.document, name } })),
}));

export { IDENTITY_TRANSFORM };
