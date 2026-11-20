import type { DataSource, MedicationEntry } from "./types";

/**
 * Medication lookup with three sources, queried in parallel:
 *  1. INVIMA "Código Único de Medicamentos Vigentes" on datos.gov.co (Colombia)
 *  2. openFDA drug labels (US brands visitors bring from home)
 *  3. A small curated brand list, so the demo never stalls if an API is slow
 *
 * Ingredients are normalized to canonical English names so "Dolex"
 * (acetaminofén) and "Tylenol" (acetaminophen) are recognized as the same drug.
 */

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const SYNONYMS: Record<string, string> = {
  acetaminofen: "acetaminophen",
  acetaminophen: "acetaminophen",
  paracetamol: "acetaminophen",
  ibuprofeno: "ibuprofen",
  ibuprofen: "ibuprofen",
  naproxeno: "naproxen",
  "naproxen sodium": "naproxen",
  naproxen: "naproxen",
  "acido acetilsalicilico": "aspirin",
  aspirin: "aspirin",
  loperamida: "loperamide",
  "loperamide hydrochloride": "loperamide",
  loperamide: "loperamide",
  dimenhidrinato: "dimenhydrinate",
  dimenhydrinate: "dimenhydrinate",
  "butilbromuro de hioscina": "hyoscine butylbromide",
  "hioscina butilbromuro": "hyoscine butylbromide",
  "hyoscine butylbromide": "hyoscine butylbromide",
  ondansetron: "ondansetron",
  metoclopramida: "metoclopramide",
  metoclopramide: "metoclopramide",
  loratadina: "loratadine",
  loratadine: "loratadine",
  dextrometorfano: "dextromethorphan",
  "dextromethorphan hydrobromide": "dextromethorphan",
  "dextromethorphan hbr": "dextromethorphan",
  dextromethorphan: "dextromethorphan",
  "doxylamine succinate": "doxylamine",
  doxylamine: "doxylamine",
  fenilefrina: "phenylephrine",
  "phenylephrine hcl": "phenylephrine",
  "phenylephrine hydrochloride": "phenylephrine",
  phenylephrine: "phenylephrine",
  clorfeniramina: "chlorpheniramine",
  "chlorpheniramine maleate": "chlorpheniramine",
  chlorpheniramine: "chlorpheniramine",
  "bismuth subsalicylate": "bismuth subsalicylate",
  "sales de rehidratacion oral": "oral rehydration salts",
  "oral rehydration salts": "oral rehydration salts",
  cafeina: "caffeine",
  caffeine: "caffeine",
};

export function canonicalIngredient(raw: string) {
  const s = strip(raw)
    .replace(/\b\d+([.,]\d+)?\s*(mg|ml|g|mcg|%)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (SYNONYMS[s]) return SYNONYMS[s];
  for (const [k, v] of Object.entries(SYNONYMS)) if (s.includes(k)) return v;
  return s;
}

/** Curated fallback. Brand → canonical ingredients. Synthetic demo use only. */
const BRANDS: Record<string, string[]> = {
  dolex: ["acetaminophen"],
  "dolex gripa": ["acetaminophen", "phenylephrine", "chlorpheniramine"],
  winadol: ["acetaminophen"],
  tylenol: ["acetaminophen"],
  panadol: ["acetaminophen"],
  nyquil: ["acetaminophen", "dextromethorphan", "doxylamine"],
  dayquil: ["acetaminophen", "dextromethorphan", "phenylephrine"],
  advil: ["ibuprofen"],
  motrin: ["ibuprofen"],
  aleve: ["naproxen"],
  aspirina: ["aspirin"],
  aspirin: ["aspirin"],
  imodium: ["loperamide"],
  mareol: ["dimenhydrinate"],
  dramamine: ["dimenhydrinate"],
  buscapina: ["hyoscine butylbromide"],
  "pepto bismol": ["bismuth subsalicylate"],
  "pepto-bismol": ["bismuth subsalicylate"],
  pedialyte: ["oral rehydration salts"],
  "suero oral": ["oral rehydration salts"],
  plasil: ["metoclopramide"],
  zofran: ["ondansetron"],
  claritin: ["loratadine"],
};

function brandLookup(name: string): string[] | null {
  const n = strip(name).replace(/[^a-z\s-]/g, "").trim();
  if (BRANDS[n]) return BRANDS[n];
  // longest brand contained in what the caller said ("dolex gripa" before "dolex")
  const hit = Object.keys(BRANDS)
    .sort((a, b) => b.length - a.length)
    .find((b) => n.includes(b));
  if (hit) return BRANDS[hit];
  const ing = canonicalIngredient(name);
  if (Object.values(SYNONYMS).includes(ing)) return [ing];
  return null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

const INVIMA_DATASET = () => process.env.INVIMA_CUM_DATASET_ID || "i7cb-raxc";

const words = (s: string) =>
  strip(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Dosage forms and filler that don't distinguish one product from another. */
const GENERIC_WORDS = new Set(
  "tableta tabletas recubierta recubiertas capsula capsulas blandas jarabe suspension solucion gotas oral polvo granulado efervescente masticables de la las los el con contra para y sintomas".split(
    " ",
  ),
);

export async function invimaLookup(name: string) {
  const terms = words(name).filter((w) => w.length >= 3 && !/^\d/.test(w));
  if (!terms.length) return null;
  const params = new URLSearchParams({
    $select: "producto,principioactivo",
    $where: terms.map((t) => `upper(producto) like '%${t.toUpperCase()}%'`).join(" AND "),
    $group: "producto,principioactivo",
    $limit: "300",
  });
  const url = `https://www.datos.gov.co/resource/${INVIMA_DATASET()}.json?${params}`;
  const res = await withTimeout(fetch(url, { cache: "no-store" }), 3500);
  if (!res.ok) throw new Error(`INVIMA ${res.status}`);
  const rows = (await res.json()) as { producto?: string; principioactivo?: string }[];
  const byProduct = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.producto || !r.principioactivo) continue;
    const set = byProduct.get(r.producto) ?? new Set<string>();
    set.add(canonicalIngredient(r.principioactivo));
    byProduct.set(r.producto, set);
  }
  // "Dolex" also matches Dolex Gripa, Dolex Forte and others; pick the product whose
  // name adds the fewest words to what the caller said.
  const extra = (product: string) =>
    words(product).filter((w) => !terms.includes(w) && !GENERIC_WORDS.has(w) && !/\d/.test(w)).length;
  const best = [...byProduct.entries()].sort(
    ([a, ia], [b, ib]) => extra(a) - extra(b) || ia.size - ib.size || a.length - b.length,
  )[0];
  if (!best) return null;
  return { matched: best[0], ingredients: [...best[1]] };
}

export async function openFdaLookup(name: string) {
  const q = strip(name).replace(/"/g, "");
  if (q.length < 3) return null;
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(q)}"&limit=1`;
  const res = await withTimeout(fetch(url, { cache: "no-store" }), 3500);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`openFDA ${res.status}`);
  const data = (await res.json()) as {
    results?: { openfda?: { brand_name?: string[]; substance_name?: string[]; generic_name?: string[] } }[];
  };
  const of = data.results?.[0]?.openfda;
  if (!of) return null;
  const raw = of.substance_name?.length ? of.substance_name : (of.generic_name?.[0] ?? "").split(/,| and /i);
  const ingredients = [...new Set(raw.map((x) => canonicalIngredient(x)).filter(Boolean))];
  if (!ingredients.length) return null;
  return { matched: of.brand_name?.[0] ?? name, ingredients };
}

export async function lookupMedication(name: string): Promise<MedicationEntry> {
  const [inv, fda] = await Promise.allSettled([invimaLookup(name), openFdaLookup(name)]);
  const pick = (r: PromiseSettledResult<{ matched: string; ingredients: string[] } | null>, source: DataSource) =>
    r.status === "fulfilled" && r.value ? { ...r.value, source } : null;
  const local = brandLookup(name);
  const found = pick(inv, "INVIMA") ?? pick(fda, "openFDA");
  if (found) {
    // Keep the curated ingredient set when the registry returns a partial match
    // (INVIMA rows are one per ingredient and product names can be broad).
    const ingredients = local && !local.every((i) => found.ingredients.includes(i)) ? local : found.ingredients;
    return { reported: name, ingredients, source: found.source, matched: found.matched };
  }
  if (local) return { reported: name, ingredients: local, source: "Brand list" };
  return { reported: name, ingredients: [], source: "Brand list" };
}

export function findDuplicates(meds: MedicationEntry[]) {
  const by = new Map<string, string[]>();
  for (const m of meds)
    for (const i of m.ingredients) by.set(i, [...(by.get(i) ?? []), m.reported]);
  return [...by.entries()]
    .filter(([, names]) => new Set(names.map(strip)).size > 1)
    .map(([ingredient, names]) => ({ ingredient, names: [...new Set(names)] }));
}

export const INGREDIENT_ES: Record<string, string> = {
  acetaminophen: "acetaminofén",
  ibuprofen: "ibuprofeno",
  naproxen: "naproxeno",
  aspirin: "ácido acetilsalicílico",
  loperamide: "loperamida",
  dimenhydrinate: "dimenhidrinato",
  "hyoscine butylbromide": "butilbromuro de hioscina",
  ondansetron: "ondansetrón",
  metoclopramide: "metoclopramida",
  loratadine: "loratadina",
  dextromethorphan: "dextrometorfano",
  doxylamine: "doxilamina",
  phenylephrine: "fenilefrina",
  chlorpheniramine: "clorfeniramina",
  "bismuth subsalicylate": "subsalicilato de bismuto",
  "oral rehydration salts": "sales de rehidratación oral",
  caffeine: "cafeína",
};
