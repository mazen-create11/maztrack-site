// Official DINUM/Etalab company registry. Free, no key, 7 req/s per IP.
// https://recherche-entreprises.api.gouv.fr/docs/
const BASE = "https://recherche-entreprises.api.gouv.fr/search";
const UA = "Maztrack-Radar/0.2 (+https://maztrack.tech)";

export interface Company {
  siren: string;
  name: string;
  naf: string | null;
  nafSection: string | null;
  createdAt: string | null;
  headcountBand: string | null;
  legalForm: string | null;
  isEmployer: boolean;
  isQualiopi: boolean;
  isTrainingOrg: boolean;
  isRge: boolean;
  isEss: boolean;
  isSoleTrader: boolean;
  nonDisclosable: boolean;
  city: string | null;
  postalCode: string | null;
  department: string | null;
  openSites: number | null;
  executive: { lastName: string | null; firstName: string | null; role: string | null };
  latestRevenue: { year: string; revenue: number | null; netResult: number | null } | null;
  idcc: string[];
}

export interface Candidate {
  siren: string;
  name: string;
  city: string | null;
  naf: string | null;
}

export const HEADCOUNT_LABEL: Record<string, string> = {
  NN: "non employeur", "00": "0 salarié", "01": "1-2", "02": "3-5", "03": "6-9",
  "11": "10-19", "12": "20-49", "21": "50-99", "22": "100-199", "31": "200-249",
  "32": "250-499", "41": "500-999", "42": "1000-1999", "51": "2000-4999",
  "52": "5000-9999", "53": "10000+",
};

function pickExecutive(list: any[]): Company["executive"] {
  if (!Array.isArray(list) || list.length === 0) return { lastName: null, firstName: null, role: null };
  const person = list.find((d) => String(d.type_dirigeant || "").toLowerCase().includes("physique") || d.nom);
  if (person) {
    return { lastName: person.nom || null, firstName: person.prenoms || person.prenom || null, role: person.qualite || null };
  }
  const entity = list[0];
  return { lastName: entity.denomination || entity.sigle || null, firstName: null, role: entity.qualite || null };
}

function latestFinances(finances: any): Company["latestRevenue"] {
  if (!finances || typeof finances !== "object") return null;
  const years = Object.keys(finances).filter((y) => /^\d{4}$/.test(y)).sort();
  if (!years.length) return null;
  const year = years[years.length - 1];
  const row = finances[year] || {};
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
  return { year, revenue: num(row.ca ?? row.chiffre_affaires), netResult: num(row.resultat_net) };
}

/** "LE SLIP FRANCAIS (LE SLIP FRANCAIS) (LSF)" -> "LE SLIP FRANCAIS (LSF)". */
export function cleanName(raw: string): string {
  let name = String(raw || "").trim();
  const m = name.match(/^(.+?)\s+\((.+?)\)(.*)$/);
  if (m && m[1].trim().toUpperCase() === m[2].trim().toUpperCase()) name = `${m[1].trim()}${m[3]}`.trim();
  return name.replace(/\s{2,}/g, " ");
}

const NON_EMPLOYER_BANDS = new Set(["NN", "00"]);

export function mapCompany(r: any): Company {
  const siege = r.siege || {};
  const comp = r.complements || {};
  const cp: string | null = siege.code_postal || null;
  const emp = siege.caractere_employeur ?? r.caractere_employeur;
  const band: string | null = r.tranche_effectif_salarie || null;
  // The registry often leaves caractere_employeur empty; a headcount band above zero is proof enough.
  const isEmployer = emp === "O" || emp === true || (band != null && !NON_EMPLOYER_BANDS.has(band));
  return {
    siren: r.siren,
    name: cleanName(r.nom_complet || r.nom_raison_sociale || ""),
    naf: r.activite_principale || null,
    nafSection: r.section_activite_principale || null,
    createdAt: r.date_creation || null,
    headcountBand: band,
    legalForm: r.nature_juridique || null,
    isEmployer,
    isQualiopi: !!comp.est_qualiopi,
    isTrainingOrg: !!comp.est_organisme_formation,
    isRge: !!comp.est_rge,
    isEss: !!comp.est_ess,
    isSoleTrader: !!comp.est_entrepreneur_individuel,
    nonDisclosable: r.statut_diffusion ? r.statut_diffusion !== "O" : false,
    city: siege.libelle_commune || null,
    postalCode: cp,
    department: siege.departement || (cp ? cp.slice(0, 2) : null),
    openSites: r.nombre_etablissements_ouverts ?? r.nombre_etablissements ?? null,
    executive: pickExecutive(r.dirigeants),
    latestRevenue: latestFinances(r.finances),
    idcc: Array.isArray(comp.liste_idcc) ? comp.liste_idcc : [],
  };
}

export async function searchCompanies(query: string): Promise<{ companies: Company[]; candidates: Candidate[] }> {
  const params = new URLSearchParams({ q: query, per_page: "5", page: "1", etat_administratif: "A" });
  const res = await fetch(`${BASE}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`registry ${res.status}`);
  const data: any = await res.json();
  const results: any[] = Array.isArray(data.results) ? data.results : [];
  const companies = results.map(mapCompany).filter((c) => c.siren && c.name);
  const candidates = companies.map((c) => ({ siren: c.siren, name: c.name, city: c.city, naf: c.naf }));
  return { companies, candidates };
}
