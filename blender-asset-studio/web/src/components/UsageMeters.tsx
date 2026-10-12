import type { Usage, UsageWindow } from "../types";

function Meter({ label, w }: { label: string; w: UsageWindow | null }) {
  if (!w) return <span className="meter"><span className="meter-label">{label}</span><span className="muted small">–</span></span>;
  const pct = Math.round(w.utilization * 100);
  const reset = new Date(w.resetsAt * 1000);
  const hours = Math.max(0, (reset.getTime() - Date.now()) / 3600000);
  const resetText = hours < 48 ? `resets in ${Math.ceil(hours)}h` : `resets ${reset.toLocaleDateString(undefined, { weekday: "short" })}`;
  const tone = pct >= 90 ? "hot" : pct >= 70 ? "warm" : "";
  return (
    <span className={"meter " + tone} title={`${label} window: ${pct}% used · ${resetText}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <b>{pct}%</b>
    </span>
  );
}

/** Subscription limits as the CLI reports them after each run. Nothing here is money. */
export default function UsageMeters({ usage }: { usage: Usage | null }) {
  return (
    <span className="meters" title={usage ? `Subscription usage, updated ${new Date(usage.updatedAt).toLocaleTimeString()}` : "Usage is reported by Claude after the first run"}>
      <Meter label="5h" w={usage?.fiveHour ?? null} />
      <Meter label="7d" w={usage?.sevenDay ?? null} />
    </span>
  );
}
