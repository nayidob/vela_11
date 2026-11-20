import { findDuplicates, INGREDIENT_ES } from "./meds";
import { clock } from "./time";
import { TRIAGE_LABEL, TRIAGE_LABEL_ES, type Case } from "./types";

export function appUrl() {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TRIAGE_DOT: Record<string, string> = {
  EMERGENCY: "🔴",
  URGENT: "🟠",
  STANDARD: "🟢",
  SELF_CARE: "🔵",
  PENDING: "⚪",
};

function medsEs(c: Case) {
  if (!c.meds.length) return "Ninguno reportado";
  return c.meds
    .map((m) => `${m.reported} (${m.ingredients.map((i) => INGREDIENT_ES[i] ?? i).join(" + ") || "sin identificar"})`)
    .join(", ");
}

function alertsEs(c: Case) {
  const dup = findDuplicates(c.meds).map(
    (d) => `Duplicidad de ${INGREDIENT_ES[d.ingredient] ?? d.ingredient}: ${d.names.join(" + ")}. Revisar dosis total.`,
  );
  const policy = c.patient.policy && !c.patient.policy.verified ? ["Póliza no verificada."] : [];
  const alone = c.patient.alone ? ["Paciente solo en casa."] : [];
  return [...dup, ...policy, ...alone];
}

/** Spanish briefing for the doctor (Telegram, HTML parse mode). */
export function doctorTelegramHtml(c: Case) {
  const p = c.patient;
  const eta = c.etaAt ? `${clock(c.etaAt)} (${c.etaMinutes} min)` : "por confirmar";
  const lines = [
    `🔔 <b>Nueva visita domiciliaria</b>  ·  ${esc(c.number)}`,
    ``,
    `<b>Triage:</b> ${TRIAGE_DOT[c.triage]} ${TRIAGE_LABEL_ES[c.triage]}  ·  llegada estimada ${esc(eta)}`,
    `<b>Paciente:</b> ${esc(p.name)}${p.age ? `, ${p.age} años` : ""}  ·  ${esc([p.neighborhood, p.city].filter(Boolean).join(", "))}`,
    p.policy
      ? `<b>Aseguradora:</b> ${esc(p.policy.insurer ?? "—")} · póliza ${esc(p.policy.number)} ${p.policy.verified ? "✅ verificada" : "⚠️ sin verificar"}`
      : `<b>Aseguradora:</b> particular`,
    ``,
    `<b>Motivo de consulta:</b> ${esc(c.briefingEs || c.complaint || "—")}`,
    `<b>Medicamentos:</b> ${esc(medsEs(c))}`,
  ];
  const alerts = alertsEs(c);
  if (alerts.length) lines.push(``, ...alerts.map((a) => `⚠️ <b>Alerta:</b> ${esc(a)}`));
  const crit = c.triageReasonsEs?.length ? c.triageReasonsEs : c.triageReasons;
  if (crit.length) lines.push(``, `<i>Criterios de triage: ${esc(crit.join("; "))}</i>`);
  return lines.join("\n");
}

export function emergencyTelegramHtml(c: Case) {
  const p = c.patient;
  return [
    `🔴 <b>Emergencia escalada al 123</b>  ·  ${esc(c.number)}`,
    ``,
    `<b>Paciente:</b> ${esc(p.name)}  ·  ${esc([p.neighborhood, p.city].filter(Boolean).join(", "))}`,
    `<b>Signos de alarma:</b> ${esc((c.symptoms?.redFlags ?? []).join(", ") || "—")}`,
    c.er ? `<b>Urgencias más cercanas:</b> ${esc(c.er.name)} (${c.er.distanceKm} km)` : "",
    ``,
    `<i>No se asignó visita domiciliaria. Solo para información del turno.</i>`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function statusLineEs(status: Case["status"], doctor?: string) {
  if (status === "accepted") return `✅ Aceptada por ${doctor}`;
  if (status === "en_route") return `🚗 ${doctor} va en camino`;
  if (status === "completed") return `🏁 Visita completada`;
  return "";
}

/** English confirmation email for the patient. */
export function patientEmail(c: Case) {
  const eta = c.etaAt ? clock(c.etaAt) : "";
  const subject = `Your home visit is confirmed · ${c.number}`;
  const waiting = [
    "Keep sipping small amounts of water or an oral rehydration drink.",
    "Put every medication you have taken in one place for the doctor.",
    "Unlock the door and keep your phone nearby.",
  ];
  const dup = findDuplicates(c.meds);
  if (dup.length)
    waiting.unshift(
      `Don't take more ${dup.map((d) => d.ingredient).join(" or ")} until the doctor reviews your medications.`,
    );
  const text = [
    `Your home visit is confirmed.`,
    ``,
    `Doctor: ${c.doctor?.name ?? "On-call doctor"}`,
    `Estimated arrival: ${eta} (about ${c.etaMinutes} minutes)`,
    `Case number: ${c.number}`,
    ``,
    `While you wait:`,
    ...waiting.map((w) => `- ${w}`),
    ``,
    `If you develop chest pain, trouble breathing, confusion or fainting, call 123 immediately.`,
    ``,
    `Vela Night Care (demo service with synthetic data)`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#0f1729;font-family:Arial,Helvetica,sans-serif;color:#e8edf7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1729;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#16213a;border-radius:14px;overflow:hidden">
<tr><td style="padding:28px 28px 8px"><div style="font-size:15px;color:#f5c76b;font-weight:bold">Vela Night Care</div>
<h1 style="font-size:24px;line-height:1.25;margin:14px 0 6px;color:#ffffff">Your home visit is confirmed</h1>
<p style="margin:0;color:#aab6cf;font-size:15px">Case ${esc(c.number)} · ${esc(TRIAGE_LABEL[c.triage])} priority</p></td></tr>
<tr><td style="padding:18px 28px"><table role="presentation" width="100%" style="background:#0f1729;border-radius:10px"><tr>
<td style="padding:18px 20px"><div style="color:#aab6cf;font-size:13px">Doctor</div><div style="font-size:18px;color:#fff;margin-top:4px">${esc(c.doctor?.name ?? "On-call doctor")}</div></td>
<td style="padding:18px 20px" align="right"><div style="color:#aab6cf;font-size:13px">Arriving around</div><div style="font-size:26px;color:#f5c76b;margin-top:2px;font-weight:bold">${esc(eta)}</div></td>
</tr></table></td></tr>
<tr><td style="padding:4px 28px 8px"><div style="font-size:15px;color:#fff;font-weight:bold;margin-bottom:8px">While you wait</div>
<ul style="margin:0;padding-left:18px;color:#d5ddec;font-size:15px;line-height:1.55">${waiting.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></td></tr>
<tr><td style="padding:18px 28px 28px"><div style="background:#3a1d24;border-radius:10px;padding:14px 16px;color:#ffd4d4;font-size:14px;line-height:1.5">
If you develop chest pain, trouble breathing, confusion or fainting, <b>call 123 immediately</b>.</div>
<p style="color:#7d8aa6;font-size:12px;margin:18px 0 0">Demo service built for a technical take-home. All patient data is synthetic.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
