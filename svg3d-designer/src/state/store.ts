import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type {
  AlignMode,
  DocumentSettings,
  GroupLayer,
  ImageLayer,
  Layer,
  PenAnchor,
  PenAnchorType,
  Plate,
  Point2,
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
  getLocalShapeBounds,
  getLocalShapeZRange,
  getMultiLayerWorldBounds,
  getShapeWorldZRange,
  getTopLevelId,
  getWorldRegions,
  getWorldSupportRegions,
  getWorldTransform,
  IDENTITY_TRANSFORM,
  invertTransform2D,
} from "./sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import {
  applyPenHandleDrag,
  applySetAnchorType,
  flattenPenAnchors,
  normalizeToBounds,
  regularPolygonPoints,
  starPolygonPoints,
} from "../geometry/primitives";
import {
  differenceRegions,
  intersectionRegions,
  regionsArea,
  regionsIntersectionArea,
  splitRegionsByLine,
  unionRegions,
  xorRegions,
} from "../geometry/booleanOps";
import { showToast } from "./toastStore";
import {
  getActiveProjectId,
  loadProjectContent,
  saveProjectContent,
  setActiveProjectId,
  touchProjectMeta,
} from "./projects";

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
    // Best-effort carry-through, mirroring getWorldTransform's own additive
    // approximation for these two 3D-only tilt axes — see its comment.
    rotationX: world.rotationX - newParentWorld.rotationX,
    rotationY: world.rotationY - newParentWorld.rotationY,
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

function buildBlankProjectContent(): { content: TrackedSceneSlice; activePlateId: string } {
  const { plates, activePlateId } = defaultPlates();
  return {
    content: {
      document: defaultDocument(),
      layers: {},
      rootIds: [],
      plates,
      plateOf: {},
      dismissedFloatingIds: [],
      dismissedThinFeatureIds: [],
    },
    activePlateId,
  };
}

/**
 * Every project saved to disk keeps whatever Transform2D fields existed at
 * the time it was saved — a project saved before rotationX/rotationY
 * existed simply has neither key at all, `as ProjectContent` notwithstanding
 * (that cast is compile-time only; nothing validates the JSON at runtime).
 * Reading a missing field back as `undefined` poisons every downstream
 * NaN-sensitive computation, most visibly the 3D render/export quaternion
 * (see extrude.ts's applyLayerTransform): a single NaN angle corrupts every
 * component of the composed rotation, not just its own axis, so the whole
 * mesh silently stops rendering. Layering IDENTITY_TRANSFORM's defaults
 * underneath every loaded transform (rather than trusting the save to be
 * complete) is what makes opening an old project safe regardless of which
 * fields existed when it was written — including ones added after this.
 */
function normalizeLoadedLayers(layers: Record<string, Layer>): Record<string, Layer> {
  const result: Record<string, Layer> = {};
  for (const [id, layer] of Object.entries(layers)) {
    result[id] = { ...layer, transform: { ...IDENTITY_TRANSFORM, ...layer.transform } };
  }
  return result;
}

/**
 * What to show on first paint: resume the last-open project if one
 * exists in this browser's storage, otherwise start a brand-new one (and
 * persist it immediately, so it already exists in the project browser's
 * list rather than only appearing once something changes).
 */
function resolveInitialState(): TrackedSceneSlice & { activePlateId: string; activeProjectId: string } {
  const activeId = getActiveProjectId();
  if (activeId) {
    const content = loadProjectContent(activeId);
    if (content) {
      return {
        ...content,
        layers: normalizeLoadedLayers(content.layers),
        // Older saved projects predate these fields entirely.
        dismissedFloatingIds: content.dismissedFloatingIds ?? [],
        dismissedThinFeatureIds: content.dismissedThinFeatureIds ?? [],
        activePlateId: content.plates[0]?.id ?? defaultPlates().activePlateId,
        activeProjectId: activeId,
      };
    }
  }
  const id = nanoid(8);
  const { content, activePlateId } = buildBlankProjectContent();
  saveProjectContent(id, content);
  touchProjectMeta(id, content.document.name);
  setActiveProjectId(id);
  return { ...content, activePlateId, activeProjectId: id };
}

interface SceneState {
  document: DocumentSettings;
  layers: Record<string, Layer>;
  rootIds: string[];
  plates: Plate[];
  /** Root layer id -> plate id. Missing entries default to `plates[0]`. */
  plateOf: Record<string, string>;
  /** Ids the user has explicitly acknowledged from the "partial support"
   * floating-shape warning (an ear or mustache resting on a real but
   * partial contact area) — suppresses that warning for this shape until
   * it changes position again. Purely floating (no real contact at all)
   * shapes are never dismissible this way. */
  dismissedFloatingIds: string[];
  /** Ids the user has explicitly acknowledged from the thin-feature
   * warning — a deliberately fine detail (text, a thin divider) that's
   * narrower than what a standard nozzle can reliably print but is meant
   * to be that way. Suppresses that warning for this shape from here on,
   * the same dismiss-and-forget pattern as dismissedFloatingIds. */
  dismissedThinFeatureIds: string[];
  /** Which plate the canvas/viewport/layer panel currently show — a view
   * concern like `selection`/`viewMode`, not undo-tracked. */
  activePlateId: string;
  /** Which locally-saved project this session is editing — like
   * `activePlateId`, a view concern (not undo-tracked): switching projects
   * isn't an edit to either project, just a change of which one is open. */
  activeProjectId: string;
  selection: string[];
  viewMode: ViewMode2D3D;
  showGrid: boolean;
  wireframe: boolean;
  /** Whether the Pen tool is currently armed — a view/interaction concern
   * like `selection`, not undo-tracked. Canvas2D reads this to switch its
   * own click handling over to placing anchors instead of selecting/
   * marqueeing, and to render the in-progress outline. */
  penToolActive: boolean;
  /** Anchors placed so far in the current in-progress pen path, in
   * document (mm) space — cleared on finish/cancel. Also not undo-tracked;
   * only the finished shape this eventually produces is a real, trackable
   * edit. See PenAnchor for what a corner vs. smooth (curved) anchor is. */
  penDraftAnchors: PenAnchor[];
  /** Id of the shape currently in Pen tool "Edit Path" mode (its persistent
   * `penAnchors` are being shown/dragged directly on the canvas instead of
   * the normal bounding-box resize handles) — null when no shape is being
   * edited this way. Same not-undo-tracked view-state convention as
   * `penToolActive`; the individual anchor/handle edits made while this is
   * set ARE tracked (see updatePenShapeAnchorPosition/Handle). */
  editingPenShapeId: string | null;
  /** Whether the Cut tool is armed — same view-state convention as
   * penToolActive. While active, a click-drag on the canvas draws a
   * straight knife line (see cutShapesByLine) instead of selecting or
   * marqueeing. */
  cutToolActive: boolean;
  /** Which stamp tool (rect/circle/polygon/star/hole) is currently armed
   * for click-or-drag creation — null when none is. Same view-state
   * convention as penToolActive/cutToolActive: while set, a drag on the
   * canvas draws the new shape's own position/size interactively instead
   * of selecting or marqueeing; a plain click (no real drag) places it at
   * a default size centered under the cursor. Auto-clears back to null
   * once a shape is actually placed, matching Figma's own "draw one,
   * back to Select" default. */
  shapeToolActive: "rect" | "circle" | "polygon" | "star" | "hole" | null;

  addPlate: () => void;
  renamePlate: (id: string, name: string) => void;
  deletePlate: (id: string) => void;
  setActivePlate: (id: string) => void;
  /** Reassigns the top-level ancestor of each id to a different plate —
   * how an object "doesn't fit" on one plate moves to another. */
  moveRootsToPlate: (ids: string[], plateId: string) => void;
  /** Loads a different locally-saved project into the editor, replacing
   * everything currently open. The project being left is safe either way
   * — autosave already persisted it continuously while it was open. */
  loadProject: (id: string) => void;

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
  dismissFloatingWarning: (ids: string[]) => void;
  /** Acknowledges the thin-feature warning for these shapes — for a
   * deliberately fine detail that's meant to stay that thin. */
  dismissThinFeatureWarning: (ids: string[]) => void;
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
  /** Arms/disarms a stamp tool for click-or-drag creation on the canvas.
   * Pass null to disarm (return to Select). */
  setShapeToolActive: (kind: "rect" | "circle" | "polygon" | "star" | "hole" | null) => void;
  /** Creates a new shape layer of the given kind sized/positioned exactly
   * to `bounds` (document mm) — the Canvas2D drag-to-draw gesture's own
   * commit action. `bounds.width`/`height` are floored to a small minimum
   * so a near-zero drag (or a plain click, which Canvas2D turns into a
   * small bounds box centered on the cursor) never produces a degenerate,
   * effectively invisible shape. */
  createShapeLayerAt: (
    kind: "rect" | "circle" | "polygon" | "star" | "hole",
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  setPolygonSides: (id: string, sides: number) => void;
  setStarParams: (id: string, points: number, innerRatio: number) => void;

  /** Drops a JPG/PNG reference image onto the canvas as its own layer —
   * a visual tracing aid only, never extruded or exported (see
   * buildAssemblyGroup, which skips "image" layers entirely). `center` is
   * where the image's own center should land, in document mm. */
  addImageLayer: (args: {
    src: string;
    naturalWidth: number;
    naturalHeight: number;
    name: string;
    center: { x: number; y: number };
  }) => void;

  /** Arms the Pen tool — a real bezier pen matching Figma/Illustrator/
   * Photoshop's own: click places a straight "corner" anchor, click-and-
   * drag places a "smooth" anchor with a curve handle, click near the
   * first anchor (or press Enter) closes the path into one ordinary
   * ShapeLayer (see finishPenTool), Escape cancels, Backspace undoes the
   * last anchor. */
  beginPenTool: () => void;
  addPenAnchor: (a: PenAnchor) => void;
  /** Removes the most recently placed anchor (Backspace while drawing) —
   * cancels the whole tool if that was the only anchor left. */
  undoLastPenAnchor: () => void;
  /** Moves the anchor at `index` to `point`, carrying its handles along by
   * the same delta so the curve shape it already has stays put relative
   * to the anchor — dragging the dot you just placed, not redrawing it.
   * Canvas2D only ever calls this for the LAST anchor (dragging an
   * earlier one would collide with the "click the first anchor to close"
   * hotspot once a path is long enough to close at all). */
  updatePenAnchorPosition: (index: number, point: Point2) => void;
  /** Moves one handle of the anchor at `index` to `point`, mirroring the
   * opposite handle to keep the anchor smooth — the same live re-drag
   * Illustrator/Figma/Photoshop allow on the anchor you just placed,
   * before moving on to the next point. */
  updatePenAnchorHandle: (
    index: number,
    which: "handleIn" | "handleOut",
    point: Point2,
    independent?: boolean,
  ) => void;
  /**
   * Closes the current draft into a real shape layer and returns to the
   * Select tool. Needs at least 3 anchors to form an outline — with fewer,
   * behaves like cancelPenTool instead (there's no sensible shape to make
   * out of one or two anchors, so there's nothing to leave half-drawn).
   *
   * `closingHandleIn`, when given, is the drag endpoint of a click-and-
   * drag gesture used to CLOSE the path (dragging on the first anchor to
   * curve the final closing segment) — it's applied as the first anchor's
   * own handleIn before flattening, the same as it would be if the anchor
   * had been created with that handle to begin with.
   */
  finishPenTool: (closingHandleIn?: Point2) => void;
  cancelPenTool: () => void;

  /**
   * Re-opens a finished Pen shape's real anchor/handle structure for
   * editing (double-click it on the canvas) — Figma's own "the Pen tool
   * never really stops being available on a vector path" model, instead of
   * a one-shot draw-then-forget tool. No-op if the layer has no
   * `penAnchors` (anything not originally drawn with the Pen tool).
   */
  beginEditPenShape: (id: string) => void;
  /** Leaves Edit Path mode (Escape, or clicking elsewhere) — the edits
   * already made are already live on the layer, so this only clears which
   * shape is being edited. */
  endEditPenShape: () => void;
  /** Moves anchor `index` of shape `id`'s persistent path to `point`
   * (shape-local space), carrying its handles along by the same delta, and
   * regenerates `regions` from the updated anchors so the rendered/
   * extruded outline stays in sync. */
  updatePenShapeAnchorPosition: (id: string, index: number, point: Point2) => void;
  /** Moves one handle of anchor `index` on shape `id`'s persistent path,
   * mirroring per the anchor's type (see applyPenHandleDrag), and
   * regenerates `regions`. */
  updatePenShapeAnchorHandle: (
    id: string,
    index: number,
    which: "handleIn" | "handleOut",
    point: Point2,
    independent?: boolean,
  ) => void;
  /** Converts anchor `index` of shape `id`'s persistent path between
   * corner/smooth/symmetric, deriving sensible handle positions when
   * switching to a curved type from a corner that has none yet. */
  setPenShapeAnchorType: (id: string, index: number, type: PenAnchorType) => void;
  /** Removes anchor `index` from shape `id`'s persistent path (no-op below
   * 3 remaining anchors, matching the minimum a real outline needs). */
  deletePenShapeAnchor: (id: string, index: number) => void;

  /** Arms/disarms the Cut (knife) tool. */
  setCutToolActive: (active: boolean) => void;
  /** Draws a straight knife line from p1 to p2 (document mm space) and
   * splits every visible, unlocked, non-hole top-level shape on the
   * active plate that the line actually crosses into two separate shape
   * layers along that line — Figma's knife/Cut tool, scoped to this app's
   * filled-solid shape model rather than open bezier paths. A shape whose
   * bounds the line merely passes near, without truly crossing its
   * outline, is left untouched (see splitRegionsByLine). */
  cutShapesByLine: (p1: Point2, p2: Point2) => void;
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
  dismissedFloatingIds: string[];
  dismissedThinFeatureIds: string[];
}

function partializeScene(state: SceneState): TrackedSceneSlice {
  return {
    document: state.document,
    layers: state.layers,
    rootIds: state.rootIds,
    plates: state.plates,
    plateOf: state.plateOf,
    dismissedFloatingIds: state.dismissedFloatingIds,
    dismissedThinFeatureIds: state.dismissedThinFeatureIds,
  };
}

const initialState = resolveInitialState();

export const useSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
  document: initialState.document,
  layers: initialState.layers,
  rootIds: initialState.rootIds,
  plates: initialState.plates,
  activePlateId: initialState.activePlateId,
  activeProjectId: initialState.activeProjectId,
  plateOf: initialState.plateOf,
  dismissedFloatingIds: initialState.dismissedFloatingIds,
  dismissedThinFeatureIds: initialState.dismissedThinFeatureIds,
  selection: [],
  viewMode: "2d",
  showGrid: true,
  wireframe: false,
  penToolActive: false,
  penDraftAnchors: [],
  editingPenShapeId: null,
  cutToolActive: false,
  shapeToolActive: null,

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

  newProject: () => {
    const id = nanoid(8);
    const { content, activePlateId } = buildBlankProjectContent();
    saveProjectContent(id, content);
    touchProjectMeta(id, content.document.name);
    setActiveProjectId(id);
    // Swapping in a different project's content is not itself an
    // undoable edit — pause zundo's automatic per-set tracking around the
    // swap (otherwise this very set() call gets recorded as one history
    // entry, leaving Undo able to jump back to the OLD project's content)
    // and reset history only once the swap is safely untracked.
    useSceneStore.temporal.getState().pause();
    set({ ...content, activePlateId, activeProjectId: id, selection: [] });
    useSceneStore.temporal.setState({ pastStates: [], futureStates: [] });
    useSceneStore.temporal.getState().resume();
  },

  loadProject: (id) => {
    const content = loadProjectContent(id);
    if (!content) return;
    setActiveProjectId(id);
    useSceneStore.temporal.getState().pause();
    set({
      ...content,
      layers: normalizeLoadedLayers(content.layers),
      dismissedFloatingIds: content.dismissedFloatingIds ?? [],
      dismissedThinFeatureIds: content.dismissedThinFeatureIds ?? [],
      activePlateId: content.plates[0]?.id ?? defaultPlates().activePlateId,
      activeProjectId: id,
      selection: [],
    });
    useSceneStore.temporal.setState({ pastStates: [], futureStates: [] });
    useSceneStore.temporal.getState().resume();
  },

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
      // A hole is a cutting tool, not a physical object — it has no
      // printable material of its own to rest on anything, and its Z is
      // deliberately set relative to whatever it cuts (manually, or via
      // the recessed-pocket snap), not by what's stacked beneath it.
      // Auto-Stack must never reposition one, or treat one as solid
      // support for anything else — same convention already used by
      // computeFloatingLayerSeverities.
      const order = flattenForDisplay(state.layers, getRootIdsForPlate(state, state.activePlateId))
        .map((r) => r.id)
        .filter((id) => {
          const l = state.layers[id];
          return l?.type === "shape" && !(l as ShapeLayer).isHole;
        });

      // Process the largest footprint first, not layer-panel order — a
      // real physical base (a background, a mounting plate) is reliably
      // the larger of two overlapping shapes, while what rests on it is
      // the smaller one. Layer order is just how things happen to be
      // organized in the panel (grouped, sorted, dragged around) and
      // isn't a reliable stand-in for which shape is physically underneath.
      const withRegions = order
        .map((id) => {
          const regions = getWorldRegions(state.layers, id);
          return { id, regions, area: regionsArea(regions) };
        })
        .sort((a, b) => b.area - a.area);

      // A single top-to-bottom walk (largest footprint first) assumes the
      // physical base is always the bigger of any two overlapping shapes —
      // true almost always, but not for something like a wide flat lid
      // resting on a small post: the lid (bigger area) gets walked, and
      // therefore placed, BEFORE its actual support (the smaller post)
      // has a settled height to rest on, so it lands wrong on this pass.
      // The post itself still resolves correctly later in the same pass,
      // which is exactly what let it look fixed only "the second click" —
      // the first click did move the post, just not in time to help the
      // lid that already walked past it. Repeating the whole walk against
      // each pass's own settled heights (rather than the original,
      // possibly-stale ones) converges any such case within a few passes
      // instead of needing another manual click — footprints/areas never
      // change here, only the z each shape settles at, so only the walk
      // itself needs repeating.
      const MAX_STACK_PASSES = 8;
      let layers = state.layers;
      for (let pass = 0; pass < MAX_STACK_PASSES; pass++) {
        const nextLayers = { ...layers };
        const placed: { regions: ReturnType<typeof getWorldRegions>; topZ: number }[] = [];
        let anyChanged = false;

        for (const { id, regions, area } of withRegions) {
          const layer = layers[id] as ShapeLayer;
          const localZRange = getLocalShapeZRange(layer);
          const parentWorldZ = layer.parentId !== null ? getWorldTransform(layers, layer.parentId).z : 0;

          // baseZ is the tallest already-placed shape this one's real
          // outline genuinely, MEANINGFULLY overlaps — not merely
          // bbox-adjacent to, and not just brushing edges with. A flat,
          // multi-color SVG (a badge's background + logo + text, each its
          // own path) very often has paths that share an exact boundary
          // edge or clip a hairline sliver of each other — real geometry,
          // but not "one shape resting on another," just adjacent colors
          // on the same plane. Requiring the overlap to cover a real
          // fraction of THIS shape's own footprint (not just be
          // nonzero) is what tells "B rests on A" apart from "B and A
          // happen to touch at a shared edge" — the same relative-area
          // idea `computeFloatingLayerSeverities` already uses to tell a
          // genuinely floating shape from one with real support. Without
          // this, a design with several touching-but-not-overlapping
          // regions cascaded into an unwanted tower on every click,
          // instead of staying flush at the same height the way it
          // should for shapes that don't actually rest on each other.
          // A shape only partially covered by real support (part of it
          // hanging over empty space) is left for the persistent
          // floating-shape banner to catch and offer a targeted fix for.
          //
          // Grouping is an organizational device, not a physics boundary —
          // a shape rests on whichever already-placed shape it genuinely
          // overlaps most, whether that support is a sibling under the
          // same group, a completely different group's member, or a
          // top-level shape. This used to be restricted to same-group-only
          // support (so a group's members would settle against each other
          // but never against anything outside the group), which broke the
          // ordinary case of a few decorative pieces grouped together for
          // organization while still physically sitting on top of an
          // ungrouped base shape — Auto-Stack silently sank them back to
          // the group's own local floor instead of resting them on what
          // they actually overlap, every time it ran.
          const MEANINGFUL_OVERLAP_FRACTION = 0.05;
          let baseZ = 0;
          for (const p of placed) {
            if (p.topZ <= baseZ) continue; // can't raise baseZ any further
            if (regionsIntersectionArea(regions, p.regions) > area * MEANINGFUL_OVERLAP_FRACTION) baseZ = p.topZ;
          }

          // baseZ and topZ are always WORLD Z (parentWorldZ cancels out
          // when comparing two shapes under the same parent, so this holds
          // regardless of nesting depth) — converting to this shape's own
          // LOCAL z means removing both the parent's world offset and this
          // shape's own geometric bottom (localZRange.min). Clamping at 0
          // is the right default for an unsupported shape either way: for
          // a top-level shape that's the actual bed; for a group member
          // with nothing to rest on, that's the group's own local floor —
          // wherever the group itself was already positioned.
          const localZ = Math.max(0, baseZ - localZRange.min - parentWorldZ);
          if (Math.abs(localZ - layer.transform.z) > 1e-6) {
            nextLayers[id] = { ...layer, transform: { ...layer.transform, z: localZ } };
            anyChanged = true;
          }

          {
            const topZ = parentWorldZ + localZ + localZRange.max;
            // A hole cut into it removes it from what's usable as landing
            // surface for anything else — see getWorldSupportRegions.
            placed.push({ regions: getWorldSupportRegions(layers, id, topZ), topZ });
          }
        }

        layers = nextLayers;
        if (!anyChanged) break;
      }
      return { layers };
    });
    showToast("Auto-stacked all layers");
  },

  fixFloatingLayers: (ids) => {
    let fixedCount = 0;
    set((state) => {
      const layers = { ...state.layers };
      // A hole is a cutting tool, not a physical object — see the same
      // exclusion in autoStackLayers. It can neither BE the floating item
      // being fixed (computeFloatingLayerSeverities already never reports
      // one) nor count as something else's support.
      const allIds = flattenForDisplay(state.layers, getRootIdsForPlate(state, state.activePlateId))
        .map((r) => r.id)
        .filter((id) => {
          const l = state.layers[id];
          return l?.type === "shape" && !(l as ShapeLayer).isHole;
        });
      // Support is computed against everyone else's CURRENT position, using
      // the original (pre-fix) snapshot — fixing one floating shape should
      // never change what another floating shape in the same batch is
      // measured against.
      const info = allIds.map((id) => {
        const layer = state.layers[id] as ShapeLayer;
        const regions = getWorldRegions(state.layers, id);
        // The shape's REAL world Z extent, not its nominal transform.z /
        // transform.z+extrusionDepth — a bevel can make either end depart
        // from that naive box (see getShapeWorldZRange).
        const zRange = getShapeWorldZRange(state.layers, id) ?? { min: 0, max: layer.extrusionDepth };
        return { id, layer, regions, area: regionsArea(regions), zRange };
      });
      for (const id of ids) {
        const item = info.find((i) => i.id === id);
        if (!item) continue;
        // Only a shape whose own footprint isn't smaller counts as
        // "underneath" this one — a real physical base (the badge
        // background, a mounting plate) is reliably the larger of the two
        // overlapping shapes, while whatever sits on top of it is the
        // smaller one. This used to be decided by layer-panel order
        // instead (assuming document order tracks stacking order), but
        // that breaks the moment someone drags layers around for
        // organization rather than stacking — reordering a shape in the
        // panel should never change where Fix decides it physically
        // rests. Area is a property of the geometry itself, so it holds
        // regardless of list order, while still preventing the original
        // bug this guarded against: raising a large background and
        // hitting Fix must drop it back to the ground, not rest it on
        // top of the small foreground pieces it's supposed to support.
        const AREA_SLACK = 1e-6;
        const others = info.filter((o) => o.id !== id && o.area >= item.area - AREA_SLACK);
        let baseZ = 0;
        for (const o of others) {
          const topZ = o.zRange.max;
          if (topZ <= baseZ) continue;
          // A hole cut through `o` right at its own top surface leaves
          // nothing there to rest on — see getWorldSupportRegions.
          const supportRegions = getWorldSupportRegions(state.layers, o.id, topZ);
          if (regionsIntersectionArea(item.regions, supportRegions) > 1e-6) baseZ = topZ;
        }
        // Land the shape's ACTUAL geometry — not its transform origin or
        // its selection-outline bounding box, which is only a visual
        // decoration — exactly on baseZ.
        const localZRange = getLocalShapeZRange(item.layer);
        const parentWorldZ = item.layer.parentId ? getWorldTransform(layers, item.layer.parentId).z : 0;
        const localZ = Math.max(0, baseZ - parentWorldZ - localZRange.min);
        layers[id] = { ...layers[id], transform: { ...layers[id].transform, z: localZ } } as ShapeLayer;
        fixedCount++;
      }
      return { layers };
    });
    if (fixedCount > 0) showToast(`Fixed ${fixedCount} floating shape${fixedCount === 1 ? "" : "s"}`);
  },

  dismissFloatingWarning: (ids) =>
    set((state) => ({
      dismissedFloatingIds: Array.from(new Set([...state.dismissedFloatingIds, ...ids])),
    })),

  dismissThinFeatureWarning: (ids) =>
    set((state) => ({
      dismissedThinFeatureIds: Array.from(new Set([...state.dismissedThinFeatureIds, ...ids])),
    })),

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

      const dismissedFloatingIds = state.dismissedFloatingIds.some((did) => toRemove.has(did))
        ? state.dismissedFloatingIds.filter((did) => !toRemove.has(did))
        : state.dismissedFloatingIds;
      const dismissedThinFeatureIds = state.dismissedThinFeatureIds.some((did) => toRemove.has(did))
        ? state.dismissedThinFeatureIds.filter((did) => !toRemove.has(did))
        : state.dismissedThinFeatureIds;

      return {
        layers,
        rootIds,
        plateOf,
        dismissedFloatingIds,
        dismissedThinFeatureIds,
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

      // Re-anchor the merged shape's own local origin to its bounding box's
      // corner, matching the same convention every OTHER shape already
      // follows (a freshly-created rect's own points start at its local
      // (0,0), and transform.x/y IS that corner's real position) — without
      // this, `regions` above are left sitting wherever the union math
      // happened to bake them (effectively the document/parent origin) with
      // transform.x/y at a meaningless (0, 0) that has nothing to do with
      // where the shape actually is. That mismatch is harmless for the 3D
      // scene itself (transform.x/y=0 contributes nothing, so the baked
      // points alone are still the correct final position) but corrupts
      // the ONE thing transform.x/y is for: repositioning the shape
      // afterward. The X/Y Inspector fields, an align action, or a drag all
      // read/write transform.x/y expecting it to already equal the shape's
      // own corner — so nudging a merged shape by typing a new X, or
      // aligning it with another shape, silently landed it somewhere
      // else entirely (transform.x/y=0 masqueraded as "already at the
      // origin", so any edit added straight onto the real baked position
      // instead of replacing it), which is exactly what going on to export
      // the file looked like: the merged shape "jumping" to an unexpected
      // spot on the plate.
      let minX = Infinity;
      let minY = Infinity;
      for (const region of regions) {
        for (const p of region.outer.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
        }
      }
      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        regions = regions.map((region) => ({
          outer: { points: region.outer.points.map((p) => ({ x: p.x - minX, y: p.y - minY })) },
          holes: region.holes.map((h) => ({ points: h.points.map((p) => ({ x: p.x - minX, y: p.y - minY })) })),
        }));
      } else {
        minX = 0;
        minY = 0;
      }

      const frontMost = shapeLayers[shapeLayers.length - 1];
      const mergedId = nanoid(8);
      // Keep the merged shape sitting at the same physical height AND the
      // same 3D tilt (pitch/yaw) the front-most source had, both expressed
      // relative to its new parent. Roll (Z-rotation) is the one axis that
      // gets baked directly into the merged region points above (2D outlines
      // can only represent a flat rotation), so the merged shape's own
      // `rotation` is correctly identity — but pitch/yaw is a purely visual
      // 3D tilt with no 2D representation at all, so unless it's carried
      // over here explicitly, it silently resets to flat on every merge.
      const frontMostWorld = getWorldTransform(state.layers, frontMost.id);
      const mergedParentWorld = topLayer.parentId
        ? getWorldTransform(state.layers, topLayer.parentId)
        : { z: 0, rotationX: 0, rotationY: 0 };

      const merged: ShapeLayer = {
        id: mergedId,
        type: "shape",
        name: `${topLayer.name} (merged)`,
        visible: true,
        locked: false,
        color: frontMost.color,
        transform: {
          ...IDENTITY_TRANSFORM,
          x: minX,
          y: minY,
          z: Math.max(0, frontMostWorld.z - mergedParentWorld.z),
          rotationX: frontMostWorld.rotationX - mergedParentWorld.rotationX,
          rotationY: frontMostWorld.rotationY - mergedParentWorld.rotationY,
        },
        parentId: topLayer.parentId,
        regions,
        extrusionDepth: frontMost.extrusionDepth,
        // Corner rounding already bakes into the outline itself (see
        // roundRegions above, applied to each source before the union), so
        // there's no separate rounding left for the merged shape's own
        // cornerRadius to apply. Bevel is a distinct top/bottom chamfer the
        // extrude geometry generates per-region generically — it has no
        // problem with the multi-region, holed, or concave outlines a union
        // routinely produces, so there's no reason to throw away whatever
        // edge treatment the front-most source had, unlike corner rounding.
        cornerRadius: 0,
        bevelBottom: frontMost.bevelBottom,
        bevelTop: frontMost.bevelTop,
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
        // See the identical comment in mergeLayers above: corner rounding
        // is already baked into each operand's outline before the boolean
        // op runs, but bevel is a distinct top/bottom chamfer the extrude
        // geometry generates per-region regardless of how complex the
        // resulting outline is, so there's no reason to discard whatever
        // edge treatment the front-most operand had.
        cornerRadius: 0,
        bevelBottom: frontMost.bevelBottom,
        bevelTop: frontMost.bevelTop,
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

  setShapeToolActive: (kind) => set({ shapeToolActive: kind }),

  createShapeLayerAt: (kind, bounds) =>
    set((state) => {
      const id = nanoid(8);
      // A drag that never really moved (or a plain click, which Canvas2D
      // turns into a tiny bounds box centered on the cursor) would
      // otherwise produce a shape too small to see or select — floor
      // both dimensions the same way an accidental near-zero resize
      // already is elsewhere in this store.
      const w = Math.max(1, bounds.width);
      const h = Math.max(1, bounds.height);
      let regions: ShapeRegion[];
      const DEFAULT_POLYGON_SIDES = 6;
      const DEFAULT_STAR_POINTS = 5;
      const DEFAULT_STAR_INNER_RATIO = 0.45;

      if (kind === "rect") {
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
      } else if (kind === "polygon") {
        regions = [{ outer: { points: normalizeToBounds(regularPolygonPoints(DEFAULT_POLYGON_SIDES), w, h) }, holes: [] }];
      } else if (kind === "star") {
        regions = [
          {
            outer: { points: normalizeToBounds(starPolygonPoints(DEFAULT_STAR_POINTS, DEFAULT_STAR_INNER_RATIO), w, h) },
            holes: [],
          },
        ];
      } else {
        // circle/hole: an ellipse inscribed in w x h — a Shift-constrained
        // drag (equal w/h, see Canvas2D) still gives a perfect circle.
        const rx = w / 2;
        const ry = h / 2;
        const segments = 64;
        const points = Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * Math.PI * 2;
          return { x: rx + Math.cos(a) * rx, y: ry + Math.sin(a) * ry };
        });
        regions = [{ outer: { points }, holes: [] }];
      }

      const name =
        kind === "rect" ? "Rectangle"
        : kind === "hole" ? "Hole"
        : kind === "circle" ? "Circle"
        : kind === "polygon" ? "Polygon"
        : "Star";

      const layer: ShapeLayer = {
        id,
        type: "shape",
        name,
        visible: true,
        locked: false,
        color: "#4f46e5",
        transform: { ...IDENTITY_TRANSFORM, x: bounds.x, y: bounds.y },
        parentId: null,
        regions,
        extrusionDepth: 1.2,
        cornerRadius: 0,
        bevelBottom: 0,
        bevelTop: 0,
        isHole: kind === "hole",
        ...(kind === "polygon" ? { polygonSides: DEFAULT_POLYGON_SIDES } : {}),
        ...(kind === "star" ? { starPoints: DEFAULT_STAR_POINTS, starInnerRatio: DEFAULT_STAR_INNER_RATIO } : {}),
      };

      return {
        layers: { ...state.layers, [id]: layer },
        rootIds: [...state.rootIds, id],
        plateOf: { ...state.plateOf, [id]: state.activePlateId },
        selection: [id],
      };
    }),

  addImageLayer: ({ src, naturalWidth, naturalHeight, name, center }) =>
    set((state) => {
      const id = nanoid(8);
      // Reference photos rarely arrive at a print-relevant scale, so drop
      // them in at a fixed, readable size (the longer side capped to a
      // third of the document) rather than their raw pixel dimensions,
      // preserving the source aspect ratio — Shift+resize-handle (see
      // Canvas2D) locks that ratio for any further scaling.
      const aspect = naturalWidth / Math.max(1, naturalHeight);
      const maxSide = Math.max(20, Math.min(state.document.widthMM, state.document.heightMM) / 3);
      const width = aspect >= 1 ? maxSide : maxSide * aspect;
      const height = aspect >= 1 ? maxSide / aspect : maxSide;

      const layer: ImageLayer = {
        id,
        type: "image",
        name,
        visible: true,
        locked: false,
        color: "#888888",
        transform: { ...IDENTITY_TRANSFORM, x: center.x - width / 2, y: center.y - height / 2 },
        parentId: null,
        src,
        naturalWidth,
        naturalHeight,
        width,
        height,
        opacity: 1,
      };

      return {
        layers: { ...state.layers, [id]: layer },
        rootIds: [...state.rootIds, id],
        plateOf: { ...state.plateOf, [id]: state.activePlateId },
        selection: [id],
      };
    }),

  setPolygonSides: (id, sides) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      const clamped = Math.max(3, Math.min(24, Math.round(sides)));
      const bounds = getLocalShapeBounds(layer);
      const w = bounds ? bounds.maxX - bounds.minX : 20;
      const h = bounds ? bounds.maxY - bounds.minY : 20;
      const regions: ShapeRegion[] = [{ outer: { points: normalizeToBounds(regularPolygonPoints(clamped), w, h) }, holes: [] }];
      return {
        layers: { ...state.layers, [id]: { ...layer, regions, polygonSides: clamped } },
      };
    }),

  setStarParams: (id, points, innerRatio) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape") return {};
      const clampedPoints = Math.max(3, Math.min(24, Math.round(points)));
      const clampedRatio = Math.max(0.05, Math.min(0.95, innerRatio));
      const bounds = getLocalShapeBounds(layer);
      const w = bounds ? bounds.maxX - bounds.minX : 20;
      const h = bounds ? bounds.maxY - bounds.minY : 20;
      const regions: ShapeRegion[] = [
        { outer: { points: normalizeToBounds(starPolygonPoints(clampedPoints, clampedRatio), w, h) }, holes: [] },
      ];
      return {
        layers: {
          ...state.layers,
          [id]: { ...layer, regions, starPoints: clampedPoints, starInnerRatio: clampedRatio },
        },
      };
    }),

  beginPenTool: () => set(() => ({ penToolActive: true, penDraftAnchors: [], selection: [] })),

  addPenAnchor: (a) =>
    set((state) => (state.penToolActive ? { penDraftAnchors: [...state.penDraftAnchors, a] } : {})),

  undoLastPenAnchor: () =>
    set((state) => {
      if (!state.penToolActive) return {};
      if (state.penDraftAnchors.length === 0) return { penToolActive: false };
      return { penDraftAnchors: state.penDraftAnchors.slice(0, -1) };
    }),

  updatePenAnchorPosition: (index, point) =>
    set((state) => {
      if (!state.penToolActive) return {};
      const anchor = state.penDraftAnchors[index];
      if (!anchor) return {};
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      const next: PenAnchor = {
        x: point.x,
        y: point.y,
        type: anchor.type,
        handleIn: anchor.handleIn ? { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy } : undefined,
        handleOut: anchor.handleOut ? { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy } : undefined,
      };
      const penDraftAnchors = [...state.penDraftAnchors];
      penDraftAnchors[index] = next;
      return { penDraftAnchors };
    }),

  updatePenAnchorHandle: (index, which, point, independent = false) =>
    set((state) => {
      if (!state.penToolActive) return {};
      const anchor = state.penDraftAnchors[index];
      if (!anchor) return {};
      const next = applyPenHandleDrag(anchor, which, point, independent);
      const penDraftAnchors = [...state.penDraftAnchors];
      penDraftAnchors[index] = next;
      return { penDraftAnchors };
    }),

  finishPenTool: (closingHandleIn) =>
    set((state) => {
      if (!state.penToolActive) return {};
      if (state.penDraftAnchors.length < 3) return { penToolActive: false, penDraftAnchors: [] };

      // A drag on the closing click curves the final segment back into the
      // first anchor — apply it as that anchor's own handleIn, exactly as
      // if it had been drawn with that handle from the start.
      const anchors = closingHandleIn
        ? state.penDraftAnchors.map((a, i) => (i === 0 ? { ...a, handleIn: closingHandleIn } : a))
        : state.penDraftAnchors;
      const flatPoints = flattenPenAnchors(anchors);

      // Re-anchor to the flattened outline's own bounding-box corner, same
      // as every other shape's local-origin convention (see mergeLayers'
      // identical re-anchoring, and its comment on why transform.x/y has
      // to actually equal the shape's real corner for X/Y edits, align,
      // and drag to keep working correctly afterward).
      let minX = Infinity;
      let minY = Infinity;
      for (const p of flatPoints) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
      }
      const points = flatPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));

      // Carry the real anchor/handle structure onto the layer too (offset
      // into the same local space `points` just moved into) so Edit Path
      // mode can re-open the actual curves instead of only ever seeing the
      // flattened, already-tessellated `regions` outline.
      const penAnchors: PenAnchor[] = anchors.map((a) => ({
        x: a.x - minX,
        y: a.y - minY,
        type: a.type,
        handleIn: a.handleIn ? { x: a.handleIn.x - minX, y: a.handleIn.y - minY } : undefined,
        handleOut: a.handleOut ? { x: a.handleOut.x - minX, y: a.handleOut.y - minY } : undefined,
      }));

      const id = nanoid(8);
      const layer: ShapeLayer = {
        id,
        type: "shape",
        name: "Pen shape",
        visible: true,
        locked: false,
        color: "#4f46e5",
        transform: { ...IDENTITY_TRANSFORM, x: minX, y: minY },
        parentId: null,
        regions: [{ outer: { points }, holes: [] }],
        extrusionDepth: 1.2,
        cornerRadius: 0,
        bevelBottom: 0,
        bevelTop: 0,
        isHole: false,
        penAnchors,
      };

      return {
        layers: { ...state.layers, [id]: layer },
        rootIds: [...state.rootIds, id],
        plateOf: { ...state.plateOf, [id]: state.activePlateId },
        selection: [id],
        penToolActive: false,
        penDraftAnchors: [],
      };
    }),

  cancelPenTool: () => set(() => ({ penToolActive: false, penDraftAnchors: [] })),

  beginEditPenShape: (id) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape" || !layer.penAnchors || layer.penAnchors.length < 3) return {};
      return { editingPenShapeId: id, selection: [id] };
    }),

  endEditPenShape: () => set(() => ({ editingPenShapeId: null })),

  updatePenShapeAnchorPosition: (id, index, point) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape" || !layer.penAnchors) return {};
      const anchor = layer.penAnchors[index];
      if (!anchor) return {};
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      const next: PenAnchor = {
        x: point.x,
        y: point.y,
        type: anchor.type,
        handleIn: anchor.handleIn ? { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy } : undefined,
        handleOut: anchor.handleOut ? { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy } : undefined,
      };
      const penAnchors = [...layer.penAnchors];
      penAnchors[index] = next;
      const regions: ShapeRegion[] = [
        { outer: { points: flattenPenAnchors(penAnchors) }, holes: layer.regions[0]?.holes ?? [] },
        ...layer.regions.slice(1),
      ];
      return { layers: { ...state.layers, [id]: { ...layer, penAnchors, regions } } };
    }),

  updatePenShapeAnchorHandle: (id, index, which, point, independent = false) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape" || !layer.penAnchors) return {};
      const anchor = layer.penAnchors[index];
      if (!anchor) return {};
      const nextAnchor = applyPenHandleDrag(anchor, which, point, independent);
      const penAnchors = [...layer.penAnchors];
      penAnchors[index] = nextAnchor;
      const regions: ShapeRegion[] = [
        { outer: { points: flattenPenAnchors(penAnchors) }, holes: layer.regions[0]?.holes ?? [] },
        ...layer.regions.slice(1),
      ];
      return { layers: { ...state.layers, [id]: { ...layer, penAnchors, regions } } };
    }),

  setPenShapeAnchorType: (id, index, type) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape" || !layer.penAnchors) return {};
      const penAnchors = applySetAnchorType(layer.penAnchors, index, type);
      const regions: ShapeRegion[] = [
        { outer: { points: flattenPenAnchors(penAnchors) }, holes: layer.regions[0]?.holes ?? [] },
        ...layer.regions.slice(1),
      ];
      return { layers: { ...state.layers, [id]: { ...layer, penAnchors, regions } } };
    }),

  deletePenShapeAnchor: (id, index) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || layer.type !== "shape" || !layer.penAnchors) return {};
      if (layer.penAnchors.length <= 3) return {};
      const penAnchors = layer.penAnchors.filter((_, i) => i !== index);
      const regions: ShapeRegion[] = [
        { outer: { points: flattenPenAnchors(penAnchors) }, holes: layer.regions[0]?.holes ?? [] },
        ...layer.regions.slice(1),
      ];
      return { layers: { ...state.layers, [id]: { ...layer, penAnchors, regions } } };
    }),

  setCutToolActive: (active) => set({ cutToolActive: active }),

  cutShapesByLine: (p1, p2) =>
    set((state) => {
      const lineBounds: Bounds = {
        minX: Math.min(p1.x, p2.x),
        minY: Math.min(p1.y, p2.y),
        maxX: Math.max(p1.x, p2.x),
        maxY: Math.max(p1.y, p2.y),
      };
      const candidateIds = getRootIdsForPlate(state, state.activePlateId);
      const layers = { ...state.layers };
      const rootIds = [...state.rootIds];
      const plateOf = { ...state.plateOf };
      const selection: string[] = [];
      let cutCount = 0;

      for (const id of candidateIds) {
        const layer = state.layers[id];
        if (!layer || layer.type !== "shape" || layer.isHole || !layer.visible || layer.locked) continue;
        const worldBounds = getLayerWorldBounds(state.layers, id);
        if (!worldBounds || !boundsOverlap(worldBounds, lineBounds)) continue;

        // The knife line is drawn in document space; each shape's own
        // regions live in its LOCAL (untransformed) space, so the line
        // has to travel through the same inverse the shape's own
        // rendering/hit-testing already uses before the split math (which
        // only understands a shape's own local coordinates) can touch it.
        const worldT = getWorldTransform(state.layers, id);
        const localP1 = invertTransform2D(p1, worldT);
        const localP2 = invertTransform2D(p2, worldT);
        const split = splitRegionsByLine(layer.regions, localP1, localP2);
        if (!split) continue;

        const [regionsA, regionsB] = split;
        const idA = nanoid(8);
        const idB = nanoid(8);
        const base = { ...layer, polygonSides: undefined, starPoints: undefined, starInnerRatio: undefined };
        layers[idA] = { ...base, id: idA, name: `${layer.name} 1`, regions: regionsA };
        layers[idB] = { ...base, id: idB, name: `${layer.name} 2`, regions: regionsB };
        delete layers[id];
        const idx = rootIds.indexOf(id);
        rootIds.splice(idx, 1, idA, idB);
        delete plateOf[id];
        plateOf[idA] = state.activePlateId;
        plateOf[idB] = state.activePlateId;
        selection.push(idA, idB);
        cutCount++;
      }

      if (cutCount === 0) return {};
      return { layers, rootIds, plateOf, selection };
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
        a.plateOf === b.plateOf &&
        a.dismissedFloatingIds === b.dismissedFloatingIds &&
        a.dismissedThinFeatureIds === b.dismissedThinFeatureIds,
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

// Autosave — fires on every store change (not just tracked-content ones;
// selection/view changes are cheap no-op re-saves, and filtering those
// out isn't worth the extra bookkeeping), debounced so a burst of edits
// only writes once shortly after things settle rather than on every
// intermediate frame of a drag.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTOSAVE_DEBOUNCE_MS = 600;
useSceneStore.subscribe(() => {
  const { activeProjectId } = useSceneStore.getState();
  if (!activeProjectId) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const state = useSceneStore.getState();
    saveProjectContent(state.activeProjectId, partializeScene(state));
    touchProjectMeta(state.activeProjectId, state.document.name);
  }, AUTOSAVE_DEBOUNCE_MS);
});

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
