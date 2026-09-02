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

export interface Transform2D {
  x: number; // mm, position of the layer origin on the document
  y: number; // mm
  /** Height above the print bed the layer's extrusion starts at, in mm. Never negative. */
  z: number;
  rotation: number; // degrees, around Z
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
}

export type Layer = GroupLayer | ShapeLayer;

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

export interface ImportSummary {
  fileName: string;
  detectedWidth: number;
  detectedHeight: number;
  layerCount: number;
  pathCount: number;
  colors: string[];
  unsupportedCount: number;
}
