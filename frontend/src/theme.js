// Palette de marque Volailles de l'Est — reprise du logo (vert profond,
// or/jaune du soleil, orange du dégradé de l'œuf).
export const GREEN = "#1E5A38";
export const GREEN_DARK = "#123D26";
export const GOLD = "#E8A93B";
export const ORANGE = "#E07B2A";
export const CREAM = "#FBFAF6";
export const INK = "#1A2420";
export const CLAY = "#C6603A";

// --- Neutres et couleurs d'état ---------------------------------------------
// Ces 14 valeurs représentaient l'essentiel des 420 couleurs écrites en dur
// dans les pages : la même teinte était réécrite à la main d'un écran à
// l'autre, sans qu'on puisse ni la retrouver ni la changer d'un seul geste.
// Cf. analyse du 05/08/2026.
//
// ATTENTION — trois paires sont volontairement conservées distinctes alors
// qu'elles sont presque identiques :
//   TEXTE_DOUX / TEXTE_META / TEXTE_GRIS   (trois gris très proches)
//   FOND_PAGE / FOND_PAGE_ALT              (deux fonds de page)
// Les unifier CHANGERAIT le rendu de certains écrans. C'est une décision de
// design, pas un nettoyage technique — à trancher en regardant l'appli, pas
// le code.

export const TEXTE_DOUX = "#8A948D";    // gris-vert clair, légendes et libellés secondaires
export const TEXTE_META = "#7A857F";    // gris-vert moyen, métadonnées de liste
export const TEXTE_GRIS = "#6B756E";    // gris-vert soutenu, texte courant atténué
export const TEXTE_SOMBRE = "#5A655F";  // gris-vert foncé, texte atténué sur fond clair

export const BORD = "#ECE9DF";          // filet beige, séparateurs et contours de carte
export const BORD_FORT = "#DAD5C7";     // filet beige marqué, contours de champ
export const BORD_GRIS = "#DDE2DE";     // filet gris, contours neutres

export const FOND_PAGE = "#F4F1EA";     // fond général d'écran
export const FOND_PAGE_ALT = "#F1EEE6"; // variante de fond d'écran
export const FOND_DOUX = "#F2F0E8";     // fond de bloc à l'intérieur d'une carte
export const FOND_CARTE = "#FCFCFA";    // fond de champ de saisie

export const ALERTE = "#9E4527";        // texte d'alerte / d'erreur
export const ALERTE_FOND = "#FDEEE8";   // fond d'alerte / d'erreur
export const VERT_FOND = "#EAF3EE";     // fond de pastille verte (succès, rôle)

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
