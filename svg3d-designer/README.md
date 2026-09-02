# SVG → 3D Print Designer

A lightweight, browser-based tool for turning SVG artwork into simple, printable 3D
objects — "Figma simplicity for SVG-based 3D printing." Import an SVG, see it as
editable layers, give layers extrusion depth and color, preview in 3D, and export a
binary STL ready to open in a slicer like Bambu Studio.

This is a standalone app living alongside the unrelated `Ascensor.js` jQuery plugin
at the root of this repository; it does not depend on or modify that code.

## Status: Phase 1 MVP

Implemented:

- Figma-style three-panel shell: layer tree, 2D/3D canvas, properties inspector
- SVG import (drag-and-drop or file picker) preserving `<g>` group hierarchy as
  nested layers, with holes/compound paths resolved correctly (e.g. the letter "O")
- An import summary dialog (detected size, layer/path counts, colors, and any
  elements that couldn't be converted) with "import as layers" vs. "merge into one
  layer"
- Per-layer visibility, lock, rename, duplicate, delete, and drag-to-reorder
  (including into/out of groups)
- 2D canvas: pan, zoom, click/shift-click select, drag-to-move, bounding-box outline
- Per-layer transform (position, rotation, uniform/non-uniform scale), color, and
  independent extrusion depth — all editable from the inspector and reflected
  immediately in both the 2D and 3D views
- 3D viewport (orbit/pan/zoom, reset camera) with a configurable print bed
  (Bambu-sized presets or custom dimensions)
- Binary STL export — exactly what's shown in the 3D view is what gets exported,
  including live edits

Not yet implemented (by design — see the project's phased roadmap): bevels, Z
positioning/stacking, 3MF/OBJ export, print-material mapping, printability
validation, undo/redo, autosave, native project save/load, text, arrays, and the
keychain-hole helper.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL, drag an `.svg` file onto the canvas (or use
**Import SVG** in the toolbar), and use **Export STL** once you're happy with the
result. A sample file is included at `public/sample-badge.svg`.

## Architecture

- `src/types.ts` — the scene model's type definitions (the single source of truth
  the rest of the app derives from)
- `src/state/store.ts` — the Zustand store: document settings, layer tree,
  selection, view state, and all mutating actions
- `src/state/sceneUtils.ts` — pure tree/transform helpers (world transforms,
  bounding boxes, visibility/lock inheritance)
- `src/svg/parse.ts` — the SVG engine: parses SVG text into the layer tree using
  three.js's `SVGLoader`, normalizing units to millimeters
- `src/geometry/extrude.ts` — the geometry engine: turns stored 2D contours into
  extruded `THREE.BufferGeometry` and assembles the full 3D scene graph
- `src/export/stl.ts` — the export engine: serializes the assembled scene to a
  binary STL and triggers a download
- `src/components/` — UI layer (toolbar, layer panel, inspector, 2D/3D canvases,
  import dialog) — all read from and write to the store, never generate geometry
  themselves
