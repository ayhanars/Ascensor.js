export type Effort = "quick" | "standard" | "thorough" | "max";
export type VersionStatus = "queued" | "running" | "done" | "failed";
export type Materials = "flat" | "procedural" | "pbr";

export interface Change {
  text: string;
  part: string | null;
}

export interface UsageWindow {
  utilization: number;
  resetsAt: number;
}

export interface Usage {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  status: string | null;
  updatedAt: string;
}

export interface PartInfo {
  name: string;
  type: string;
  location: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions: [number, number, number];
  color: [number, number, number, number] | null;
  material: string | null;
  triangles: number;
}

export interface Tweak {
  at: string;
  object: string;
  location?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: [number, number, number];
}

export interface KitTexture {
  id: string;
  name: string;
  tags: string[];
  sizeM: [number, number];
  seamless: boolean;
  createdAt: string;
  files: { albedo: string; normal: string | null; roughness: string | null };
  note: string;
}

export interface Version {
  n: number;
  status: VersionStatus;
  prompt: string;
  changes: Change[];
  scopedPart: string | null;
  requestedModel: string;
  materials: Materials;
  textures: string[];
  parent: number | null;
  fromScratch: boolean;
  effort: Effort;
  hasReference: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  costUsd: number | null;
  turns: number | null;
  model: string | null;
  summary: string | null;
  error: string | null;
  files: { glb: string | null; views: string[]; blend: string | null; script: string | null; reference: string | null; references: string[] };
  parts: PartInfo[];
  tweaks: Tweak[];
  triangles: number | null;
}

export interface Asset {
  id: string;
  name: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  currentVersion: number | null;
  versions: Version[];
}

export interface AssetSummary {
  id: string;
  name: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  currentVersion: number | null;
  versionCount: number;
  status: VersionStatus;
  thumb: string | null;
}

export interface LogLine {
  t: string;
  kind: "info" | "tool" | "text" | "result" | "error";
  text: string;
}

export interface Health {
  ok: boolean;
  blender: { ok: boolean; detail: string };
  queue: { active: string | null; queued: string[] };
  efforts: Record<Effort, { passes: string; maxTurns: number; blurb: string }>;
  models: { id: string; label: string; blurb: string }[];
  materials: Record<Materials, { label: string; blurb: string }>;
  usage: Usage | null;
  model: string;
}
