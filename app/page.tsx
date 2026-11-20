"use client";

import Link from "next/link";
import { useState } from "react";
import type { BoardCase } from "@/lib/cases";
import { findDuplicates } from "@/lib/meds";
import type { CaseStatus } from "@/lib/types";
import { clockBogota, Toast, TopBar, TriagePill, useNow, usePoll } from "./components/ui";

type Resp = { cases: BoardCase[]; roster: { total: number; available: number }; now: number };

const LANES: { key: string; label: string; statuses: CaseStatus[] }[] = [
  { key: "intake", label: "On the line", statuses: ["intake"] },
  { key: "triaged", label: "Triaged", statuses: ["triaged"] },
  { key: "dispatched", label: "Doctor assigned", statuses: ["dispatched"] },
  { key: "moving", label: "Accepted, on the way", statuses: ["accepted", "en_route"] },
  { key: "done", label: "Completed", statuses: ["completed"] },
];

function minsSince(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

function Card({ c, now }: { c: BoardCase; now: number }) {
  const dup = findDuplicates(c.meds);
  const where = [c.patient.neighborhood, c.patient.city].filter(Boolean).join(", ");
  return (
    <Link href={`/cases/${c.id}`} className={`card${c.callActive ? " is-live" : ""}`} data-t={c.triage}>
      <div className="card-top">
        <TriagePill t={c.triage} />
        {c.callActive ? <span className="live">Live</span> : <span className="card-num">{c.number}</span>}
      </div>
      <div className="card-name">{c.patient.name}</div>
      {where && <div className="card-where">{where}</div>}
      <div className="card-complaint">{c.complaint ?? "Intake in progress"}</div>
      {dup.length > 0 && <div className="card-alert">Duplicate {dup[0].ingredient}</div>}
      <div className="card-foot">
        {c.status === "escalated" && c.er ? (
          <span>Nearest ER: {c.er.name}</span>
        ) : c.doctor ? (
          <span>
            {c.doctor.name.replace(/^Dra?\. /, "")}
            {c.etaAt && c.status !== "completed" ? <> · ETA {clockBogota(c.etaAt)}</> : null}
          </span>
        ) : (
          <span />
        )}
        <span suppressHydrationWarning>{minsSince(c.createdAt, now)}</span>
      </div>
    </Link>
  );
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function Board() {
  const { data } = usePoll<Resp>("/api/cases", 2000);
  const now = useNow(15000);
  const [toast, setToast] = useState<string | null>(null);
  const cases = data?.cases ?? [];
  const emergencies = cases.filter((c) => c.status === "escalated");
  const open = cases.filter((c) => !["completed", "escalated"].includes(c.status));
  const dispatchTimes = cases.filter((c) => c.dispatchedAt).map((c) => (c.dispatchedAt! - c.createdAt) / 1000);
  const med = median(dispatchTimes);
  const medAlerts = cases.filter((c) => findDuplicates(c.meds).length > 0).length;

  async function demo(action: "seed" | "reset") {
    const key = new URLSearchParams(location.search).get("key");
    const r = await fetch(`/api/demo${key ? `?key=${key}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setToast(r.ok ? (action === "seed" ? "Loaded tonight's sample cases" : "Board cleared") : "Demo controls are locked");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="shell">
      <TopBar
        right={
          data && (
            <span className="roster">
              {data.roster.available} of {data.roster.total} doctors free
            </span>
          )
        }
      />
      <main className="page">
        <div className="board-head">
          <div>
            <h1>Tonight's cases</h1>
            <p>Every call the agent takes lands here, with its triage and the doctor sent.</p>
          </div>
          <div className="toolbar">
            <button className="btn ghost" onClick={() => demo("reset")}>Clear board</button>
            <button className="btn" onClick={() => demo("seed")}>Load sample cases</button>
            <Link className="btn primary" href="/demo">Take a live call</Link>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{open.length}</b>
            <span>Open cases</span>
          </div>
          <div className="kpi">
            <b>{med === null ? "—" : med < 90 ? `${Math.round(med)}s` : `${Math.floor(med / 60)}m ${Math.round(med % 60)}s`}</b>
            <span>Median call start to doctor dispatched</span>
          </div>
          <div className="kpi">
            <b className={emergencies.length ? "alert" : undefined}>{emergencies.length}</b>
            <span>Emergencies sent to 123</span>
          </div>
          <div className="kpi">
            <b>{medAlerts}</b>
            <span>Medication duplicates caught</span>
          </div>
        </div>

        {emergencies.length > 0 && (
          <section className="emergency-lane">
            <h2>
              Sent to 123 <span>Red flags found. The agent stopped intake and directed the caller to emergency services.</span>
            </h2>
            <div className="emergency-row">
              {emergencies.map((c) => (
                <Card key={c.id} c={c} now={now} />
              ))}
            </div>
          </section>
        )}

        <div className="lanes">
          {LANES.map((l) => {
            const items = cases.filter((c) => l.statuses.includes(c.status));
            return (
              <section className="lane" key={l.key} data-lane={l.key} aria-label={`${l.label}: ${items.length}`}>
                <div className="lane-head">
                  <span className="lane-title">{l.label}</span>
                  <span className="lane-count">{items.length}</span>
                </div>
                <div className="lane-body">
                  {items.length === 0 && (
                    <div className="lane-empty">{l.key === "intake" ? "No one on the line" : "Nothing here"}</div>
                  )}
                  {items.map((c) => (
                    <Card key={c.id} c={c} now={now} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {data && cases.length === 0 && (
          <p className="muted" style={{ marginTop: 22 }}>
            The board is empty. Load the sample cases for context, then take a live call.
          </p>
        )}
      </main>
      <Toast text={toast} />
    </div>
  );
}
