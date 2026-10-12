import type { Effort, Health } from "../types";

const ORDER: Effort[] = ["quick", "standard", "thorough", "max"];

export default function EffortPicker({ value, onChange, efforts }: { value: Effort; onChange: (e: Effort) => void; efforts: Health["efforts"] | null }) {
  return (
    <div>
      <div className="seg">
        {ORDER.map((e) => (
          <button key={e} className={e === value ? "on" : ""} onClick={() => onChange(e)} type="button">
            {e[0].toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>
      <p className="muted small">{efforts?.[value]?.blurb ?? ""}</p>
    </div>
  );
}
