// BODACC (official French legal notices) through Opendatasoft. Free, no key.
const BASE = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

export interface Notice {
  date: string;
  family: string;
  type: string;
}

export interface BodaccSignals {
  notices: Notice[];
  collectiveProcedure: Notice | null;
  recentSale: Notice | null;
  recentChange: Notice | null;
  lastAccountsFiled: Notice | null;
  available: boolean;
}

function daysAgo(date: string): number {
  return (Date.now() - new Date(date).getTime()) / 86_400_000;
}

/** Best effort: the demo must still work when BODACC is slow or down. */
export async function fetchBodacc(siren: string): Promise<BodaccSignals> {
  const empty: BodaccSignals = {
    notices: [], collectiveProcedure: null, recentSale: null, recentChange: null, lastAccountsFiled: null, available: false,
  };
  try {
    const params = new URLSearchParams({
      where: `search(registre,"${siren}")`,
      select: "dateparution,familleavis_lib,typeavis_lib",
      order_by: "dateparution desc",
      limit: "12",
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${BASE}?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const data: any = await res.json();
    const notices: Notice[] = (data.results || []).map((r: any) => ({
      date: r.dateparution,
      family: r.familleavis_lib || "",
      type: r.typeavis_lib || "",
    }));
    const find = (family: string, maxDays: number) =>
      notices.find((n) => n.family === family && daysAgo(n.date) <= maxDays) || null;
    return {
      notices,
      collectiveProcedure: find("Procédures collectives", 365),
      recentSale: find("Ventes et cessions", 180),
      recentChange: find("Modifications diverses", 120),
      lastAccountsFiled: notices.find((n) => n.family === "Dépôts des comptes") || null,
      available: true,
    };
  } catch {
    return empty;
  }
}
