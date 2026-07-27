// Calcul des alertes du tableau de bord — extrait de Dashboard.jsx pour
// être réutilisable par le badge de notification de la nav (App.jsx),
// qui doit produire exactement les mêmes alertes sans dupliquer la
// logique — cf. conversation du 27/07/2026 (point 14 du backlog).
import { AGE_REFORME_SEMAINES, formatSacs, formatColis } from "./theme";

const nf = (v) => (v ?? 0).toLocaleString("fr-FR");
export const JOURS_CREANCE_RETARD = 15;
export const joursDepuis = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const tauxPonte = (f) => (f.dernier_point ? Number(f.dernier_point.taux_ponte) : 0);
const tauxCasseJour = (f) => {
  const p = f.dernier_point?.production_oeufs || 0;
  if (!p) return 0;
  return ((f.dernier_point?.casse || 0) + (f.dernier_point?.brise || 0)) / p * 100;
};

export function calculerAlertes({ fermes, absencesEnAttente = [], employesSansSalaire = [], evenementsSanteEnRetard = [], creancesEnRetard = [] }) {
  const actives = fermes.filter((f) => !f.est_vide);
  const a = [];
  actives.forEach((f) => {
    const age = f.bande_active?.age;
    if (f.type === "PONTE" && f.dernier_point && tauxPonte(f) < 60) {
      a.push({ ferme: f.nom, txt: `Taux de ponte ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
    }
    if (f.type === "PONTE" && f.dernier_point && f.taux_ponte_veille != null && tauxPonte(f) - Number(f.taux_ponte_veille) < -10) {
      a.push({ ferme: f.nom, txt: `Chute brutale du taux de ponte : ${Number(f.taux_ponte_veille).toFixed(0)} % → ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
    }
    if (Number(f.magasin.stock_aliment_sacs) <= Number(f.magasin.seuil_alerte_aliment_sacs)) {
      a.push({ ferme: f.nom, txt: `Aliment bas : ${formatSacs(Number(f.magasin.stock_aliment_sacs))}`, grav: "haut" });
    }
    if (f.type === "PONTE" && f.magasin.stock_alveoles_unites <= f.magasin.seuil_alerte_alveoles_unites) {
      a.push({ ferme: f.nom, txt: `Alvéoles basses : ${formatColis(f.magasin.stock_alveoles_unites)}`, grav: "moy" });
    }
    if (f.dernier_point && f.dernier_point.morts > 5) {
      a.push({ ferme: f.nom, txt: `Mortalité ${f.dernier_point.morts} sujets`, grav: "moy" });
    }
    if (f.type === "PONTE" && age && age.valeur >= AGE_REFORME_SEMAINES) {
      a.push({ ferme: f.nom, txt: `Bande en âge de réforme (${age.label})`, grav: "moy" });
    }
    if (f.type === "PONTE" && f.dernier_point?.production_oeufs > 0 && tauxCasseJour(f) > 5) {
      a.push({ ferme: f.nom, txt: `Taux de casse/brisure élevé (${tauxCasseJour(f).toFixed(1)} %)`, grav: "moy" });
    }
    if (
      f.type === "CHAIR" && f.dernier_point?.poids_moyen_grammes != null && f.dernier_point.poids_cible_grammes != null
      && Number(f.dernier_point.poids_moyen_grammes) < f.dernier_point.poids_cible_grammes * 0.9
    ) {
      a.push({ ferme: f.nom, txt: `Retard de croissance : ${nf(Math.round(f.dernier_point.poids_moyen_grammes))} g pour ${nf(f.dernier_point.poids_cible_grammes)} g attendus`, grav: "moy" });
    }
  });
  if (absencesEnAttente.length > 0) {
    a.unshift({ ferme: "Pointage", txt: `${absencesEnAttente.length} absence${absencesEnAttente.length > 1 ? "s" : ""} en attente de validation`, grav: "haut" });
  }
  employesSansSalaire.forEach((e) => {
    a.push({ ferme: "Paie", txt: `${e.nom} n'a pas de salaire mensuel renseigné`, grav: "moy" });
  });
  evenementsSanteEnRetard.forEach((e) => {
    a.push({ ferme: e.ferme_nom, txt: `${e.type === "VACCIN" ? "Vaccin" : "Traitement"} en retard : ${e.nom} (prévu le ${new Date(e.date_prevue).toLocaleDateString("fr-FR")})`, grav: "haut" });
  });
  creancesEnRetard.forEach((f) => {
    a.push({ ferme: "Créances", txt: `${f.client.nom} doit ${nf(Math.round(f.reste_du))} F depuis ${joursDepuis(f.date)} jours (facture n°${String(f.numero).padStart(7, "0")})`, grav: "moy" });
  });
  return a.sort((x, y) => (x.grav === "haut" ? -1 : 1));
}

export function signatureAlertes(alertes) {
  return alertes.map((a) => `${a.ferme}|${a.txt}`).join("\n");
}
