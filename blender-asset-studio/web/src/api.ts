import type { Asset, AssetSummary, Health, LogLine, Version } from "./types";

async function j<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `${r.status} ${r.statusText}`);
  return body as T;
}

export const api = {
  health: () => fetch("/api/health").then((r) => j<Health>(r)),
  listAssets: () => fetch("/api/assets").then((r) => j<AssetSummary[]>(r)),
  getAsset: (id: string) => fetch(`/api/assets/${id}`).then((r) => j<Asset>(r)),
  createAsset: (form: FormData) => fetch("/api/assets", { method: "POST", body: form }).then((r) => j<Asset>(r)),
  patchAsset: (id: string, patch: Partial<Pick<Asset, "name" | "tags" | "currentVersion">>) =>
    fetch(`/api/assets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) => j<Asset>(r)),
  deleteAsset: (id: string) => fetch(`/api/assets/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  iterate: (id: string, form: FormData) => fetch(`/api/assets/${id}/versions`, { method: "POST", body: form }).then((r) => j<Asset>(r)),
  cancel: (id: string, n: number) => fetch(`/api/assets/${id}/versions/${n}/cancel`, { method: "POST" }).then((r) => j<{ ok: boolean }>(r)),
  log: (id: string, n: number) => fetch(`/api/assets/${id}/versions/${n}/log`).then((r) => j<LogLine[]>(r)),
  load: (id: string, n: number) => fetch(`/api/assets/${id}/versions/${n}/load`, { method: "POST" }).then((r) => j<{ ok: boolean }>(r)),
  tweak: (id: string, n: number, body: Record<string, unknown>) =>
    fetch(`/api/assets/${id}/versions/${n}/tweak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => j<Version>(r)),
  render: (id: string, n: number) => fetch(`/api/assets/${id}/versions/${n}/render`, { method: "POST" }).then((r) => j<Version>(r)),
  fileUrl: (id: string, n: number, rel: string) => `/files/${id}/v${n}/${rel}`,
};
