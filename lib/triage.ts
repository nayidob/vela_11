import { TRIAGE_ORDER, type Triage } from "./types";

/**
 * Deterministic safety floor under the LLM's triage decision.
 * The agent proposes a level; these rules can only raise it, never lower it.
 * In a real deployment this is replaced by the client's validated protocol,
 * signed off by their medical director.
 */

const RED_FLAG_TERMS: { term: RegExp; label: string }[] = [
  { term: /chest (pain|pressure|tightness)/, label: "chest pain" },
  { term: /(can'?t|cannot|trouble|difficulty|hard to) breath|short(ness)? of breath|not breathing/, label: "difficulty breathing" },
  { term: /face (droop|drooping)|slurred speech|arm weakness|stroke/, label: "stroke signs" },
  { term: /faint(ed|ing)?|passed out|unconscious/, label: "fainting" },
  { term: /confus(ed|ion)|disoriented/, label: "confusion" },
  { term: /seizure|convuls/, label: "seizure" },
  { term: /severe bleeding|bleeding heavily|won'?t stop bleeding/, label: "severe bleeding" },
  { term: /(lips|throat|tongue) (swell|swollen)|swelling of (the )?(lips|throat|tongue)/, label: "airway swelling" },
  { term: /vomiting blood|black stool|tarry stool/, label: "GI bleeding" },
  { term: /stiff neck/, label: "headache with stiff neck" },
  { term: /suicid|kill myself|self.?harm|end my life/, label: "thoughts of self-harm" },
];

const NEGATION = /\b(no|not|denies|denied|without|never|none|hasn'?t|doesn'?t|isn'?t)\b/;

/** Finds red-flag terms that are not negated in the preceding few words. */
export function scanForRedFlags(text: string) {
  const t = (text || "").toLowerCase();
  const hits: string[] = [];
  for (const { term, label } of RED_FLAG_TERMS) {
    const m = term.exec(t);
    if (!m) continue;
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    if (NEGATION.test(before.split(/[.;,]/).pop() ?? "")) continue;
    hits.push(label);
  }
  return [...new Set(hits)];
}

export interface TriageInput {
  level?: string;
  red_flags?: string;
  symptoms_summary?: string;
  chief_complaint?: string;
  temperature_c?: number | string;
  pain_score?: number | string;
  hours_since_onset?: number | string;
  hours_unable_to_keep_fluids?: number | string;
  age?: number | string;
  pregnant?: boolean | string;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export function normalizeLevel(v?: string): Triage {
  const s = (v || "").toUpperCase().replace(/[\s-]/g, "_");
  if (s.startsWith("EMERG")) return "EMERGENCY";
  if (s.startsWith("URG")) return "URGENT";
  if (s.startsWith("STAND")) return "STANDARD";
  if (s.startsWith("SELF")) return "SELF_CARE";
  return "STANDARD";
}

export function applyTriageRules(input: TriageInput) {
  const proposed = normalizeLevel(input.level);
  const reasons: string[] = [];
  const reasonsEs: string[] = [];
  let floor: Triage = "SELF_CARE";
  const raise = (to: Triage, why: string, whyEs: string) => {
    reasons.push(why);
    reasonsEs.push(whyEs);
    if (TRIAGE_ORDER[to] > TRIAGE_ORDER[floor]) floor = to;
  };

  const declared = (input.red_flags || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(none|no|n\/a|nothing)$/i.test(s));
  for (const f of declared) raise("EMERGENCY", `Red flag reported: ${f}`, `Signo de alarma: ${f}`);

  const scanned = scanForRedFlags(`${input.symptoms_summary ?? ""}. ${input.chief_complaint ?? ""}`).filter(
    (f) => !declared.some((d) => d.toLowerCase().includes(f.split(" ")[0])),
  );
  for (const f of scanned) raise("EMERGENCY", `Safety net caught "${f}" in the symptom summary`, `Regla de seguridad detectó "${f}"`);

  const temp = num(input.temperature_c);
  if (temp !== undefined && temp >= 39.5) raise("URGENT", `Fever ${temp} °C (39.5 °C or higher)`, `Fiebre de ${String(temp).replace(".", ",")} °C`);
  const fluids = num(input.hours_unable_to_keep_fluids);
  if (fluids !== undefined && fluids >= 6) raise("URGENT", `Unable to keep fluids down for ${fluids} h`, `Intolerancia a líquidos por ${fluids} h`);
  const pain = num(input.pain_score);
  if (pain !== undefined && pain >= 8) raise("URGENT", `Pain ${pain}/10`, `Dolor ${pain}/10`);
  const age = num(input.age);
  if (age !== undefined && age >= 65) raise("URGENT", `Age ${age}`, `Edad ${age} años`);
  const preg = input.pregnant === true || String(input.pregnant).toLowerCase() === "true";
  if (preg) raise("URGENT", "Pregnant with new symptoms", "Embarazo con síntomas nuevos");

  const final: Triage = TRIAGE_ORDER[floor] > TRIAGE_ORDER[proposed] ? floor : proposed;
  return {
    proposed,
    final,
    raisedByRules: final !== proposed,
    reasons,
    reasonsEs,
    redFlags: [...declared, ...scanned],
    vitals: { temp, fluids, pain, age, pregnant: preg, onset: num(input.hours_since_onset) },
  };
}

export const TARGET_MINUTES: Record<Triage, number | null> = {
  EMERGENCY: null,
  URGENT: 120,
  STANDARD: 360,
  SELF_CARE: 720,
  PENDING: null,
};
