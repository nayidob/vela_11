import { addEvent, createCase, updateCase } from "./cases";
import { DOCTORS } from "./roster";
import { runTool } from "./tools";
import type { Case } from "./types";

const MIN = 60_000;

/** Earlier-tonight cases so the board isn't empty on camera. Synthetic. */
export async function seedDemo() {
  const now = Date.now();
  const make = async (
    minsAgo: number,
    patch: Partial<Case>,
    events: { m: number; title: string; detail?: string; kind?: "tool" | "safety" | "notify" | "status"; tone?: "good" | "warn" | "danger" }[],
  ) => {
    const c = await createCase({ channel: "phone", createdAt: now - minsAgo * MIN, callActive: false, seeded: true, ...patch });
    for (const e of events)
      await addEvent(c.id, { at: now - (minsAgo - e.m) * MIN, kind: e.kind ?? "tool", title: e.title, detail: e.detail, tone: e.tone });
    await updateCase(c.id, (x) => {
      x.updatedAt = now - (minsAgo - (events.at(-1)?.m ?? 0)) * MIN;
    });
  };

  await make(
    214,
    {
      status: "completed",
      triage: "STANDARD",
      patient: { name: "Sophie Laurent", neighborhood: "Laureles", city: "Medellín", age: 41, policy: { number: "TRV-8803-1146", insurer: "Andes Assist", plan: "Traveler Plus", verified: true } },
      complaint: "Sore throat and fever for two days",
      symptoms: { summary: "Sore throat, fever 38.4 °C, no breathing difficulty", temperatureC: 38.4, onsetHours: 48, redFlags: [] },
      triageReasons: [],
      meds: [{ reported: "Advil", ingredients: ["ibuprofen"], source: "openFDA" }],
      doctor: DOCTORS[1],
      etaMinutes: 38,
      etaAt: now - 168 * MIN,
      dispatchedAt: now - 206 * MIN,
      summaryEn: "41F traveler, sore throat and fever 38.4 °C for 2 days, eating and drinking normally.",
      briefingEs: "Odinofagia y fiebre de 38,4 °C desde hace dos días. Tolera vía oral.",
    },
    [
      { m: 1, title: "Member verified", detail: "Andes Assist · Traveler Plus", tone: "good" },
      { m: 4, title: "Triage: Standard" },
      { m: 8, title: "Dr. Andrés Restrepo dispatched", detail: "ETA 38 min", tone: "good" },
      { m: 9, kind: "status", title: "Doctor accepted the visit", tone: "good" },
      { m: 82, kind: "status", title: "Visit completed", tone: "good" },
    ],
  );

  await make(
    131,
    {
      status: "escalated",
      triage: "EMERGENCY",
      patient: { name: "Daniel Okafor", neighborhood: "Provenza", city: "Medellín", age: 58, policy: { number: "TRV-3390-7782", insurer: "Andes Assist", plan: "Expat Annual", verified: true } },
      complaint: "Chest pressure spreading to the left arm",
      symptoms: { summary: "Chest pressure for 20 minutes, sweating, pain spreading to left arm", redFlags: ["chest pain"] },
      triageReasons: ["Red flag reported: chest pain"],
      triageReasonsEs: ["Signo de alarma: dolor torácico"],
      er: { name: "Clínica Medellín El Poblado", distanceKm: 0.6, source: "OpenStreetMap" },
    },
    [
      { m: 1, kind: "safety", title: "Red flag: chest pain", tone: "danger" },
      { m: 1, kind: "safety", title: "Emergency escalated to 123", detail: "Nearest emergency department: Clínica Medellín El Poblado, 0.6 km", tone: "danger" },
    ],
  );

  await make(
    74,
    {
      status: "triaged",
      triage: "SELF_CARE",
      patient: { name: "Priya Raman", neighborhood: "Envigado", city: "Medellín", age: 29, policy: { number: "TRV-2210-5518", insurer: "Andes Assist", plan: "Traveler Basic", verified: true } },
      complaint: "Mild altitude-style headache",
      symptoms: { summary: "Mild headache since the afternoon, pain 3/10, no fever", pain: 3, redFlags: [] },
      triageReasons: [],
      summaryEn: "Mild headache, stable. Offered a morning visit; patient chose self-care.",
    },
    [
      { m: 1, title: "Member verified", tone: "good" },
      { m: 3, title: "Triage: Self-care", detail: "Morning visit offered" },
    ],
  );

  await make(
    41,
    {
      status: "en_route",
      triage: "URGENT",
      patient: { name: "Hannah Weiss", neighborhood: "Sabaneta", city: "Medellín", age: 46, policy: { number: "TRV-6615-2047", insurer: "Andes Assist", plan: "Expat Annual", verified: true } },
      complaint: "Severe abdominal cramps",
      symptoms: { summary: "Abdominal cramps, pain 8/10, started after dinner", pain: 8, onsetHours: 3, redFlags: [] },
      triageReasons: ["Pain 8/10"],
      triageReasonsEs: ["Dolor 8/10"],
      meds: [{ reported: "Buscapina", ingredients: ["hyoscine butylbromide"], source: "INVIMA" }],
      doctor: DOCTORS[2],
      etaMinutes: 31,
      etaAt: now - 2 * MIN,
      dispatchedAt: now - 33 * MIN,
      summaryEn: "46F, cramping abdominal pain 8/10 for 3 h, took Buscapina.",
      briefingEs: "Dolor abdominal tipo cólico 8/10 de 3 horas de evolución.",
    },
    [
      { m: 1, title: "Member verified", tone: "good" },
      { m: 5, title: "Triage: Urgent", detail: "Pain 8/10", tone: "warn" },
      { m: 8, title: "Dra. Camila Duque dispatched", detail: "ETA 31 min", tone: "good" },
      { m: 9, kind: "status", title: "Doctor accepted the visit", tone: "good" },
      { m: 12, kind: "status", title: "Doctor is on the way", tone: "good" },
    ],
  );
}

/* ---------------- Golden-path rehearsal ---------------- */

type Step =
  | { say: "agent" | "user"; text: string; wait?: number }
  | { tool: string; params: Record<string, unknown>; wait?: number };

export const GOLDEN_PATH: Step[] = [
  { say: "agent", text: "Hi, this is Vela, the night-care line in Medellín. Before anything else: do you have chest pain, trouble breathing, or feel like you might faint?" },
  { say: "user", text: "No... no chest pain. I've just been throwing up since dinner and I feel really awful." },
  { tool: "log_insight", params: { insight: "Caller sounds anxious; slowing pace and keeping questions short" }, wait: 600 },
  { say: "agent", text: "I'm sorry, that sounds miserable. We'll take this one step at a time. What's your name, and do you have a travel insurance policy number handy?" },
  { say: "user", text: "Mark Ellison. The policy is T R V... 4 4 7 1... 0 9 2 3." },
  { tool: "verify_member", params: { policy_number: "TRV 4471 0923", patient_name: "Mark Ellison" } },
  { say: "agent", text: "Thanks, Mark. Your Andes Assist coverage is confirmed, and home visits are included. Where are you right now, and are you on your own?" },
  { say: "user", text: "El Poblado, in an apartment. Yeah, I'm alone." },
  { tool: "open_case", params: { patient_name: "Mark Ellison", neighborhood: "El Poblado", city: "Medellín", chief_complaint: "Vomiting and diarrhea since dinner", is_alone: true } },
  { say: "agent", text: "Got it. Have you taken your temperature, and have you been able to keep any water down?" },
  { say: "user", text: "39.8. And nothing stays down, it's been about seven hours." },
  { say: "agent", text: "Thank you. Have you taken any medication in the last day?" },
  { say: "user", text: "I took some Tylenol I brought from home, and the pharmacy gave me this... Dolex, acetaminofén quinientos miligramos." },
  { tool: "check_medication", params: { medication_name: "Tylenol" }, wait: 400 },
  { tool: "check_medication", params: { medication_name: "Dolex" } },
  { say: "agent", text: "Mark, one important thing: Tylenol and Dolex are the same medicine, acetaminophen. Please don't take more of either until the doctor checks them." },
  { say: "user", text: "Oh. I had no idea. Okay." },
  {
    tool: "assess_triage",
    params: {
      level: "STANDARD",
      chief_complaint: "Vomiting and diarrhea since dinner",
      symptoms_summary: "Vomiting and diarrhea for 7 hours, fever 39.8 C, unable to keep fluids down, no chest pain, no breathing difficulty",
      red_flags: "none",
      temperature_c: 39.8,
      hours_unable_to_keep_fluids: 7,
      hours_since_onset: 7,
      age: 34,
    },
  },
  { say: "agent", text: "Given the fever and that you can't keep fluids down, I'm sending a doctor to you now." },
  {
    tool: "dispatch_doctor",
    params: {
      symptoms_summary_en: "34M traveler, vomiting and diarrhea for 7 h after dinner, fever 39.8 °C, unable to keep fluids down. Took Tylenol and Dolex (duplicate acetaminophen). Alone in apartment.",
      briefing_es: "Vómito y diarrea de 7 horas de evolución tras la cena, fiebre de 39,8 °C, intolerancia a la vía oral. Está solo en el apartamento.",
    },
  },
  { say: "agent", text: "Dra. Valentina Ospina is on her way. Keep sipping small amounts of water, put your medications in one place, and unlock the door. If you get chest pain, trouble breathing or feel faint, call 123 right away." },
  { say: "user", text: "Thank you. Really." },
];

export async function runGoldenPath(opts: { email?: string; speed?: number } = {}) {
  const conversationId = `sim_${Date.now().toString(36)}`;
  const c = await createCase({ conversationId, channel: "simulated", patient: { name: "Incoming call", email: opts.email } });
  await addEvent(c.id, { kind: "system", title: "Call connected", detail: "Rehearsal run, scripted golden path", source: "ElevenAgents" });
  return { caseId: c.id, conversationId, run: () => play(c.id, conversationId, opts.speed ?? 1) };
}

async function play(caseId: string, conversationId: string, speed: number) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / speed));
  const t0 = Date.now();
  for (const s of GOLDEN_PATH) {
    if ("say" in s) {
      await updateCase(caseId, (x) => {
        x.transcript.push({ role: s.say, text: s.text, t: (Date.now() - t0) / 1000 });
      });
      await sleep(s.wait ?? Math.min(3400, 900 + s.text.length * 22));
    } else {
      const r = await runTool(s.tool, { ...s.params, conversation_id: conversationId, channel: "simulated" });
      await r.background?.();
      await sleep(s.wait ?? 1100);
    }
  }
  await updateCase(caseId, (x) => {
    x.callActive = false;
  });
  await addEvent(caseId, { kind: "system", title: "Call ended", source: "ElevenAgents" });
}
