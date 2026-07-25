import jsPDF from "jspdf";
import { formatSacs, formatColis } from "../theme";

const fcfa = (v) => (Number(v) || 0).toLocaleString("fr-FR") + " F";
const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");

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

  let y = 74;
  doc.setFillColor(...GREEN_DARK);
  doc.rect(15, y - 5.5, 180, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Désignation", 18, y);
  doc.text("Ferme", 100, y);
  doc.text("P.U.", 150, y, { align: "right" });
  doc.text("Total", 192, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  facture.lignes.forEach((l, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(15, y - 5, 180, 7, "F");
    }
    const unite = UNITE_PRODUIT[l.type_produit];
    const qte = Number(l.quantite);
    const desig = `${nf(qte)} ${unite}${qte > 1 && unite !== "kg" ? "s" : ""} — ${LABEL_PRODUIT[l.type_produit]}`;
    doc.setTextColor(...INK);
    doc.text(desig, 18, y, { maxWidth: 78 });
    doc.text(l.ferme_nom, 100, y, { maxWidth: 46 });
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
    y = ligneCle(doc, y, "Reçu", `${nf(form.alveole_recu_unites || 0)} unités`);
    y = ligneCle(doc, y, "Consommé (auto)", `${nf(calc.alveoleConsoAuto)} unités`);
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
  y = ligneCle(doc, y, "Reçu", `${nf(p.alveole_recu_unites)} unités`);
  y = ligneCle(doc, y, "Consommé (auto)", `${nf(p.alveole_conso_unites)} unités`);
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
