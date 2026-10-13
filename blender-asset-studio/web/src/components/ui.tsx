import type { ReactNode } from "react";

/** Segmented control: one pill highlights the active option. Titles carry the explanation. */
export function Seg<T extends string>({ value, options, onChange, size }: { value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void; size?: "sm" }) {
  return (
    <div className={"seg" + (size === "sm" ? " sm" : "")} role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? "on" : ""} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Row with a label on the left and a switch on the right. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <label className="toggle-row" title={hint}>
      <span>{label}</span>
      <span className={"switch" + (checked ? " on" : "")}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <i />
      </span>
    </label>
  );
}

export function SectionLabel({ children, count, right }: { children: ReactNode; count?: number | string; right?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}{count !== undefined && <em className="pill">{count}</em>}</span>
      {right}
    </div>
  );
}
