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

export function calculerAlertes({ fermes, absencesEnAttente = [], employesSansSalaire = [], evenementsSanteEnRetard = [], creancesEnRetard = [], pointagesSecoursRecents = [] }) {
  const actives = fermes.filter((f) => !f.est_vide);
  const a = [];
  actives.forEach((f) => {
    const age = f.bande_active?.age;
    if (f.dernier_point && joursDepuis(f.dernier_point.date) > 1) {
      a.push({ ferme: f.nom, txt: `Aucune saisie depuis ${joursDepuis(f.dernier_point.date)} jours (dernière le ${new Date(f.dernier_point.date).toLocaleDateString("fr-FR")})`, grav: "haut" });
    }
    if (f.dernier_point?.urgent) {
      a.push({ ferme: f.nom, txt: `Signalement urgent du ${new Date(f.dernier_point.date).toLocaleDateString("fr-FR")}${f.dernier_point.observation ? ` : ${f.dernier_point.observation}` : ""}`, grav: "haut" });
    }
    if (f.type === "PONTE" && f.dernier_point && tauxPonte(f) < 60) {
      a.push({ ferme: f.nom, txt: `Taux de ponte ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
    }
    // La chute "brutale" ne veut dire quelque chose que si les deux points
    // comparés sont bien des jours consécutifs — sinon un trou dans
    // l'historique compare deux jours éloignés et fausse l'ampleur réelle
    // de la variation (point 20 du backlog, cf. conversation du 27/07/2026).
    const joursEcart = f.taux_ponte_veille_date ? joursDepuis(f.taux_ponte_veille_date) - joursDepuis(f.dernier_point?.date) : null;
    if (f.type === "PONTE" && f.dernier_point && f.taux_ponte_veille != null && tauxPonte(f) - Number(f.taux_ponte_veille) < -10) {
      if (joursEcart === 1) {
        a.push({ ferme: f.nom, txt: `Chute brutale du taux de ponte : ${Number(f.taux_ponte_veille).toFixed(0)} % → ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
      } else {
        a.push({ ferme: f.nom, txt: `Écart de taux de ponte sur ${joursEcart} jours (saisies non consécutives) : ${Number(f.taux_ponte_veille).toFixed(0)} % → ${tauxPonte(f).toFixed(0)} %`, grav: "moy" });
      }
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
  // Le badge de secours n'a aucun jeton personnel à vérifier — signaler son
  // usage récent plutôt que de le laisser invisible sauf revue manuelle de
  // l'historique (cf. conversation du 29/07/2026 avec Serge).
  pointagesSecoursRecents.forEach((p) => {
    const via = [p.arrivee_via_secours && "arrivée", p.depart_via_secours && "départ"].filter(Boolean).join(" et ");
    a.push({ ferme: "Pointage", txt: `Badge de secours utilisé pour ${p.employe_nom} (${via}, ${new Date(p.date).toLocaleDateString("fr-FR")})`, grav: "moy" });
  });
  return a.sort((x, y) => (x.grav === "haut" ? -1 : 1));
}

export function signatureAlertes(alertes) {
  return alertes.map((a) => `${a.ferme}|${a.txt}`).join("\n");
}
