/**
 * Texture kit: photos you supply (albedo) plus maps the browser derived from them (normal,
 * roughness). Stored under data/textures/<id>/ and listed in the agent prompt when selected.
 */
import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { config } from "./config.js";

export interface KitTexture {
  id: string;
  name: string;
  tags: string[];
  /** real-world size of one tile in meters (width, height) */
  sizeM: [number, number];
  seamless: boolean;
  createdAt: string;
  files: { albedo: string; normal: string | null; roughness: string | null };
  note: string;
}

const dir = () => path.join(config.dataDir, "textures");
const indexFile = () => path.join(dir(), "index.json");
let cache: KitTexture[] | null = null;

function load(): KitTexture[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(indexFile(), "utf8")) as KitTexture[];
  } catch {
    cache = [];
  }
  return cache;
}
function save(): void {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(indexFile(), JSON.stringify(load(), null, 2));
}

export const textureStore = {
  list: (): KitTexture[] => load(),
  get: (id: string): KitTexture | undefined => load().find((t) => t.id === id),
  dir: (id: string): string => path.join(dir(), id),
  absPath: (t: KitTexture, which: keyof KitTexture["files"]): string | null => {
    const f = t.files[which];
    return f ? path.join(dir(), t.id, f) : null;
  },
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
export const texturesApi = express.Router();

texturesApi.get("/", (_req, res) => res.json(load()));

texturesApi.post(
  "/",
  upload.fields([{ name: "albedo", maxCount: 1 }, { name: "normal", maxCount: 1 }, { name: "roughness", maxCount: 1 }]),
  (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const albedo = files?.albedo?.[0];
    const name = String(req.body.name ?? "").trim();
    if (!albedo || !name) return res.status(400).json({ error: "name and albedo image are required" });
    const id = nanoid(8);
    const d = path.join(dir(), id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "albedo.png"), albedo.buffer);
    const normal = files?.normal?.[0], rough = files?.roughness?.[0];
    if (normal) fs.writeFileSync(path.join(d, "normal.png"), normal.buffer);
    if (rough) fs.writeFileSync(path.join(d, "roughness.png"), rough.buffer);
    const w = Number(req.body.widthM), h = Number(req.body.heightM);
    const t: KitTexture = {
      id,
      name,
      tags: String(req.body.tags ?? "").split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean),
      sizeM: [Number.isFinite(w) && w > 0 ? w : 1, Number.isFinite(h) && h > 0 ? h : 1],
      seamless: req.body.seamless === "true",
      createdAt: new Date().toISOString(),
      files: { albedo: "albedo.png", normal: normal ? "normal.png" : null, roughness: rough ? "roughness.png" : null },
      note: String(req.body.note ?? "").trim(),
    };
    load().push(t);
    save();
    res.status(201).json(t);
  },
);

texturesApi.patch("/:id", (req, res) => {
  const t = textureStore.get(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (typeof req.body.name === "string" && req.body.name.trim()) t.name = req.body.name.trim();
  if (Array.isArray(req.body.tags)) t.tags = req.body.tags.map(String);
  if (Array.isArray(req.body.sizeM) && req.body.sizeM.length === 2) t.sizeM = [Number(req.body.sizeM[0]) || 1, Number(req.body.sizeM[1]) || 1];
  if (typeof req.body.note === "string") t.note = req.body.note;
  save();
  res.json(t);
});

texturesApi.delete("/:id", (req, res) => {
  const t = textureStore.get(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  cache = load().filter((x) => x.id !== t.id);
  save();
  fs.rmSync(path.join(dir(), t.id), { recursive: true, force: true });
  res.json({ ok: true });
});

/** Text block for the agent prompt describing the selected kit textures. */
export function describeTextures(ids: string[]): string {
  const items = ids.map((id) => textureStore.get(id)).filter((t): t is KitTexture => !!t);
  if (!items.length) return "";
  const lines = ["Texture kit (use these image textures for the matching surfaces; load them with bpy.data.images.load and the kit_material recipe):"];
  for (const t of items) {
    const parts = [`- "${t.name}"`];
    if (t.tags.length) parts.push(`tags: ${t.tags.join(", ")}`);
    parts.push(`one tile = ${t.sizeM[0]} x ${t.sizeM[1]} m`, t.seamless ? "seamless" : "not seamless (avoid visible repeats; use larger scale or fewer repeats)");
    if (t.note) parts.push(`note: ${t.note}`);
    lines.push(parts.join(" · "));
    lines.push(`  albedo: ${textureStore.absPath(t, "albedo")}`);
    if (t.files.normal) lines.push(`  normal: ${textureStore.absPath(t, "normal")}`);
    if (t.files.roughness) lines.push(`  roughness: ${textureStore.absPath(t, "roughness")}`);
  }
  return lines.join("\n");
}
