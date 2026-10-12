import { useEffect, useRef, useState } from "react";
import type { LogLine } from "../types";

export default function JobLog({ lines, live }: { lines: LogLine[]; live: boolean }) {
  const [open, setOpen] = useState(live);
  const endRef = useRef<HTMLDivElement>(null);

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
