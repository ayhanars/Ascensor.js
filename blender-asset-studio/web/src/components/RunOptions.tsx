import type { Detail, Effort, Health, KitTexture, Materials } from "../types";
import { api } from "../api";
import EffortPicker from "./EffortPicker";
import { Seg, SectionLabel } from "./ui";

interface Props {
  health: Health | null;
  effort: Effort;
  onEffort: (e: Effort) => void;
  model: string;
  onModel: (m: string) => void;
  materials: Materials;
  onMaterials: (m: Materials) => void;
  detail: Detail;
  onDetail: (d: Detail) => void;
  kit: KitTexture[];
  textures: string[];
  onTextures: (ids: string[]) => void;
}

const DETAIL_FALLBACK: Record<Detail, { label: string; maxTriangles: number; blurb: string }> = {
  draft: { label: "Draft", maxTriangles: 5000, blurb: "" },
  game: { label: "Game", maxTriangles: 60000, blurb: "" },
  hero: { label: "Hero", maxTriangles: 300000, blurb: "" },
};
const fmtTris = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Effort, detail, model, materials and kit textures, shared by the new-asset form and the iterate panel. */
export default function RunOptions({ health, effort, onEffort, model, onModel, materials, onMaterials, detail, onDetail, kit, textures, onTextures }: Props) {
  const details = health?.details ?? DETAIL_FALLBACK;
  // fallback list so the picker is usable even before the server answers
  const models = health?.models ?? [
    { id: "", label: "Default", blurb: "" },
    { id: "fable", label: "Fable", blurb: "" },
    { id: "opus", label: "Opus", blurb: "" },
    { id: "sonnet", label: "Sonnet", blurb: "" },
    { id: "haiku", label: "Haiku", blurb: "" },
  ];
  const mats = health?.materials;
  const toggle = (id: string) => onTextures(textures.includes(id) ? textures.filter((x) => x !== id) : [...textures, id]);
  return (
    <>
      <SectionLabel>Effort</SectionLabel>
      <EffortPicker value={effort} onChange={onEffort} efforts={health?.efforts ?? null} />
      <p className="hint">{health?.efforts?.[effort]?.blurb}</p>

      <SectionLabel>Detail</SectionLabel>
      <Seg
        value={detail}
        onChange={onDetail}
        options={(["draft", "game", "hero"] as Detail[]).map((d) => ({ id: d, label: `${details[d].label} · ${fmtTris(details[d].maxTriangles)}`, title: details[d].blurb }))}
      />
      <p className="hint">{details[detail].blurb || `Up to ${fmtTris(details[detail].maxTriangles)} triangles for the whole asset.`}</p>

      <SectionLabel>Model</SectionLabel>
      <Seg value={model} onChange={onModel} options={models.map((m) => ({ id: m.id, label: m.label, title: m.blurb }))} />

      <SectionLabel>Materials</SectionLabel>
      <Seg
        value={materials}
        onChange={onMaterials}
        options={(["flat", "procedural", "pbr"] as Materials[]).map((m) => ({ id: m, label: mats?.[m]?.label ?? m, title: mats?.[m]?.blurb }))}
      />
      {materials !== "flat" && <p className="hint">{mats?.[materials]?.blurb}</p>}

      {kit.length > 0 && (
        <>
          <SectionLabel count={textures.length || undefined}>Texture kit</SectionLabel>
          <div className="kit-row">
            {kit.map((t) => (
              <button key={t.id} type="button" className={"kit-chip" + (textures.includes(t.id) ? " on" : "")} onClick={() => toggle(t.id)} title={`${t.sizeM[0]} × ${t.sizeM[1]} m · ${t.tags.join(", ")}`}>
                <img src={api.textureUrl(t, "albedo")!} alt="" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
