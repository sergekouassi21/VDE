import jsPDF from "jspdf";
import { formatSacs, formatColis } from "../theme";
import { LOGO_BASE64 } from "./logoBase64";

// Les polices standard de jsPDF (WinAnsi) n'ont pas le glyphe de l'espace
// insécable utilisé par toLocaleString("fr-FR") pour séparer les milliers —
// ça s'affichait comme un "/" dans le PDF. On formate donc à la main avec
// un espace normal.
function separeMilliers(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
const fcfa = (v) => separeMilliers(Number(v) || 0) + " F";
const nf = (v) => separeMilliers(Number(v) || 0);

const GREEN_DARK = [18, 61, 38];
const INK = [26, 36, 32];
const GRAY = [122, 133, 127];
const CLAY = [198, 96, 58];
const ROW_ALT = [244, 241, 234];

const LABEL_PRODUIT = {
  OEUF_CARTON: "Œufs — carton (14 plateaux)",
  OEUF_PLATEAU: "Œufs — plateau",
  CHAIR_UNITE: "Poulet de chair — unité",
  CHAIR_KG: "Poulet de chair — au kilo",
  REFORME: "Pondeuse de réforme",
};
const UNITE_PRODUIT = {
  OEUF_CARTON: "carton", OEUF_PLATEAU: "plateau", CHAIR_UNITE: "tête", CHAIR_KG: "kg", REFORME: "tête",
};
const PRIX_UNITE_PRODUIT = {
  OEUF_CARTON: "plateau", OEUF_PLATEAU: "plateau", CHAIR_UNITE: "tête", CHAIR_KG: "kg", REFORME: "tête",
};

function entete(doc, sousTitre) {
  try {
    doc.addImage(LOGO_BASE64, "PNG", 15, 8, 16, 16);
  } catch {
    // pas bloquant si l'image ne peut pas être décodée
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...GREEN_DARK);
  doc.text("VOLAILLES DE L'EST", 105, 18, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(sousTitre || "Agnibilékrou", 105, 24, { align: "center" });
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.2);
  doc.line(15, 30, 195, 30);
}

function bandeauSection(doc, y, titre) {
  doc.setFillColor(...GREEN_DARK);
  doc.rect(15, y - 5, 180, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(titre.toUpperCase(), 18, y);
  return y + 9;
}

// Une vente groupée (œufs, chair à l'unité, réforme) peut être répartie par
// le serveur entre plusieurs fermes (FIFO) — le client ne s'intéresse pas à
// cette répartition interne, donc la facture imprimée recompose une seule
// ligne par produit/prix (cf. conversation du 27/07/2026 avec Serge).
function consoliderLignesFacture(lignes) {
  const parCle = new Map();
  lignes.forEach((l) => {
    const cle = `${l.type_produit}|${l.prix_unitaire}`;
    const existante = parCle.get(cle);
    if (existante) {
      existante.quantite = Number(existante.quantite) + Number(l.quantite);
      existante.montant = Number(existante.montant) + Number(l.montant);
    } else {
      parCle.set(cle, { ...l });
    }
  });
  return Array.from(parCle.values());
}

function ligneCle(doc, y, label, valeur) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(label, 18, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(String(valeur), 192, y, { align: "right" });
  return y + 7;
}

export function genererPdfFacture(facture) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc, "Agnibilékrou — La fraîcheur de l'Est, de notre ferme à votre table");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(`Facture N° ${String(facture.numero).padStart(7, "0")}`, 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(`Date : ${new Date(facture.date).toLocaleDateString("fr-FR")}`, 15, 49);
  doc.text(`Client : ${facture.client.nom}`, 15, 55);
  if (facture.client.telephone) doc.text(`Téléphone : ${facture.client.telephone}`, 15, 61);

  const lignesConsolidees = consoliderLignesFacture(facture.lignes);

  let y = 74;
  doc.setFillColor(...GREEN_DARK);
  doc.rect(15, y - 5.5, 180, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Désignation", 18, y);
  doc.text("P.U.", 150, y, { align: "right" });
  doc.text("Total", 192, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  lignesConsolidees.forEach((l, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(15, y - 5, 180, 7, "F");
    }
    const unite = UNITE_PRODUIT[l.type_produit];
    const qte = Number(l.quantite);
    const desig = `${nf(qte)} ${unite}${qte > 1 && unite !== "kg" ? "s" : ""} — ${LABEL_PRODUIT[l.type_produit]}`;
    doc.setTextColor(...INK);
    doc.text(desig, 18, y, { maxWidth: 124 });
    doc.text(`${fcfa(l.prix_unitaire)}/${PRIX_UNITE_PRODUIT[l.type_produit]}`, 150, y, { align: "right" });
    doc.text(fcfa(l.montant), 192, y, { align: "right" });
    y += 7;
  });

  y += 3;
  doc.setDrawColor(...GRAY);
  doc.line(15, y, 195, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text("Total", 150, y, { align: "right" });
  doc.text(fcfa(facture.montant_total), 192, y, { align: "right" });
  y += 10;

  const statut = facture.mode_paiement === "COMPTANT" ? "PAYÉ COMPTANT"
    : facture.mode_paiement === "DOIT" ? "CRÉDIT (DOIT)"
    : `PARTIEL — versé ${fcfa(facture.montant_verse)}`;
  doc.setFontSize(11);
  doc.setTextColor(...GREEN_DARK);
  doc.text(statut, 15, y);

  if (Number(facture.reste_du) > 0) {
    y += 8;
    doc.setTextColor(...CLAY);
    doc.setFont("helvetica", "bold");
    doc.text(`Reste dû : ${fcfa(facture.reste_du)}`, 15, y);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Merci de votre confiance !", 105, 285, { align: "center" });

  return doc;
}

export function genererPdfPointJournalier({ ferme, bande, dateJour, form, calc, sorties, totalSorties }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc);

  const dateAffiche = new Date(dateJour).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text("Point Journalier", 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(`Ferme : ${ferme.nom} (${ferme.type === "PONTE" ? "Pondeuses" : "Chair"})`, 15, 49);
  doc.text(`Date : ${dateAffiche}`, 15, 55);
  doc.text(`Bande : ${bande.age.label} · ${bande.age.valeur} ${bande.age.unite}`, 15, 61);

  let y = 74;
  y = bandeauSection(doc, y, "Cheptel");
  y = ligneCle(doc, y, "Morts", `${nf(form.morts || 0)} sujets`);
  y = ligneCle(doc, y, "Effectif restant", `${nf(calc.resteEffectif)} sujets`);

  y = bandeauSection(doc, y + 2, "Aliment");
  y = ligneCle(doc, y, "Consommé", `${form.conso_aliment_sacs || 0} sacs`);
  y = ligneCle(doc, y, "Reçu", `${form.aliment_recu_sacs || 0} sacs`);
  y = ligneCle(doc, y, "Stock restant", formatSacs(calc.stockAlimentSacs));
  if (form.traitement) y = ligneCle(doc, y, "Traitement", form.traitement);
  if (Number(form.eau_consommee_litres) > 0) y = ligneCle(doc, y, "Eau consommée", `${form.eau_consommee_litres} litres`);

  if (ferme.type === "PONTE") {
    y = bandeauSection(doc, y + 2, "Alvéoles");
    y = ligneCle(doc, y, "Reçu", `${form.alveole_recu_unites || 0} colis`);
    y = ligneCle(doc, y, "Consommé", `${nf(form.alveole_conso_unites || 0)} unités`);
    y = ligneCle(doc, y, "Stock restant", formatColis(calc.stockAlveole));

    y = bandeauSection(doc, y + 2, "Production œufs");
    y = ligneCle(doc, y, "Production", `${nf(form.production_oeufs || 0)} œufs`);
    y = ligneCle(doc, y, "Cassé", `${nf(form.casse || 0)} œufs`);
    y = ligneCle(doc, y, "Brisé", `${nf(form.brise || 0)} œufs`);
    y = ligneCle(doc, y, "Taux de ponte", `${calc.tauxPonte.toFixed(1)} %`);

    y = bandeauSection(doc, y + 2, "Sorties d'œufs");
    if (sorties.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY);
      doc.text("Aucune sortie", 18, y);
      y += 7;
    } else {
      sorties.forEach((s) => {
        y = ligneCle(doc, y, `${s.type_sortie === "VENTE" ? "Vente" : "Don"} — ${s.responsable}`, `${nf(s.quantite)} œufs`);
      });
    }
    y = ligneCle(doc, y, "Total sorties", `${nf(totalSorties)} œufs`);
    y = ligneCle(doc, y, "Stock total œuf", `${nf(calc.stockTotal)} œufs`);
  }

  if (form.observation) {
    y = bandeauSection(doc, y + 2, "Observation");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(form.observation, 18, y, { maxWidth: 174 });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Volailles de l'Est", 105, 285, { align: "center" });

  return doc;
}

// Variante pour un point déjà enregistré (onglet Historique) — toutes les
// valeurs viennent directement du point stocké, pas d'un formulaire en cours
// de saisie ni d'un recalcul côté client.
export function genererPdfHistoriquePoint(p) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text("Point Journalier", 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(`Ferme : ${p.ferme_nom}`, 15, 49);
  doc.text(`Date : ${new Date(p.date).toLocaleDateString("fr-FR")}`, 15, 55);

  let y = 70;
  y = bandeauSection(doc, y, "Cheptel");
  y = ligneCle(doc, y, "Morts", `${nf(p.morts)} sujets`);
  y = ligneCle(doc, y, "Effectif restant", `${nf(p.effectif_reste)} sujets`);
  if (Number(p.sortie_effectif) > 0) y = ligneCle(doc, y, "Sorties d'effectif", `${nf(p.sortie_effectif)} sujets`);

  y = bandeauSection(doc, y + 2, "Aliment");
  y = ligneCle(doc, y, "Consommé", `${p.conso_aliment_sacs} sacs`);
  y = ligneCle(doc, y, "Reçu", `${p.aliment_recu_sacs} sacs`);
  y = ligneCle(doc, y, "Stock après", formatSacs(Number(p.stock_aliment_apres_sacs)));
  if (p.traitement) y = ligneCle(doc, y, "Traitement", p.traitement);
  if (Number(p.eau_consommee_litres) > 0) y = ligneCle(doc, y, "Eau consommée", `${p.eau_consommee_litres} litres`);

  y = bandeauSection(doc, y + 2, "Alvéoles");
  y = ligneCle(doc, y, "Reçu", formatColis(p.alveole_recu_unites));
  y = ligneCle(doc, y, "Consommé", `${nf(p.alveole_conso_unites)} unités`);
  y = ligneCle(doc, y, "Stock après", formatColis(p.stock_alveole_apres_unites));

  y = bandeauSection(doc, y + 2, "Production œufs");
  y = ligneCle(doc, y, "Production", `${nf(p.production_oeufs)} œufs`);
  y = ligneCle(doc, y, "Cassé", `${nf(p.casse)} œufs`);
  y = ligneCle(doc, y, "Brisé", `${nf(p.brise)} œufs`);
  y = ligneCle(doc, y, "Taux de ponte", `${Number(p.taux_ponte).toFixed(1)} %`);

  y = bandeauSection(doc, y + 2, "Sorties d'œufs");
  if (p.sorties.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text("Aucune sortie", 18, y);
    y += 7;
  } else {
    p.sorties.forEach((s) => {
      y = ligneCle(doc, y, `${s.type_sortie === "VENTE" ? "Vente" : "Don"} — ${s.responsable}`, `${nf(s.quantite)} œufs`);
    });
  }
  y = ligneCle(doc, y, "Total sorties", `${nf(p.sortie_oeuf)} œufs`);
  y = ligneCle(doc, y, "Stock total œuf", `${nf(p.stock_oeuf_total)} œufs`);

  if (p.observation) {
    y = bandeauSection(doc, y + 2, "Observation");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(p.observation, 18, y, { maxWidth: 174 });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Volailles de l'Est", 105, 285, { align: "center" });

  return doc;
}

const LABEL_MOTIF_FIN = {
  REFORME: "Réforme", TRANSFERT: "Transfert vers une autre ferme", MORTALITE_TOTALE: "Mortalité totale",
};

// Bilan de clôture d'un cycle de bande — performance zootechnique
// (mortalité, ponte ou poids/GMQ, indice de consommation) et contexte
// financier (coût aliment au prix réel, revenus des ventes de la période).
export function genererBilanBande(bilan) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(`Bilan de clôture — ${bilan.ferme_nom}`, 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(`Mise en place : ${new Date(bilan.date_mise_en_place).toLocaleDateString("fr-FR")}`, 15, 49);
  doc.text(`Fin de cycle : ${new Date(bilan.date_fin).toLocaleDateString("fr-FR")} (${bilan.duree_jours} jours)`, 15, 55);
  if (bilan.motif_fin) doc.text(`Motif : ${LABEL_MOTIF_FIN[bilan.motif_fin] || bilan.motif_fin}`, 15, 61);

  let y = 74;
  y = bandeauSection(doc, y, "Cheptel");
  y = ligneCle(doc, y, "Effectif initial", `${nf(bilan.effectif_initial)} sujets`);
  y = ligneCle(doc, y, "Effectif final", `${nf(bilan.effectif_final)} sujets`);
  y = ligneCle(doc, y, "Total mortalité", `${nf(bilan.total_morts)} sujets`);
  y = ligneCle(doc, y, "Taux de mortalité du cycle", `${bilan.taux_mortalite.toFixed(2)} %`);
  if (Number(bilan.total_sortie_effectif) > 0) y = ligneCle(doc, y, "Sorties d'effectif (ventes/réforme)", `${nf(bilan.total_sortie_effectif)} sujets`);

  if (bilan.type_ferme === "PONTE") {
    y = bandeauSection(doc, y + 2, "Ponte");
    y = ligneCle(doc, y, "Production totale", `${nf(bilan.total_production_oeufs)} œufs`);
    y = ligneCle(doc, y, "Taux de ponte moyen du cycle", `${bilan.taux_ponte_moyen.toFixed(2)} %`);
    y = ligneCle(doc, y, "Cassé / brisé (total)", `${nf(bilan.total_casse)} / ${nf(bilan.total_brise)} œufs`);
  } else {
    y = bandeauSection(doc, y + 2, "Croissance");
    y = ligneCle(doc, y, "Poids initial (1ère pesée)", bilan.poids_initial_grammes ? `${nf(bilan.poids_initial_grammes)} g` : "—");
    y = ligneCle(doc, y, "Poids final (dernière pesée)", bilan.poids_final_grammes ? `${nf(bilan.poids_final_grammes)} g` : "—");
    y = ligneCle(doc, y, "GMQ moyen du cycle", bilan.gmq_moyen_grammes != null ? `${nf(bilan.gmq_moyen_grammes)} g/j` : "—");
  }

  y = bandeauSection(doc, y + 2, "Aliment");
  y = ligneCle(doc, y, "Total consommé", `${bilan.total_aliment_sacs} sacs`);
  y = ligneCle(doc, y, "Prix moyen du sac", fcfa(bilan.prix_sac_moyen));
  y = ligneCle(doc, y, "Coût aliment total", fcfa(bilan.cout_aliment_total));
  const ic = bilan.type_ferme === "PONTE" ? bilan.ic_global_g_par_oeuf : bilan.ic_global_kg_par_kg;
  const icLabel = bilan.type_ferme === "PONTE" ? "Indice de consommation (g/œuf)" : "Indice de consommation (kg aliment/kg vif)";
  if (ic != null) y = ligneCle(doc, y, icLabel, bilan.type_ferme === "PONTE" ? `${nf(ic)} g` : `${ic}`);

  y = bandeauSection(doc, y + 2, "Financier");
  y = ligneCle(doc, y, "Revenus des ventes (période du cycle)", fcfa(bilan.revenus_ventes));

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Volailles de l'Est", 105, 285, { align: "center" });

  return doc;
}

const MOIS_LABEL = (iso) => new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

// Rapport mensuel consolidé — synthèse zootechnique + financière de toutes
// les fermes visibles pour un mois donné, en un seul document plutôt que
// de devoir croiser Tableau de bord / Rentabilité / Achats d'aliment.
export function genererRapportMensuel(rapport) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(`Rapport mensuel consolidé — ${MOIS_LABEL(rapport.mois)}`, 15, 42);

  let y = 58;
  y = bandeauSection(doc, y, "Total — toutes fermes");
  y = ligneCle(doc, y, "Revenus des ventes", fcfa(rapport.total.revenus));
  y = ligneCle(doc, y, "Coût aliment", fcfa(rapport.total.cout_aliment));
  y = ligneCle(doc, y, "Coût paie", fcfa(rapport.total.cout_paie));
  y = ligneCle(doc, y, "Marge", fcfa(rapport.total.marge));
  y = ligneCle(doc, y, "Mortalité totale", `${nf(rapport.total.total_morts)} sujets`);
  y = ligneCle(doc, y, "Production d'œufs totale", `${nf(rapport.total.total_production_oeufs)} œufs`);

  rapport.fermes.forEach((f) => {
    if (y > 230) {
      doc.addPage();
      entete(doc);
      y = 42;
    } else {
      y += 4;
    }
    y = bandeauSection(doc, y, `${f.ferme_nom} — ${f.type_ferme === "PONTE" ? "Pondeuses" : "Chair"}`);
    y = ligneCle(doc, y, "Mortalité", `${nf(f.total_morts)} sujets`);
    if (f.type_ferme === "PONTE") {
      y = ligneCle(doc, y, "Production", `${nf(f.total_production_oeufs)} œufs`);
      y = ligneCle(doc, y, "Taux de ponte moyen", `${f.taux_ponte_moyen.toFixed(2)} %`);
      y = ligneCle(doc, y, "Cassé / brisé", `${nf(f.total_casse)} / ${nf(f.total_brise)} œufs`);
      if (f.ic_g_par_oeuf != null) y = ligneCle(doc, y, "Indice de consommation", `${nf(f.ic_g_par_oeuf)} g/œuf`);
    } else {
      y = ligneCle(doc, y, "Poids début / fin de mois", `${f.poids_debut_grammes ? nf(f.poids_debut_grammes) + " g" : "—"} / ${f.poids_fin_grammes ? nf(f.poids_fin_grammes) + " g" : "—"}`);
      y = ligneCle(doc, y, "GMQ moyen", f.gmq_moyen_grammes != null ? `${nf(f.gmq_moyen_grammes)} g/j` : "—");
    }
    y = ligneCle(doc, y, "Aliment consommé", `${f.total_aliment_sacs} sacs${f.prix_sac ? ` (${fcfa(f.prix_sac)}/sac)` : ""}`);
    y = ligneCle(doc, y, "Coût aliment", fcfa(f.cout_aliment));
    y = ligneCle(doc, y, "Coût paie", fcfa(f.cout_paie));
    y = ligneCle(doc, y, "Revenus des ventes", fcfa(f.revenus));
    y = ligneCle(doc, y, "Marge", fcfa(f.marge));
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Volailles de l'Est", 105, 285, { align: "center" });

  return doc;
}

const LABEL_MODE_PAIEMENT_PDF = {
  WAVE: "Wave", ORANGE_MONEY: "Orange Money", MTN_MONEY: "MTN Money",
  MOOV_MONEY: "Moov Money", ESPECES: "Main en main", VIREMENT: "Virement bancaire",
};

// Fiche de paie d'un employé pour une période — fusionne jours travaillés
// (pointages) et absences justifiées (payées comme une journée complète)
// en une liste chronologique, ajoute les ajustements du mois (frais,
// primes, avances, retenues, carburant, appel/internet) et le suivi du
// paiement (mode, référence, statut), puis liste séparément les absences
// injustifiées (non payées) pour que le calcul reste traçable plutôt
// qu'un manque à gagner silencieux. Pagine si le mois est long.
export function genererFichePaie(employe, periodeLabel, lignes, absencesJustifiees = [], joursAbsenceInjustifiee = [], lignePaie = null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entete(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text("Fiche de paie", 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(`Employé : ${employe.nom}${employe.role ? " — " + employe.role : ""}`, 15, 49);
  doc.text(`Ferme : ${employe.ferme_nom}`, 15, 55);
  doc.text(`Période : ${periodeLabel}`, 15, 61);
  if (employe.telephone) doc.text(`Téléphone : ${employe.telephone}`, 15, 67);

  const heureTxt = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

  function entetesColonnes(y) {
    doc.setFillColor(...GREEN_DARK);
    doc.rect(15, y - 5.5, 180, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("Date", 18, y);
    doc.text("Arrivée / motif", 75, y);
    doc.text("Départ", 130, y);
    doc.text("Heures", 155, y, { align: "right" });
    doc.text("Montant", 192, y, { align: "right" });
    return y + 8;
  }

  const lignesFusionnees = [
    ...lignes.map((l) => ({ type: "travail", date: l.date, arrivee: heureTxt(l.heure_debut), depart: heureTxt(l.heure_fin), heures: Number(l.heures_travaillees) || 0, montant: Number(l.montant_du_jour) || 0 })),
    ...absencesJustifiees.map((a) => ({ type: "absence", date: a.date, arrivee: `Absence justifiée${a.motif ? " — " + a.motif : ""}`, depart: "", heures: 0, montant: Number(a.montant) || 0 })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let y = entetesColonnes(employe.telephone ? 80 : 74);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let totalHeures = 0;
  let totalMontant = 0;

  lignesFusionnees.forEach((l, i) => {
    if (y > 270) {
      doc.addPage();
      entete(doc);
      y = entetesColonnes(42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(15, y - 5, 180, 7, "F");
    }
    doc.setTextColor(...INK);
    doc.text(new Date(l.date).toLocaleDateString("fr-FR"), 18, y);
    doc.text(l.arrivee, 75, y, { maxWidth: l.type === "absence" ? 75 : 50 });
    if (l.type === "travail") doc.text(l.depart, 130, y);
    doc.text(l.type === "travail" ? `${l.heures} h` : "—", 155, y, { align: "right" });
    doc.text(fcfa(l.montant), 192, y, { align: "right" });
    totalHeures += l.heures;
    totalMontant += l.montant;
    y += 7;
  });

  y += 3;
  doc.setDrawColor(...GRAY);
  doc.line(15, y, 195, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(`Sous-total pointage : ${totalHeures.toFixed(2)} h`, 15, y);
  doc.text(fcfa(totalMontant), 192, y, { align: "right" });
  y += 10;

  let netAPayer = totalMontant;
  if (lignePaie) {
    if (y > 250) { doc.addPage(); entete(doc); y = 42; }
    y = bandeauSection(doc, y, "Ajustements du mois");
    const frais = Number(lignePaie.frais) || 0;
    const primes = Number(lignePaie.primes) || 0;
    const avances = Number(lignePaie.avances) || 0;
    const retenues = Number(lignePaie.retenues) || 0;
    const carburant = Number(lignePaie.carburant) || 0;
    const appelInternet = Number(lignePaie.appel_internet) || 0;
    if (frais) y = ligneCle(doc, y, "Frais", fcfa(frais));
    if (primes) y = ligneCle(doc, y, "Primes", fcfa(primes));
    if (carburant) y = ligneCle(doc, y, "Carburant", fcfa(carburant));
    if (appelInternet) y = ligneCle(doc, y, "Appel / internet", fcfa(appelInternet));
    if (avances) y = ligneCle(doc, y, "Avances", `- ${fcfa(avances)}`);
    if (retenues) y = ligneCle(doc, y, "Retenues", `- ${fcfa(retenues)}`);
    netAPayer += frais + primes + carburant + appelInternet - avances - retenues;

    y += 2;
    doc.setDrawColor(...GRAY);
    doc.line(15, y, 195, y);
    y += 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text("Net à payer", 15, y);
    doc.text(fcfa(netAPayer), 192, y, { align: "right" });
    y += 10;

    const resteAPayer = lignePaie.statut === "PAYE" ? 0 : netAPayer;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...GRAY);
    if (lignePaie.mode_paiement) y = ligneCle(doc, y, "Mode de paiement", LABEL_MODE_PAIEMENT_PDF[lignePaie.mode_paiement] || lignePaie.mode_paiement);
    if (lignePaie.reference_transaction) y = ligneCle(doc, y, "Référence transaction", lignePaie.reference_transaction);
    if (lignePaie.date_paiement) y = ligneCle(doc, y, "Date de paiement", new Date(lignePaie.date_paiement).toLocaleDateString("fr-FR"));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...(lignePaie.statut === "PAYE" ? GREEN_DARK : CLAY));
    doc.text(lignePaie.statut === "PAYE" ? "PAYÉ" : "À PAYER", 15, y);
    if (resteAPayer > 0) doc.text(`Reste à payer : ${fcfa(resteAPayer)}`, 192, y, { align: "right" });
    y += 10;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text("Net à payer", 15, y);
    doc.text(fcfa(netAPayer), 192, y, { align: "right" });
    y += 10;
  }

  if (joursAbsenceInjustifiee.length > 0) {
    if (y > 260) { doc.addPage(); entete(doc); y = 42; }
    y = bandeauSection(doc, y, "Absences injustifiées (non payées)");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...CLAY);
    const texte = joursAbsenceInjustifiee.map((d) => new Date(d).toLocaleDateString("fr-FR")).join("   ·   ");
    doc.text(texte, 18, y, { maxWidth: 174 });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Volailles de l'Est", 105, 285, { align: "center" });

  return doc;
}

// Tente le partage natif (mobile/PWA) ; retombe sur un téléchargement classique
// si l'API Web Share n'est pas disponible ou si le partage échoue.
export async function partagerPdf(doc, nomFichier) {
  const blob = doc.output("blob");
  const file = new File([blob], nomFichier, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nomFichier });
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }
  doc.save(nomFichier);
  return true;
}

export function telechargerPdf(doc, nomFichier) {
  doc.save(nomFichier);
}
