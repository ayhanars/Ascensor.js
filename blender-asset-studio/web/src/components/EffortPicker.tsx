import type { Effort, Health } from "../types";
import { Seg } from "./ui";

const ORDER: Effort[] = ["quick", "standard", "thorough", "max"];

export default function EffortPicker({ value, onChange, efforts }: { value: Effort; onChange: (e: Effort) => void; efforts: Health["efforts"] | null }) {
  return (
    <Seg
      value={value}
      onChange={onChange}
      options={ORDER.map((e) => ({ id: e, label: e[0].toUpperCase() + e.slice(1), title: efforts?.[e]?.blurb }))}
    />
  );
}
