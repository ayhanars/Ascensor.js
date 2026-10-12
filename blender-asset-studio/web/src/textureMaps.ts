/**
 * Derives a small PBR set from one photo in the browser: albedo (optionally mirror-tiled so it
 * repeats without seams), a normal map from luminance gradients, and a roughness map from
 * inverted, softened luminance. Good enough for stucco, plaster, wood, tiles and fabric.
 */
export interface DerivedMaps {
  albedo: Blob;
  normal: Blob;
  roughness: Blob;
  preview: string; // object URL of the albedo
  width: number;
  height: number;
}

function toBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

export async function deriveMaps(file: File, opts: { mirrorTile: boolean; maxSize?: number; strength?: number }): Promise<DerivedMaps> {
  const maxSize = opts.maxSize ?? 2048;
  const strength = opts.strength ?? 2.0;
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxSize / Math.max(w, h) / (opts.mirrorTile ? 2 : 1));
  w = Math.max(8, Math.round(w * scale));
  h = Math.max(8, Math.round(h * scale));

  // albedo
  const alb = document.createElement("canvas");
  alb.width = opts.mirrorTile ? w * 2 : w;
  alb.height = opts.mirrorTile ? h * 2 : h;
  const actx = alb.getContext("2d")!;
  actx.drawImage(bmp, 0, 0, w, h);
  if (opts.mirrorTile) {
    actx.save(); actx.translate(w * 2, 0); actx.scale(-1, 1); actx.drawImage(bmp, 0, 0, w, h); actx.restore();
    actx.save(); actx.translate(0, h * 2); actx.scale(1, -1); actx.drawImage(bmp, 0, 0, w, h); actx.restore();
    actx.save(); actx.translate(w * 2, h * 2); actx.scale(-1, -1); actx.drawImage(bmp, 0, 0, w, h); actx.restore();
  }
  bmp.close();
  const W = alb.width, H = alb.height;
  const { data } = actx.getImageData(0, 0, W, H);

  // luminance, lightly blurred (3x3) for the height field
  const luma = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) luma[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  const blur = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += luma[((y + dy + H) % H) * W + ((x + dx + W) % W)];
      blur[y * W + x] = s / 9;
    }

  // normal map (tangent space, OpenGL convention, which Blender uses)
  const ncv = document.createElement("canvas");
  ncv.width = W;
  ncv.height = H;
  const nctx = ncv.getContext("2d")!;
  const nimg = nctx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = blur[y * W + ((x - 1 + W) % W)], r = blur[y * W + ((x + 1) % W)];
      const u = blur[((y - 1 + H) % H) * W + x], d = blur[((y + 1) % H) * W + x];
      const nx = -(r - l) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * W + x) * 4;
      nimg.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  nctx.putImageData(nimg, 0, 0);

  // roughness: darker pits rougher, lifted into a 0.45..0.95 band
  const rcv = document.createElement("canvas");
  rcv.width = W;
  rcv.height = H;
  const rctx = rcv.getContext("2d")!;
  const rimg = rctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = (0.45 + (1 - blur[i]) * 0.5) * 255;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  rctx.putImageData(rimg, 0, 0);

  const [albedo, normal, roughness] = await Promise.all([toBlob(alb), toBlob(ncv), toBlob(rcv)]);
  return { albedo, normal, roughness, preview: URL.createObjectURL(albedo), width: W, height: H };
}
