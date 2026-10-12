import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Asset, Version } from "./types.js";

const indexFile = () => path.join(config.dataDir, "assets.json");

let cache: Asset[] | null = null;

function load(): Asset[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(indexFile(), "utf8")) as Asset[];
  } catch {
    cache = [];
  }
  return cache;
}

function save(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = indexFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2));
  fs.renameSync(tmp, indexFile());
}

export const store = {
  list(): Asset[] {
    return load();
  },
  get(id: string): Asset | undefined {
    return load().find((a) => a.id === id);
  },
  add(asset: Asset): void {
    load().push(asset);
    save();
  },
  remove(id: string): void {
    cache = load().filter((a) => a.id !== id);
    save();
  },
  update(id: string, fn: (a: Asset) => void): Asset {
    const a = this.get(id);
    if (!a) throw new Error(`asset ${id} not found`);
    fn(a);
    a.updatedAt = new Date().toISOString();
    save();
    return a;
  },
  updateVersion(id: string, n: number, fn: (v: Version) => void): Version {
    let out: Version | undefined;
    this.update(id, (a) => {
      const v = a.versions.find((x) => x.n === n);
      if (!v) throw new Error(`version ${n} of ${id} not found`);
      fn(v);
      out = v;
    });
    return out!;
  },
  assetDir(id: string): string {
    return path.join(config.dataDir, "assets", id);
  },
  versionDir(id: string, n: number): string {
    return path.join(this.assetDir(id), `v${n}`);
  },
};
