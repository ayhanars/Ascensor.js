import type { HeightMapSettings } from "../types";

/** Grid resolution the source image is downsampled to. Fine enough to
 * carry real detail (a logo, simple text, a soft photo relief) without
 * the sample grid itself — stored inline in the project JSON — getting
 * unreasonably large; the actual surface detail is bounded by print
 * resolution long before it's bounded by this anyway. */
const SAMPLE_GRID_SIZE = 96;

/** Longest edge of the thumbnail kept alongside the samples purely for
 * the Inspector to display — small enough to stay cheap to store twice
 * per project (once for each face that might use a height map). */
const THUMBNAIL_MAX_SIZE = 96;

/**
 * Bilinearly samples a [0,1]-valued grid at fractional row-major
 * coordinates (u,v both in [0,1], u = column fraction, v = row fraction).
 * Used both by geometry building (per-vertex, arbitrarily many times) and
 * is intentionally allocation-free.
 */
export function sampleHeightMapBilinear(samples: number[][], u: number, v: number): number {
  const rows = samples.length;
  if (rows === 0) return 0.5;
  const cols = samples[0].length;
  if (cols === 0) return 0.5;

  const clampedU = Math.min(1, Math.max(0, u));
  const clampedV = Math.min(1, Math.max(0, v));

  const fx = clampedU * (cols - 1);
  const fy = clampedV * (rows - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const top = samples[y0][x0] * (1 - tx) + samples[y0][x1] * tx;
  const bottom = samples[y1][x0] * (1 - tx) + samples[y1][x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Maps a raw [0,1] sample to a signed mm displacement: 0.5 (mid-gray) is
 * always zero displacement, regardless of strength, so re-centering an
 * image or nudging its exposure doesn't silently shift the whole surface
 * up or down. */
export function heightMapDisplacement(settings: HeightMapSettings, u: number, v: number): number {
  const raw = sampleHeightMapBilinear(settings.samples, u, v);
  const centered = settings.invert ? 1 - raw : raw;
  return (centered - 0.5) * 2 * settings.strength;
}

/**
 * Reads an image file, downsamples it to a small grayscale grid via an
 * offscreen canvas, and produces a ready-to-store `HeightMapSettings`
 * (strength/invert left at sensible defaults — the caller/UI owns tuning
 * those afterward). All the async decoding happens here, once, at upload
 * time; nothing downstream of this (geometry building, project save/load)
 * ever touches the original image again.
 */
export function buildHeightMapFromImageFile(file: File, strength: number): Promise<HeightMapSettings> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode the image file."));
      img.onload = () => {
        try {
          resolve({
            samples: sampleImageToGrid(img, SAMPLE_GRID_SIZE),
            strength,
            invert: false,
            previewDataUrl: renderThumbnail(img, THUMBNAIL_MAX_SIZE),
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Could not process the image file."));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function sampleImageToGrid(img: HTMLImageElement, gridSize: number): number[][] {
  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  // Stretches the source image to fill the grid regardless of its own
  // aspect ratio — matching how the grid itself gets stretched over the
  // shape's own bounding box at geometry-build time, so a square source
  // image maps onto a non-square shape the same intuitive way a texture
  // would.
  ctx.drawImage(img, 0, 0, gridSize, gridSize);
  const { data } = ctx.getImageData(0, 0, gridSize, gridSize);

  const samples: number[][] = [];
  for (let row = 0; row < gridSize; row++) {
    const rowSamples: number[] = [];
    for (let col = 0; col < gridSize; col++) {
      const i = (row * gridSize + col) * 4;
      // Standard luma weighting — matches how any other "convert to
      // grayscale" tool would read the same source image, so the result
      // matches what the user sees when they look at the file.
      const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      rowSamples.push(luma);
    }
    samples.push(rowSamples);
  }
  return samples;
}

function renderThumbnail(img: HTMLImageElement, maxSize: number): string {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
