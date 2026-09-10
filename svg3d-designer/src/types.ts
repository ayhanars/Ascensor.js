// Scene Model — single source of truth for the whole application.
// The 2D canvas, the 3D viewport and every exporter are derived views of this data.

export type Units = "mm" | "cm" | "in";

export interface Point2 {
  x: number;
  y: number;
}

/** A single closed contour in millimeters, local to its layer's origin. */
export interface Contour {
  points: Point2[];
}

/** One paintable/extrudable region: an outer contour plus zero or more holes. */
export interface ShapeRegion {
  outer: Contour;
  holes: Contour[];
}

/**
 * How an anchor's two handles relate to each other — the same three-way
 * distinction every professional vector tool (Figma/Illustrator/
 * Photoshop) exposes:
 *  - "corner": handles move fully independently. A cusp — the curve (or
 *    straight line) on either side of the anchor can point any direction,
 *    including no handle at all on one or both sides.
 *  - "smooth": handles stay collinear (opposite directions through the
 *    anchor) but may have different LENGTHS — the curve stays tangent-
 *    continuous through the anchor without forcing symmetric curvature.
 *  - "symmetric": handles stay collinear AND equal length — the strongest,
 *    most common "smooth curve" case, and what a plain click-and-drag
 *    anchor still defaults to.
 * Purely a hint for how a drag on ONE handle should update the OTHER one
 * (see updatePenAnchorHandle/updatePenShapeAnchorHandle) — the actual
 * curve math never looks at it directly, only at whatever handleIn/
 * handleOut currently are.
 */
export type PenAnchorType = "corner" | "smooth" | "symmetric";

/**
 * One anchor in a Pen tool path — both the in-progress draft (the store's
 * `penDraftAnchors`) and, once a path is finished, the persistent record
 * kept on its ShapeLayer (see `penAnchors` below) so the path stays a
 * real editable vector path instead of collapsing into an opaque polygon
 * the moment you're done drawing it. `handleIn`/`handleOut` are control
 * points for the incoming/outgoing bezier segment, in the SAME coordinate
 * space `x`/`y` are in (absolute document space while still a draft;
 * shape-local space once attached to a ShapeLayer, matching `regions`) —
 * undefined means that side of the anchor is a straight line, not a
 * curve. The rendered/extruded/exported outline is always the flattened
 * result (see `flattenPenAnchors` in geometry/primitives.ts): nothing
 * downstream of `regions` needs to know curves or anchor types were ever
 * involved, only this editing layer does.
 */
export interface PenAnchor extends Point2 {
  handleIn?: Point2;
  handleOut?: Point2;
  type: PenAnchorType;
}

export interface Transform2D {
  x: number; // mm, position of the layer origin on the document
  y: number; // mm
  /** Height above the print bed the layer's extrusion starts at, in mm. Never negative. */
  z: number;
  rotation: number; // degrees, around Z (roll — the original, print-bed "spin" axis)
  /** Degrees, around X (pitch) — tilts the object forward/back. 0 for a
   * flat-on-the-bed object; only meaningful in the 3D preview/export, not
   * the 2D canvas (see Viewport3D's rotation dial). */
  rotationX: number;
  /** Degrees, around Y (yaw) — tilts the object left/right. Same 3D-only
   * scope as rotationX. */
  rotationY: number;
  scaleX: number;
  scaleY: number;
}

export interface LayerCommon {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Hex color, e.g. "#ff0000". This is the *visual* color; print material is separate. */
  color: string;
  transform: Transform2D;
  parentId: string | null;
}

export interface GroupLayer extends LayerCommon {
  type: "group";
  children: string[]; // ordered child layer ids
}

export interface ShapeLayer extends LayerCommon {
  type: "shape";
  /** Geometry in local mm coordinates, already normalized from SVG units. */
  regions: ShapeRegion[];
  /** How far the flat shape is pushed into 3D, in mm. */
  extrusionDepth: number;
  /** Uniform corner rounding applied to every vertex, in mm. 0 = sharp. */
  cornerRadius: number;
  /** Straight chamfer cut into the bottom rim (z=0), in mm. 0 = sharp edge. */
  bevelBottom: number;
  /** Straight chamfer cut into the top rim (z=extrusionDepth), in mm. 0 = sharp edge. */
  bevelTop: number;
  /**
   * When true, this shape isn't printed as its own solid — its extruded
   * volume is subtracted (a real 3D boolean difference) from every solid
   * shape it overlaps, cutting a cavity or through-hole (e.g. a magnet
   * well or screw hole). Shown as a distinct translucent overlay in the 3D
   * preview so the negative space stays visible while editing, but never
   * appears as its own geometry in the STL export.
   */
  isHole: boolean;
  /** Side count for a shape created with the Polygon tool (a regular
   * N-gon) — undefined for every other shape, including one made with a
   * different tool. Only present so the Inspector's Sides field can
   * regenerate the outline in place; the points themselves are the real
   * geometry regardless of whether this is set. */
  polygonSides?: number;
  /** Point count for a shape created with the Star tool — same
   * undefined-elsewhere, editable-back-into-existence convention as
   * polygonSides. */
  starPoints?: number;
  /** Inner-vertex radius as a fraction of the outer radius, for a Star
   * tool shape. Only meaningful alongside starPoints. */
  starInnerRatio?: number;
  /** The Pen tool's own editable anchor/handle structure, in the same
   * local (shape-origin-relative) space as `regions` — present only for a
   * shape actually drawn with the Pen tool, undefined for every other
   * shape (same "editable-back-into-existence" convention as
   * polygonSides/starPoints). `regions` stays the single source of truth
   * for rendering/extrusion/export; this is what lets the Pen tool's own
   * Edit Path mode re-open the path's real anchors and handles later
   * instead of only ever seeing the flattened, already-tessellated
   * outline `regions` holds. Kept in sync with `regions` on every anchor/
   * handle edit (see updatePenShapeAnchorPosition/Handle in the store). */
  penAnchors?: PenAnchor[];
}

/**
 * A raster (JPG/PNG) reference image dropped onto the 2D canvas for
 * visual tracing — never extruded, never part of the 3D preview, and
 * never written to STL/3MF exports (see buildAssemblyGroup, which simply
 * skips this layer type). Purely a drawing aid.
 */
export interface ImageLayer extends LayerCommon {
  type: "image";
  /** Data URL of the source raster — kept inline so a saved project stays
   * a single self-contained JSON file. */
  src: string;
  /** Natural pixel dimensions of the source file, for aspect-ratio-locked resizing. */
  naturalWidth: number;
  naturalHeight: number;
  /** On-canvas display size, in mm. */
  width: number;
  height: number;
  /** Display opacity (0-1) so a reference image can be dimmed without
   * hiding it, to trace over more easily. */
  opacity: number;
}

export type Layer = GroupLayer | ShapeLayer | ImageLayer;

export interface PrintBed {
  name: string;
  width: number; // mm, X
  depth: number; // mm, Y
  height: number; // mm, Z (max print height)
}

export interface DocumentSettings {
  name: string;
  widthMM: number;
  heightMM: number;
  units: Units;
  bed: PrintBed;
}

export type ViewMode2D3D = "2d" | "3d";

/** One print-bed "plate," Bambu-Studio style — several can coexist in the
 * same project so objects that don't fit on one plate (or that print as
 * separate jobs) can live in their own space instead of a whole new file.
 * All plates share the project's single bed/printer; only which objects
 * are on which plate differs. */
export interface Plate {
  id: string;
  name: string;
}

/** Horizontal (left/centerH/right) and vertical (top/middleV/bottom) align
 * targets — a single selection aligns to the artboard, several align to
 * each other's combined bounding box. */
export type AlignMode = "left" | "centerH" | "right" | "top" | "middleV" | "bottom";

export interface ImportSummary {
  fileName: string;
  detectedWidth: number;
  detectedHeight: number;
  layerCount: number;
  pathCount: number;
  colors: string[];
  unsupportedCount: number;
}
