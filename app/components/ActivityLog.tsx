"use client";

import { useEffect, useRef } from "react";
import type { CaseEvent } from "@/lib/types";
import { clockBogota, Source } from "./ui";

const ICON: Record<CaseEvent["kind"], React.ReactNode> = {
  tool: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M10.5 2.5a3 3 0 0 0-3.9 3.9L2.5 10.5l3 3 4.1-4.1a3 3 0 0 0 3.9-3.9l-1.9 1.9-2-1-1-2 1.9-1.9Z" />
    </svg>
  ),
  safety: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 1.8 14.5 13H1.5L8 1.8Z" />
      <path d="M8 6.3v3.2M8 11.4v.1" />
    </svg>
  ),
  notify: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M14 2 1.8 7l4.7 1.8L8.3 14 14 2Z" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  ),
  insight: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M2 9c1.5 0 2-3 3-3s1.5 5 3 5 1.5-7 3-7 1.5 5 3 5" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M5.5 2.5h-2a1 1 0 0 0-1 1c0 5.5 4.5 10 10 10a1 1 0 0 0 1-1v-2L11 9.5l-1.5 1.2a7 7 0 0 1-4.2-4.2L6.5 5 5.5 2.5Z" />
    </svg>
  ),
};

export function ActivityLog({
  events,
  maxHeight,
  emptyText = "Waiting for the agent's first action.",
}: {
  events: CaseEvent[];
  maxHeight?: string;
  emptyText?: string;
}) {
  const seen = useRef<Set<string> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = seen.current === null;
  if (first) seen.current = new Set(events.map((e) => e.id));
  const fresh = new Set(events.filter((e) => !seen.current!.has(e.id)).map((e) => e.id));

  useEffect(() => {
    for (const e of events) seen.current!.add(e.id);
    if (fresh.size && box.current) box.current.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  });

  return (
    <div ref={box} style={maxHeight ? { maxHeight, overflowY: "auto", paddingRight: 4 } : undefined}>
      <ol className="log" aria-live="polite">
        {events.length === 0 && <li className="log-empty">{emptyText}</li>}
        {events.map((e) => (
          <li key={e.id} className={`log-item${fresh.has(e.id) ? " enter" : ""}`} data-tone={e.tone}>
            <time className="log-time" suppressHydrationWarning>
              {clockBogota(e.at, true)}
            </time>
            <span className="log-dot" aria-hidden="true">
              {ICON[e.kind]}
            </span>
            <div className="log-body">
              <div className="log-title">
                {e.title}
                {e.tool && <code>{e.tool}</code>}
                {e.kind !== "insight" && <Source s={e.source} />}
              </div>
              {e.detail && <div className="log-detail">{e.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
