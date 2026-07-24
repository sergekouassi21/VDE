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
