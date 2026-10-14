// Deterministic propensity score, ported from the local Maztrack engine (src/jobs/scoring.js).
// Same weights as the engine's default ICP. The public demo has no France Travail signal
// (hiring), which is why a demo score caps lower than the local cockpit.
import type { Company } from "./registry";
import type { BodaccSignals } from "./bodacc";

export interface Signal {
  key: string;
  points: number;
  detail: string;
}

export interface Scoring {
  score: number;
  excluded: boolean;
  exclusionReason: string | null;
  signals: Signal[];
}

const K = {
  pts_employeur: 18,
  pts_fraicheur: 8,
  pts_age: 15,
  pts_cession: 12,
  pts_modif: 6,
  pts_expansion: 6,
  tres_jeune_mois: 6,
  age_max_mois: 24,
};

function monthsSince(date: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44);
}

export function scoreCompany(c: Company, b: BodaccSignals): Scoring {
  if (b.collectiveProcedure) {
    return {
      score: 0, excluded: true,
      exclusionReason: `procédure collective publiée le ${b.collectiveProcedure.date} (BODACC)`,
      signals: [],
    };
  }
  const signals: Signal[] = [];
  let score = 0;
  const add = (key: string, points: number, detail: string) => {
    signals.push({ key, points, detail });
    score += points;
  };

  if (c.isEmployer) add("employeur", K.pts_employeur, "employeur : cotise OPCO, formation finançable");

  const m = monthsSince(c.createdAt);
  if (m != null) {
    if (m < K.tres_jeune_mois) add("fraicheur", K.pts_fraicheur, `créée il y a ${Math.round(m)} mois`);
    else if (m <= K.age_max_mois) add("age", K.pts_age, `créée il y a ${Math.round(m)} mois (cible < ${K.age_max_mois} mois)`);
    else add("age", 0, `créée il y a ${Math.round(m / 12)} ans`);
  }

  if (b.recentSale) add("dirigeant", K.pts_cession, `cession ou vente publiée le ${b.recentSale.date} (BODACC) : nouveau décideur probable`);
  if (b.recentChange) add("capital", K.pts_modif, `modification publiée le ${b.recentChange.date} (BODACC)`);
  if (c.openSites && c.openSites > 1) add("expansion", K.pts_expansion, `${c.openSites} établissements ouverts`);
  if (c.isRge) add("flag", 4, "label RGE");
  if (c.isQualiopi) {
    add("flag", 0, "Qualiopi : concurrent ou partenaire formation, jamais chaud");
    score = Math.min(score, 25);
  }
  if (!b.available) add("bodacc", 0, "BODACC indisponible pendant cette requête");
  add("recrutement", 0, "signal recrutement (France Travail) non branché dans la démo publique");

  return { score: Math.max(0, Math.min(100, Math.round(score))), excluded: false, exclusionReason: null, signals };
}
