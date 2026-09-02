import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { nanoid } from "nanoid";
import type {
  GroupLayer,
  ImportSummary,
  Layer,
  Point2,
  ShapeLayer,
  ShapeRegion,
} from "../types";
import { IDENTITY_TRANSFORM } from "../state/sceneUtils";

const CURVE_SEGMENTS = 16;
const PX_TO_MM = 25.4 / 96;

// Tags SVGLoader turns into ShapePaths we can extrude.
const SHAPE_TAGS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);
const GROUP_TAGS = new Set(["g", "svg", "a"]);
// Present in real-world files but not (yet) convertible to printable geometry.
const KNOWN_UNSUPPORTED_TAGS = new Set(["text", "image", "use", "tspan"]);
// Structural/non-visual — safe to skip without warning.
const IGNORED_TAGS = new Set([
  "defs", "metadata", "style", "title", "desc", "clippath", "mask",
  "symbol", "filter", "lineargradient", "radialgradient", "pattern", "namedview",
]);

function parseLengthMM(raw: string | null, fallbackPx: number): number {
  if (!raw) return fallbackPx * PX_TO_MM;
  const match = /^([\d.eE+-]+)\s*(px|mm|cm|in|pt|pc|%)?$/.exec(raw.trim());
  if (!match) return fallbackPx * PX_TO_MM;
  const value = parseFloat(match[1]);
  const unit = match[2] ?? "px";
  switch (unit) {
    case "mm": return value;
    case "cm": return value * 10;
    case "in": return value * 25.4;
    case "pt": return value * (25.4 / 72);
    case "pc": return value * (25.4 / 6);
    default: return value * PX_TO_MM; // px or unitless
  }
}

function elementName(el: Element, fallback: string): string {
  const label = el.getAttribute("inkscape:label");
  if (label) return label;
  const id = el.getAttribute("id");
  if (id) return id;
  return fallback;
}

function toPoint2(v: { x: number; y: number }, scale: number): Point2 {
  return { x: v.x * scale, y: v.y * scale };
}

export interface ParsedScene {
  layers: Record<string, Layer>;
  rootIds: string[];
  widthMM: number;
  heightMM: number;
  summary: ImportSummary;
}

interface SvgStyle {
  fill?: string;
  fillOpacity?: number;
  fillRule?: string;
  visibility?: string;
  opacity?: number;
}

function getStyle(shapePath: { userData?: Record<string, unknown> }): SvgStyle {
  return (shapePath.userData?.style as SvgStyle | undefined) ?? {};
}

export function parseSvgToScene(svgText: string, fileName: string): ParsedScene {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);
  // @types/three declares `xml` as XMLDocument, but SVGLoader (r185) actually
  // sets it to the root <svg> element (`xml.documentElement`) — verified in
  // node_modules/three/examples/jsm/loaders/SVGLoader.js.
  const svgRoot = data.xml as unknown as Element;

  const viewBoxAttr = svgRoot.getAttribute("viewBox");
  const widthAttr = svgRoot.getAttribute("width");
  const heightAttr = svgRoot.getAttribute("height");

  let vbWidth: number;
  let vbHeight: number;
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    vbWidth = parts[2];
    vbHeight = parts[3];
  } else {
    vbWidth = widthAttr ? parseFloat(widthAttr) : 100;
    vbHeight = heightAttr ? parseFloat(heightAttr) : 100;
  }

  const widthMM = parseLengthMM(widthAttr, vbWidth);
  const heightMM = parseLengthMM(heightAttr, vbHeight);
  // Factor that converts a coordinate in the SVG's user-unit space (as used
  // in `d="..."`, matching the viewBox) into millimeters.
  const scale = vbWidth > 0 ? widthMM / vbWidth : PX_TO_MM;

  const layers: Record<string, Layer> = {};
  const colorsSeen = new Set<string>();
  let pathCount = 0;
  let unsupportedCount = 0;
  let groupCounter = 0;
  let pathCounter = 0;

  function buildRegionsForNode(node: Element): ShapeRegion[] {
    const shapePath = data.paths.find((p) => p.userData?.node === node);
    if (!shapePath) return [];
    const style = getStyle(shapePath);
    if (style.visibility === "hidden") return [];

    const fill = style.fill;
    if (fill === undefined || fill === "none") {
      // Stroke-only artwork isn't (yet) converted to printable geometry.
      unsupportedCount++;
      return [];
    }

    if (typeof fill === "string" && /^#|^rgb/i.test(fill)) colorsSeen.add(fill);

    const shapes = shapePath.toShapes();
    const regions: ShapeRegion[] = [];
    for (const shape of shapes) {
      const extracted = shape.extractPoints(CURVE_SEGMENTS);
      if (extracted.shape.length < 3) continue;
      regions.push({
        outer: { points: extracted.shape.map((v) => toPoint2(v, scale)) },
        holes: extracted.holes
          .filter((h) => h.length >= 3)
          .map((h) => ({ points: h.map((v) => toPoint2(v, scale)) })),
      });
    }
    return regions;
  }

  function buildLayer(el: Element, parentId: string | null): string | null {
    const tag = el.tagName.toLowerCase();

    if (GROUP_TAGS.has(tag)) {
      const id = nanoid(8);
      const childIds: string[] = [];
      for (const child of Array.from(el.children)) {
        const childId = buildLayer(child, id);
        if (childId) childIds.push(childId);
      }
      if (childIds.length === 0) return null; // drop empty/unsupported-only groups
      if (tag === "svg") {
        // The root <svg> isn't a real group — splice its children up one level.
        return null;
      }
      groupCounter++;
      const group: GroupLayer = {
        id,
        type: "group",
        name: elementName(el, `Group ${groupCounter}`),
        visible: true,
        locked: false,
        color: "#888888",
        transform: { ...IDENTITY_TRANSFORM },
        parentId,
        children: childIds,
      };
      layers[id] = group;
      return id;
    }

    if (SHAPE_TAGS.has(tag)) {
      const regions = buildRegionsForNode(el);
      if (regions.length === 0) return null;
      pathCount++;
      pathCounter++;
      const foundPath = data.paths.find((p) => p.userData?.node === el);
      const style: SvgStyle = foundPath ? getStyle(foundPath) : {};
      const id = nanoid(8);
      const layer: ShapeLayer = {
        id,
        type: "shape",
        name: elementName(el, `Path ${pathCounter}`),
        visible: true,
        locked: false,
        color: typeof style.fill === "string" ? style.fill : "#888888",
        transform: { ...IDENTITY_TRANSFORM },
        parentId,
        regions,
        extrusionDepth: 1.2,
      };
      layers[id] = layer;
      return id;
    }

    if (KNOWN_UNSUPPORTED_TAGS.has(tag)) {
      unsupportedCount++;
      return null;
    }
    if (IGNORED_TAGS.has(tag)) return null;

    // Unknown tag: recurse into children in case it wraps supported content.
    const childIds: string[] = [];
    for (const child of Array.from(el.children)) {
      const childId = buildLayer(child, parentId);
      if (childId) childIds.push(childId);
    }
    return null; // its children were already attached to parentId individually
  }

  // The root is <svg>; walk its direct children as the top level. A child
  // may itself attach grandchildren directly to root (unknown wrapper tags
  // are transparent), so collect root members by scanning parentId after.
  for (const child of Array.from(svgRoot.children)) {
    buildLayer(child, null);
  }
  const rootIds: string[] = Object.values(layers)
    .filter((l) => l.parentId === null)
    .map((l) => l.id);

  const summary: ImportSummary = {
    fileName,
    detectedWidth: widthMM,
    detectedHeight: heightMM,
    layerCount: rootIds.length,
    pathCount,
    colors: Array.from(colorsSeen),
    unsupportedCount,
  };

  return { layers, rootIds, widthMM, heightMM, summary };
}

/**
 * Collapses a parsed scene's whole layer tree into a single flat shape
 * layer (all regions combined, group structure discarded) — the "merge
 * into one layer" import option.
 */
export function mergeSceneIntoSingleLayer(scene: ParsedScene, name: string): {
  layers: Record<string, Layer>;
  rootIds: string[];
} {
  const regions: ShapeRegion[] = [];
  let color = "#888888";
  let firstColorSet = false;

  function walk(id: string) {
    const layer = scene.layers[id];
    if (!layer) return;
    if (layer.type === "shape") {
      regions.push(...layer.regions);
      if (!firstColorSet) {
        color = layer.color;
        firstColorSet = true;
      }
    } else {
      layer.children.forEach(walk);
    }
  }
  scene.rootIds.forEach(walk);

  const id = nanoid(8);
  const merged: ShapeLayer = {
    id,
    type: "shape",
    name,
    visible: true,
    locked: false,
    color,
    transform: { ...IDENTITY_TRANSFORM },
    parentId: null,
    regions,
    extrusionDepth: 1.2,
  };

  return { layers: { [id]: merged }, rootIds: [id] };
}
