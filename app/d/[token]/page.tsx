"use client";

import { use, useState } from "react";
import { findDuplicates, INGREDIENT_ES } from "@/lib/meds";
import type { CaseWithEvents } from "@/lib/types";
import { TRIAGE_LABEL_ES } from "@/lib/types";
import { clockBogota, LogoMark, usePoll } from "../../components/ui";

type C = Omit<CaseWithEvents, "emailHtml" | "telegramMessage">;

const NEXT: Record<string, { action: string; label: string } | null> = {
  dispatched: { action: "accept", label: "Aceptar visita" },
  accepted: { action: "en_route", label: "Voy en camino" },
  en_route: { action: "completed", label: "Visita completada" },
  completed: null,
};

const ESTADO: Record<string, string> = {
  dispatched: "Asignada, pendiente de aceptar",
  accepted: "Aceptada",
  en_route: "En camino",
  completed: "Completada",
};

export default function DoctorView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, error } = usePoll<{ case: C }>(`/api/doctor/${token}`, 3000);
  const [busy, setBusy] = useState(false);
  const c = data?.case;

  if (error) return <main className="doc"><p className="muted">Este enlace no es válido o el caso fue cerrado.</p></main>;
  if (!c) return <main className="doc"><p className="faint">Cargando…</p></main>;

  const next = NEXT[c.status] ?? null;
  const dups = findDuplicates(c.meds);
  const es = (i: string) => INGREDIENT_ES[i] ?? i;

  async function act(action: string) {
    setBusy(true);
    await fetch(`/api/doctor/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
  }

  return (
    <main className="doc" lang="es">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LogoMark /> <b>Vela · Despacho</b>
        <span className="faint small" style={{ marginLeft: "auto" }}>{c.number}</span>
      </div>
      <h1>{c.patient.name}{c.patient.age ? `, ${c.patient.age} años` : ""}</h1>
      <div className="toolbar">
        <span className="triage lg" data-t={c.triage}>{TRIAGE_LABEL_ES[c.triage]}</span>
        <span className="muted">{ESTADO[c.status] ?? c.status}</span>
      </div>

      <section className="panel">
        <dl className="kv">
          <dt>Dirección</dt>
          <dd>{[c.patient.neighborhood, c.patient.city].filter(Boolean).join(", ")}</dd>
          <dt>Llegada</dt>
          <dd>{c.etaAt ? `${clockBogota(c.etaAt)} (${c.etaMinutes} min)` : "—"}</dd>
          <dt>Aseguradora</dt>
          <dd>
            {c.patient.policy ? `${c.patient.policy.insurer ?? ""} · ${c.patient.policy.number} ${c.patient.policy.verified ? "· verificada" : "· sin verificar"}` : "Particular"}
          </dd>
          {c.patient.alone !== undefined && (<><dt>En casa</dt><dd>{c.patient.alone ? "Solo" : "Acompañado"}</dd></>)}
        </dl>
      </section>

      <section className="panel">
        <h3>Motivo de consulta</h3>
        <p>{c.briefingEs ?? c.complaint}</p>
        {(c.triageReasonsEs ?? []).length > 0 && <p className="small muted" style={{ marginTop: 8 }}>Criterios de triage: {c.triageReasonsEs!.join("; ")}</p>}
      </section>

      <section className="panel">
        <h3>Medicamentos reportados</h3>
        {c.meds.length === 0 ? <p className="faint">Ninguno</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {c.meds.map((m) => (
              <li key={m.reported}>{m.reported}: {m.ingredients.map(es).join(" + ") || "sin identificar"}</li>
            ))}
          </ul>
        )}
        {dups.map((d) => (
          <div className="alert-box" key={d.ingredient}>Duplicidad de {es(d.ingredient)}: {d.names.join(" + ")}. Revisar dosis total.</div>
        ))}
      </section>

      {c.summaryEn && (
        <section className="panel">
          <h3>Resumen original (inglés)</h3>
          <p className="muted" lang="en">{c.summaryEn}</p>
        </section>
      )}

      {next && (
        <div className="doc-actions">
          <button className="btn primary lg" disabled={busy} onClick={() => act(next.action)}>
            {busy ? "Guardando…" : next.label}
          </button>
        </div>
      )}
    </main>
  );
}
