import { km, geocode } from "./places";
import type { Case, Doctor, Triage } from "./types";

/** Synthetic on-call roster. Names and phone numbers are fictional. */
export const DOCTORS: Doctor[] = [
  { id: "d1", name: "Dra. Valentina Ospina", zone: "El Poblado", phone: "+57 300 000 0101", lat: 6.2095, lon: -75.5655 },
  { id: "d2", name: "Dr. Andrés Restrepo", zone: "Laureles", phone: "+57 300 000 0102", lat: 6.2455, lon: -75.5915 },
  { id: "d3", name: "Dra. Camila Duque", zone: "Envigado", phone: "+57 300 000 0103", lat: 6.1725, lon: -75.5855 },
  { id: "d4", name: "Dr. Santiago Mejía", zone: "Belén", phone: "+57 300 000 0104", lat: 6.2315, lon: -75.6035 },
  { id: "d5", name: "Dr. Julián Cárdenas", zone: "Centro", phone: "+57 300 000 0105", lat: 6.2476, lon: -75.5658 },
];

const BUSY: Case["status"][] = ["dispatched", "accepted", "en_route"];

/**
 * Picks the doctor with the shortest ETA. ETA = 22 min to get ready +
 * travel at ~22 km/h night traffic + 40 min if already on another visit.
 */
export async function pickDoctor(c: Case, openCases: Case[], triage: Triage) {
  const at = await geocode(c.patient.neighborhood, c.patient.city);
  const busy = new Set(openCases.filter((x) => x.id !== c.id && BUSY.includes(x.status)).map((x) => x.doctor?.id));
  const options = DOCTORS.map((d) => {
    const travel = (km(at, d) / 22) * 60;
    const eta = Math.round(22 + travel + (busy.has(d.id) ? 40 : 0));
    return { doctor: d, eta, busy: busy.has(d.id) };
  }).sort((a, b) => a.eta - b.eta);
  const best = options[0];
  const target = triage === "URGENT" ? 120 : triage === "STANDARD" ? 360 : 720;
  return { ...best, withinTarget: best.eta <= target, targetMinutes: target, options };
}

export function onCallCount(openCases: Case[]) {
  const busy = new Set(openCases.filter((x) => BUSY.includes(x.status)).map((x) => x.doctor?.id));
  return { total: DOCTORS.length, available: DOCTORS.filter((d) => !busy.has(d.id)).length };
}
