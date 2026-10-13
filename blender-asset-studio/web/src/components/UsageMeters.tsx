import type { Usage, UsageWindow } from "../types";

function Meter({ label, w }: { label: string; w: UsageWindow | null }) {
  if (!w) return <span className="meter"><span className="meter-label">{label}</span><span className="muted small">–</span></span>;
  const reset = new Date(w.resetsAt * 1000);
  const expired = w.resetsAt > 0 && reset.getTime() <= Date.now();
  // The value is a snapshot from the last run. Once the window's reset time has passed the
  // window is empty again, so show 0% until the next run reports a fresh number.
  const pct = expired ? 0 : Math.round(w.utilization * 100);
  const hours = Math.max(0, (reset.getTime() - Date.now()) / 3600000);
  const resetText = expired ? "window reset · updates after the next run" : hours < 48 ? `resets in ${Math.ceil(hours)}h` : `resets ${reset.toLocaleDateString(undefined, { weekday: "short" })}`;
  const tone = pct >= 90 ? "hot" : pct >= 70 ? "warm" : "";
  return (
    <span className={"meter " + tone} title={`${label} window: ${pct}% used · ${resetText}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <b>{pct}%</b>{expired && <span className="muted small">reset</span>}
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
