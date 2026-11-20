"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { findDuplicates } from "@/lib/meds";
import type { PublicCase } from "@/lib/cases";
import { STATUS_LABEL } from "@/lib/types";
import { ActivityLog } from "./ActivityLog";
import { clockBogota, Source, TriagePill, useNow } from "./ui";

const CHANNEL: Record<string, string> = {
  web_voice: "Web voice call",
  phone: "Phone call",
  telegram: "Telegram chat",
  whatsapp: "WhatsApp",
  simulated: "Rehearsal",
  unknown: "Agent conversation",
};

const STEP_ORDER = ["dispatched", "accepted", "en_route", "completed"] as const;

export function CaseHeader({ c, compact }: { c: PublicCase; compact?: boolean }) {
  const now = useNow(1000);
  const where = [c.patient.neighborhood, c.patient.city].filter(Boolean).join(", ");
  return (
    <div className="case-head">
      <div>
        <h1 style={compact ? { fontSize: 24 } : undefined}>{c.patient.name}</h1>
        <div className="case-meta">
          <span>{c.number}</span>
          {where && <span>{where}</span>}
          <span>{CHANNEL[c.channel] ?? c.channel}</span>
          {c.callActive ? (
            <span className="live">On the line · {Math.max(0, Math.round((now - c.createdAt) / 1000 / 60))} min</span>
          ) : (
            <span className="faint">{STATUS_LABEL[c.status]}</span>
          )}
        </div>
      </div>
      <TriagePill t={c.triage} lg />
    </div>
  );
}

export function PatientCard({ c }: { c: PublicCase }) {
  const p = c.patient;
  return (
    <section className="panel">
      <h3>Patient and coverage</h3>
      <dl className="kv">
        <dt>Complaint</dt>
        <dd>{c.complaint ?? <span className="faint">Collecting…</span>}</dd>
        <dt>Coverage</dt>
        <dd>
          {p.policy ? (
            p.policy.verified ? (
              <span>
                <span style={{ color: "var(--good)" }}>Verified</span> · {p.policy.insurer} {p.policy.plan}
              </span>
            ) : (
              <span style={{ color: "var(--warn)" }}>Not verified · {p.policy.note}</span>
            )
          ) : (
            <span className="faint">Not checked yet</span>
          )}
        </dd>
        {p.policy && (
          <>
            <dt>Policy</dt>
            <dd>{p.policy.number}</dd>
          </>
        )}
        {c.symptoms?.temperatureC !== undefined && (
          <>
            <dt>Temperature</dt>
            <dd>{c.symptoms.temperatureC} °C</dd>
          </>
        )}
        {c.symptoms?.fluidsHours !== undefined && (
          <>
            <dt>No fluids for</dt>
            <dd>{c.symptoms.fluidsHours} h</dd>
          </>
        )}
        {c.symptoms?.pain !== undefined && (
          <>
            <dt>Pain</dt>
            <dd>{c.symptoms.pain}/10</dd>
          </>
        )}
        {p.alone !== undefined && (
          <>
            <dt>At home</dt>
            <dd>{p.alone ? "Alone" : "With someone"}</dd>
          </>
        )}
        {p.email && (
          <>
            <dt>Email</dt>
            <dd>{p.email}</dd>
          </>
        )}
      </dl>
      {c.triageReasons.length > 0 && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Triage criteria: {c.triageReasons.join("; ")}
        </p>
      )}
    </section>
  );
}

export function MedsCard({ c }: { c: PublicCase }) {
  const dups = findDuplicates(c.meds);
  const dupNames = new Set(dups.flatMap((d) => d.names.map((n) => n.toLowerCase())));
  return (
    <section className="panel">
      <h3>
        Medication check <small>INVIMA · openFDA</small>
      </h3>
      {c.meds.length === 0 ? (
        <p className="faint small">No medications reported yet.</p>
      ) : (
        <table className="meds">
          <thead>
            <tr>
              <th>Caller said</th>
              <th>Active ingredient</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {c.meds.map((m) => (
              <tr key={m.reported} className={dupNames.has(m.reported.toLowerCase()) ? "dup" : undefined}>
                <td>{m.reported}</td>
                <td>{m.ingredients.join(", ") || <span className="faint">Not identified</span>}</td>
                <td>
                  <Source s={m.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dups.map((d) => (
        <div className="alert-box" key={d.ingredient}>
          {d.names.join(" and ")} both contain {d.ingredient}. Patient told not to take more until the doctor reviews.
        </div>
      ))}
    </section>
  );
}

export function DispatchCard({ c }: { c: PublicCase }) {
  const now = useNow(5000);
  if (c.triage === "EMERGENCY") {
    return (
      <section className="panel" style={{ borderColor: "color-mix(in srgb, var(--t-emergency) 40%, transparent)" }}>
        <h3 style={{ color: "var(--t-emergency)" }}>Sent to emergency services</h3>
        <p>Caller told to call 123. No home visit dispatched.</p>
        {c.er && (
          <p className="muted" style={{ marginTop: 8 }}>
            Nearest emergency department: <b style={{ color: "var(--text)" }}>{c.er.name}</b>, {c.er.distanceKm} km{" "}
            <Source s={c.er.source} />
          </p>
        )}
      </section>
    );
  }
  if (!c.doctor) {
    return (
      <section className="panel">
        <h3>Doctor dispatch</h3>
        <p className="faint small">
          {c.triage === "PENDING" ? "Waits for triage." : "Triage done. Waiting for the agent to dispatch."}
        </p>
      </section>
    );
  }
  const idx = STEP_ORDER.indexOf(c.status as (typeof STEP_ORDER)[number]);
  const minsLeft = c.etaAt ? Math.max(0, Math.round((c.etaAt - now) / 60000)) : null;
  return (
    <section className="panel">
      <h3>
        Doctor dispatch
        <Link href={`/d/${c.doctorToken}`} target="_blank" className="small" style={{ color: "var(--flame)", fontWeight: 400 }}>
          Open doctor view
        </Link>
      </h3>
      <div className="dispatch">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{c.doctor.name}</div>
          <div className="muted small">Based in {c.doctor.zone}</div>
        </div>
        <div className="eta">
          <b suppressHydrationWarning>{c.etaAt ? clockBogota(c.etaAt) : "—"}</b>
          <span suppressHydrationWarning>
            {c.status === "completed" ? "visit completed" : minsLeft !== null ? `arrives in ${minsLeft} min` : ""}
          </span>
        </div>
      </div>
      <div className="steps" aria-hidden="true">
        {STEP_ORDER.map((s, i) => (
          <i key={s} className={i <= idx ? "on" : undefined} />
        ))}
      </div>
      <div className="steps-label">
        <span>Assigned</span>
        <span>Accepted</span>
        <span>On the way</span>
        <span>Done</span>
      </div>
    </section>
  );
}

export function NotifyCard({ c }: { c: PublicCase }) {
  return (
    <section className="panel">
      <h3>
        Messages sent <small>Spanish to the doctor, English to the patient</small>
      </h3>
      {c.telegramPreview ? (
        <div className="tg">
          <div className="tg-head">
            <span className="av">🩺</span>
            <div>
              <b>Médicos de turno</b>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>Vela Despacho bot</div>
            </div>
          </div>
          <div className="tg-bubble" dangerouslySetInnerHTML={{ __html: c.telegramPreview }} />
          {c.doctor && c.status === "dispatched" && (
            <div className="tg-buttons">
              <span>✅ Aceptar</span>
              <span>🚗 En camino</span>
            </div>
          )}
        </div>
      ) : (
        <p className="faint small">The doctor briefing appears here once a doctor is dispatched.</p>
      )}
      <div style={{ marginTop: 12 }}>
        {c.notifications.map((n, i) => (
          <div className="notif" key={i}>
            <span>
              {n.kind === "email" ? "Email to patient" : "Telegram to doctors"}
              <span className="faint"> · {n.to}</span>
            </span>
            <span className={`status-${n.status}`}>
              {n.status === "sent" ? "Sent" : n.status === "preview" ? "Preview only" : "Failed"}
            </span>
          </div>
        ))}
        {c.hasEmailPreview && (
          <a href={`/api/cases/${c.id}/email`} target="_blank" className="small" style={{ color: "var(--flame)" }}>
            View the patient email
          </a>
        )}
      </div>
    </section>
  );
}

/** Readable name for a criterion or data field; null when only a generated "aitem_…" ID is known. */
function analysisLabel(x: { id: string; label?: string }) {
  const name = x.label || (/^aitem_/i.test(x.id) ? "" : x.id);
  return name ? name.replace(/^__system_eval_criteria_/, "").replace(/_/g, " ") : null;
}

export function AnalysisCard({ c }: { c: PublicCase }) {
  if (!c.analysis) return null;
  const a = c.analysis;
  return (
    <section className="panel">
      <h3>
        Post-call analysis
        <small>
          {a.durationSecs ? `${Math.floor(a.durationSecs / 60)}m ${a.durationSecs % 60}s` : ""}
          {a.cost ? ` · ${a.cost} credits` : ""}
        </small>
      </h3>
      {a.summary && <p className="muted" style={{ marginBottom: 12 }}>{a.summary}</p>}
      <div className="criteria">
        {a.criteria.map((r) => (
          <div className="criterion" key={r.id} title={r.rationale}>
            <span className={r.result === "success" ? "ok" : r.result === "failure" ? "no" : "unk"}>
              {r.result === "success" ? "✓" : r.result === "failure" ? "✕" : "?"}
            </span>
            {analysisLabel(r) ? (
              <span>
                {analysisLabel(r)}
                {r.rationale && <span className="faint small"> · {r.rationale.slice(0, 120)}</span>}
              </span>
            ) : (
              <span>{r.rationale?.slice(0, 160) ?? "Criterion"}</span>
            )}
          </div>
        ))}
      </div>
      {a.data.length > 0 && (
        <dl className="kv" style={{ marginTop: 14 }}>
          {a.data.map((d, i) => (
            <div key={d.id} style={{ display: "contents" }}>
              <dt>{analysisLabel(d) ?? `Field ${i + 1}`}</dt>
              <dd>{String(d.value ?? "—")}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="faint small" style={{ marginTop: 12 }}>
        Conversation ID {c.conversationId}
      </p>
    </section>
  );
}

export function Transcript({ turns, live }: { turns: { role: string; text: string }[]; live?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);
  return (
    <div className="transcript" ref={box}>
      {turns.length === 0 && <p className="faint small">{live ? "The conversation will appear here." : "No transcript yet."}</p>}
      {turns.map((t, i) => (
        <div key={i} className={`turn ${t.role === "user" ? "user" : "agent"}`}>
          <small>{t.role === "user" ? "Caller" : "Vela"}</small>
          {t.text.replace(/\[[a-z ]+\]\s*/gi, "")}
        </div>
      ))}
    </div>
  );
}

/** Full case layout used by /cases/[id] and the right side of /demo. */
export function CasePanel({ c, compact, logHeight }: { c: PublicCase; compact?: boolean; logHeight?: string }) {
  const cards = useRef<HTMLDivElement>(null);
  const meds = useRef<HTMLDivElement>(null);
  const notify = useRef<HTMLDivElement>(null);
  const last = useRef<{ meds: number; tg: boolean } | null>(null);

  // In the live view, keep the newest part of the story on screen:
  // medications as they're checked, then the dispatch and messages.
  useEffect(() => {
    if (!compact) return;
    const now = { meds: c.meds.length, tg: Boolean(c.telegramPreview) };
    const prev = last.current;
    last.current = now;
    if (!prev) return;
    const target = now.tg && !prev.tg ? notify.current : now.meds > prev.meds ? meds.current : null;
    if (target && cards.current)
      cards.current.scrollTo({ top: target.offsetTop - cards.current.offsetTop - 4, behavior: "smooth" });
  }, [compact, c.meds.length, c.telegramPreview]);

  return (
    <div>
      <CaseHeader c={c} compact={compact} />
      <div className="case-grid">
        <div className="stack">
          <section className="panel">
            <h3>
              What the agent is doing <small>live</small>
            </h3>
            <ActivityLog events={c.events} maxHeight={logHeight} />
          </section>
          {!compact && c.transcript.length > 0 && (
            <section className="panel">
              <h3>Transcript</h3>
              <Transcript turns={c.transcript} />
            </section>
          )}
        </div>
        <div className={`stack${compact ? " follow" : ""}`} ref={cards}>
          <PatientCard c={c} />
          <div ref={meds}>
            <MedsCard c={c} />
          </div>
          <DispatchCard c={c} />
          <div ref={notify}>
            <NotifyCard c={c} />
          </div>
          <AnalysisCard c={c} />
        </div>
      </div>
    </div>
  );
}
