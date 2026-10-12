import type { Effort, Materials } from "./config.js";

export type VersionStatus = "queued" | "running" | "done" | "failed";

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

export interface Version {
  n: number;
  status: VersionStatus;
  prompt: string;
  changes: Change[];
  scopedPart: string | null;
  requestedModel: string;
  materials: Materials;
  /** ids of texture-kit items the agent must use */
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
  files: {
    glb: string | null;
    views: string[];
    blend: string | null;
    script: string | null;
    reference: string | null;
    references: string[];
  };
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

export interface LogLine {
  t: string;
  kind: "info" | "tool" | "text" | "result" | "error";
  text: string;
}
