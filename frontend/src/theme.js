// Palette de marque Volailles de l'Est — reprise du logo (vert profond,
// or/jaune du soleil, orange du dégradé de l'œuf).
export const GREEN = "#1E5A38";
export const GREEN_DARK = "#123D26";
export const GOLD = "#E8A93B";
export const ORANGE = "#E07B2A";
export const CREAM = "#FBFAF6";
export const INK = "#1A2420";
export const CLAY = "#C6603A";

export const KG_PAR_SAC = 50;
export const UNITES_PAR_COLIS = 100;
export const UNITES_PAR_ALVEOLE = 30; // 1 alvéole = 30 œufs (conso auto)
export const AGE_REFORME_SEMAINES = 75;
export const OEUFS_PAR_PLATEAU = 30;
export const PLATEAUX_PAR_CARTON = 14;
export const OEUFS_PAR_CARTON = OEUFS_PAR_PLATEAU * PLATEAUX_PAR_CARTON; // 420 — cf. backend/exploitation/calculs.py, garder synchronisé

export function formatSacs(sacs) {
  const entier = Math.floor(sacs);
  const kg = Math.round((sacs - entier) * KG_PAR_SAC);
  return kg > 0 ? `${entier} sacs + ${kg} kg` : `${entier} sacs`;
}

export function formatColis(unites) {
  const colis = Math.floor(unites / UNITES_PAR_COLIS);
  const reste = unites % UNITES_PAR_COLIS;
  return reste > 0 ? `${colis} colis + ${reste} u.` : `${colis} colis`;
}

// Le stock d'œufs est suivi à l'unité en base, mais les ventes se font au
// carton (14 plateaux = 420 œufs) — afficher le stock restant à facturer en
// cartons plutôt qu'en unités brutes évite un chiffre à 5 chiffres illisible
// pour Direction (cf. conversation du 27/07/2026 avec Serge).
export function formatCartons(oeufs) {
  const cartons = Math.floor(oeufs / OEUFS_PAR_CARTON);
  const restePlateaux = Math.floor((oeufs % OEUFS_PAR_CARTON) / OEUFS_PAR_PLATEAU);
  const resteOeufs = oeufs % OEUFS_PAR_PLATEAU;
  const parts = [`${cartons} carton${cartons > 1 ? "s" : ""}`];
  if (restePlateaux > 0) parts.push(`${restePlateaux} plateau${restePlateaux > 1 ? "x" : ""}`);
  if (resteOeufs > 0) parts.push(`${resteOeufs} œuf${resteOeufs > 1 ? "s" : ""}`);
  return parts.join(" + ");
}
