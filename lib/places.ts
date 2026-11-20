import { db } from "./store";
import type { DataSource } from "./types";

/** Approximate centroids for Medellín-area neighborhoods (demo use). */
export const NEIGHBORHOODS: Record<string, { lat: number; lon: number; label: string }> = {
  "el poblado": { lat: 6.2088, lon: -75.567, label: "El Poblado" },
  poblado: { lat: 6.2088, lon: -75.567, label: "El Poblado" },
  provenza: { lat: 6.2085, lon: -75.5655, label: "Provenza" },
  manila: { lat: 6.2106, lon: -75.569, label: "Manila" },
  laureles: { lat: 6.2447, lon: -75.593, label: "Laureles" },
  estadio: { lat: 6.256, lon: -75.59, label: "Estadio" },
  envigado: { lat: 6.1716, lon: -75.587, label: "Envigado" },
  sabaneta: { lat: 6.1515, lon: -75.6166, label: "Sabaneta" },
  belen: { lat: 6.231, lon: -75.604, label: "Belén" },
  centro: { lat: 6.2476, lon: -75.5658, label: "Centro" },
  robledo: { lat: 6.278, lon: -75.595, label: "Robledo" },
};

/** Fallback list with approximate coordinates, used if OpenStreetMap is unreachable. */
const FALLBACK_ERS = [
  { name: "Clínica Medellín El Poblado", lat: 6.2065, lon: -75.5717 },
  { name: "Clínica Las Vegas", lat: 6.1985, lon: -75.5765 },
  { name: "Clínica El Rosario, sede El Tesoro", lat: 6.1997, lon: -75.5592 },
  { name: "Clínica Las Américas", lat: 6.2216, lon: -75.6036 },
  { name: "Hospital General de Medellín", lat: 6.231, lon: -75.5718 },
  { name: "Hospital Pablo Tobón Uribe", lat: 6.2602, lon: -75.5925 },
];

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

const UA = "VelaNightCareDemo/1.0 (take-home demo; contact via repo)";
const geoCache = new Map<string, { lat: number; lon: number; label: string }>();
const erCache = new Map<string, Er>();

export async function geocode(neighborhood?: string, city = "Medellín") {
  const key = strip(neighborhood ?? "");
  for (const [k, v] of Object.entries(NEIGHBORHOODS)) if (key && key.includes(k)) return v;
  const cacheKey = `${key}|${strip(city)}`;
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey)!;
  try {
    const q = encodeURIComponent(`${neighborhood ?? ""}, ${city}, Colombia`);
    const res = await withTimeout(
      fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
        headers: { "User-Agent": UA },
        cache: "no-store",
      }),
      3500,
    );
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (rows[0]) {
      const v = { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: neighborhood ?? city };
      geoCache.set(cacheKey, v);
      return v;
    }
  } catch {
    /* fall through */
  }
  return NEIGHBORHOODS["el poblado"];
}

type Er = { name: string; distanceKm: number; address?: string; source: DataSource };

/** Shared across serverless instances so an emergency never waits on OpenStreetMap twice for the same area. */
export async function nearestEmergencyRoom(neighborhood?: string, city?: string, opts: { fresh?: boolean } = {}) {
  const at = await geocode(neighborhood, city);
  const cacheKey = `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`;
  if (!opts.fresh) {
    if (erCache.has(cacheKey)) return erCache.get(cacheKey)!;
    const shared = await db()
      .get<Er>(`er:${cacheKey}`)
      .catch(() => null);
    if (shared) {
      erCache.set(cacheKey, shared);
      return shared;
    }
  }
  try {
    const q = `[out:json][timeout:3];(nwr["amenity"="hospital"]["emergency"!="no"](around:6000,${at.lat},${at.lon}););out center 25;`;
    const res = await withTimeout(
      fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: `data=${encodeURIComponent(q)}`,
        cache: "no-store",
      }),
      3000,
    );
    const data = (await res.json()) as {
      elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
    };
    const best = data.elements
      .map((e) => {
        const p = e.center ?? (e.lat && e.lon ? { lat: e.lat, lon: e.lon } : null);
        if (!p || !e.tags?.name) return null;
        const addr = [e.tags["addr:street"], e.tags["addr:housenumber"]].filter(Boolean).join(" ");
        return { name: e.tags.name, distanceKm: km(at, p), address: addr || undefined };
      })
      .filter(Boolean)
      .sort((a, b) => a!.distanceKm - b!.distanceKm)[0];
    if (best) {
      const v: Er = { ...best, distanceKm: Math.round(best.distanceKm * 10) / 10, source: "OpenStreetMap" };
      erCache.set(cacheKey, v);
      await db()
        .set(`er:${cacheKey}`, v, 60 * 60 * 24 * 7)
        .catch(() => {});
      return v;
    }
  } catch {
    /* fall through to offline list */
  }
  const f = FALLBACK_ERS.map((h) => ({ name: h.name, distanceKm: km(at, h) })).sort(
    (a, b) => a.distanceKm - b.distanceKm,
  )[0];
  return { name: f.name, distanceKm: Math.round(f.distanceKm * 10) / 10, source: "Offline list" as DataSource };
}
