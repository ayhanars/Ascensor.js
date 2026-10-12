import type { Effort, Health, Materials } from "../types";
import EffortPicker from "./EffortPicker";

interface Props {
  health: Health | null;
  effort: Effort;
  onEffort: (e: Effort) => void;
  model: string;
  onModel: (m: string) => void;
  materials: Materials;
  onMaterials: (m: Materials) => void;
}

/** Effort, model and materials, shared by the new-asset form and the iterate panel. */
export default function RunOptions({ health, effort, onEffort, model, onModel, materials, onMaterials }: Props) {
  const models = health?.models ?? [{ id: "", label: "Default", blurb: "" }];
  const mats = health?.materials;
  return (
    <>
      <label>Effort</label>
      <EffortPicker value={effort} onChange={onEffort} efforts={health?.efforts ?? null} />
      <div className="two-col">
        <label>
          Model
          <select value={model} onChange={(e) => onModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <span className="muted small">{models.find((m) => m.id === model)?.blurb}</span>
        </label>
        <label>
          Materials
          <select value={materials} onChange={(e) => onMaterials(e.target.value as Materials)}>
            {(["flat", "procedural", "pbr"] as Materials[]).map((m) => (
              <option key={m} value={m}>{mats?.[m]?.label ?? m}</option>
            ))}
          </select>
          <span className="muted small">{mats?.[materials]?.blurb}</span>
        </label>
      </div>
    </>
  );
}
