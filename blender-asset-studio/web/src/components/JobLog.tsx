import { useEffect, useRef, useState } from "react";
import type { LogLine } from "../types";

export default function JobLog({ assetId, n, live }: { assetId: string; n: number; live: boolean }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [open, setOpen] = useState(live);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    const es = new EventSource(`/api/assets/${assetId}/versions/${n}/events`);
    es.onopen = () => setLines([]); // the server replays the full log on every (re)connect
    es.onmessage = (ev) => setLines((prev) => [...prev, JSON.parse(ev.data)]);
    return () => es.close();
  }, [assetId, n]);

  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [lines, open]);

  return (
    <section className="panel">
      <div className="panel-head clickable" onClick={() => setOpen(!open)}>
        <span>{open ? "▾" : "▸"} History · {lines.length}</span>
        {live && <span className="tag running">live</span>}
      </div>
      {open && (
        <div className="log">
          {lines.map((l, i) => (
            <div key={i} className={"log-line " + l.kind}>
              <span className="muted">{new Date(l.t).toLocaleTimeString()}</span> {l.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
