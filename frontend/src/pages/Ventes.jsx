import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, Receipt, CreditCard, Wallet, ChevronRight, AlertTriangle, Download, Share2, WifiOff, MessageCircle } from "lucide-react";
import {
  getFermes, getClients, getFactures, getFacturesCreances, getVentes, getVentesResume,
  creerFacture, encaisserVersement, updateSortieOeuf, deleteSortieOeuf, getHistoriquePrixClient,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, formatCartons } from "../theme";
import { genererPdfFacture, genererPdfCreances, telechargerPdf, partagerPdf } from "../utils/pdf";
import { mettreEnCache, lireCache } from "../offline/cache";

const CACHE_CLE_VENTES = "ventes-donnees";

const partageDisponible = typeof navigator !== "undefined" && !!navigator.share;

const fcfa = (v) => (Number(v) || 0).toLocaleString("fr-FR") + " F";
const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");
const today = () => new Date().toISOString().slice(0, 10);
const JOURS_CREANCE_RETARD = 15; // cf. conversation du 27/07/2026 avec Serge
const joursDepuis = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// Numéro de téléphone client saisi en local (10 chiffres, avec ou sans le 0
// initial) — converti au format international attendu par un lien wa.me
// (indicatif Côte d'Ivoire 225). Retourne null si le champ est vide/invalide
// plutôt que de générer un lien qui ne mènerait nulle part.
function numeroWhatsapp(telephone) {
  const chiffres = (telephone || "").replace(/\D/g, "");
  if (!chiffres) return null;
  if (chiffres.startsWith("225")) return chiffres;
  if (chiffres.startsWith("00225")) return chiffres.slice(2);
  if (chiffres.length === 10) return "225" + (chiffres.startsWith("0") ? chiffres.slice(1) : chiffres);
  return null;
}

function lienRelanceWhatsapp(facture) {
  const numero = numeroWhatsapp(facture.client.telephone);
  if (!numero) return null;
  const message =
    `Bonjour ${facture.client.nom}, nous vous rappelons que la facture n°${String(facture.numero).padStart(7, "0")} ` +
    `du ${new Date(facture.date).toLocaleDateString("fr-FR")} reste à régler (reste dû : ${fcfa(facture.reste_du)}). ` +
    `Merci de votre compréhension. — Volailles de l'Est`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

// Catalogue produits — pour les œufs, le prix se saisit AU PLATEAU (= 1 alvéole
// = 30 œufs). 1 carton = 14 plateaux, donc montant = qte × 14 × prix du plateau.
// Chair (unité) et réforme sont vendues à la tête et déduisent l'effectif de la
// bande, comme une mortalité. Chair au kilo ne touche pas l'effectif : le poids
// seul ne donne pas un nombre de têtes fiable.
const CATALOGUE = [
  { id: "OEUF_CARTON", label: "Œufs — carton (14 plateaux)", unite: "carton", plateaux: 14, oeufsParUnite: 420, prixDefaut: 2800 },
  { id: "OEUF_PLATEAU", label: "Œufs — plateau", unite: "plateau", plateaux: 1, oeufsParUnite: 30, prixDefaut: 2800 },
  { id: "CHAIR_UNITE", label: "Poulet de chair — unité", unite: "tête", prixDefaut: 3500, effectif: true },
  { id: "CHAIR_KG", label: "Poulet de chair — au kilo", unite: "kg", prixDefaut: 2200 },
  { id: "REFORME", label: "Pondeuse de réforme", unite: "tête", prixDefaut: 2500, effectif: true },
];
const CATALOGUE_MAP = Object.fromEntries(CATALOGUE.map((p) => [p.id, p]));

const LIGNE_VIDE = { ferme: "", type_produit: "OEUF_CARTON", quantite: "", prix_unitaire: String(CATALOGUE_MAP.OEUF_CARTON.prixDefaut) };

function nomFichierFacture(facture) {
  return `facture-${String(facture.numero).padStart(7, "0")}.pdf`;
}

export default function Ventes() {
  const [onglet, setOnglet] = useState("facture");
  const [fermes, setFermes] = useState([]);
  const [clients, setClients] = useState([]);
  const [factures, setFactures] = useState([]);
  const [ventesManuelles, setVentesManuelles] = useState([]);
  const [creances, setCreances] = useState([]);
  const [resume, setResume] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState(null);

  const rafraichir = useCallback(() => {
    // Les totaux (créances, œufs restant à facturer) sont désormais calculés
    // côté serveur (getFacturesCreances/getVentesResume) plutôt que sommés
    // ici à partir de tout l'historique des factures/ventes — cf. audit du
    // 30/07/2026. factures/ventesManuelles ne servent plus qu'à l'affichage
    // de l'onglet Historique.
    Promise.all([
      getFermes(), getClients(), getFactures(), getVentes({ origine: "SAISIE" }),
      getFacturesCreances(), getVentesResume(),
    ])
      .then(([f, c, fa, vm, cr, res]) => {
        setFermes(f); setClients(c); setFactures(fa); setVentesManuelles(vm);
        setCreances(cr); setResume(res); setChargement(false);
        setHorsLigneDepuis(null);
        mettreEnCache(CACHE_CLE_VENTES, { fermes: f, clients: c, factures: fa, ventesManuelles: vm, creances: cr, resume: res });
      })
      .catch(async () => {
        // Consultation seule hors-ligne (créances/historique déjà chargés) —
        // la création de facture, elle, reste volontairement en ligne
        // uniquement (vérification de stock en temps réel).
        const cache = await lireCache(CACHE_CLE_VENTES);
        if (cache?.donnees) {
          setFermes(cache.donnees.fermes); setClients(cache.donnees.clients);
          setFactures(cache.donnees.factures); setVentesManuelles(cache.donnees.ventesManuelles);
          setCreances(cache.donnees.creances || []); setResume(cache.donnees.resume || null);
        }
        setHorsLigneDepuis(cache?.sauvegardeLe || Date.now());
        setChargement(false);
      });
  }, []);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  useEffect(() => {
    function surReconnexion() { rafraichir(); }
    window.addEventListener("online", surReconnexion);
    return () => window.removeEventListener("online", surReconnexion);
  }, [rafraichir]);

  const fermesActives = fermes.filter((f) => !f.est_vide);
  const totalVentesOeufs = resume?.oeufs_restant_a_facturer ?? 0;

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Ventes</div>
          <h1 style={styles.h1}>Facturation</h1>
        </header>

        {horsLigneDepuis && (
          <div style={styles.offlineBanner}>
            <WifiOff size={14} />
            <span>
              Hors-ligne — créances/historique du {new Date(horsLigneDepuis).toLocaleString("fr-FR")}
              {onglet === "facture" ? " · la création de facture nécessite une connexion" : ""}
            </span>
          </div>
        )}

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(onglet === "facture" ? styles.tabOn : {}) }} onClick={() => setOnglet("facture")}>
            <Receipt size={15} /> Nouvelle facture
          </button>
          <button style={{ ...styles.tab, ...(onglet === "creances" ? styles.tabOn : {}) }} onClick={() => setOnglet("creances")}>
            <CreditCard size={15} /> Créances
          </button>
          <button style={{ ...styles.tab, ...(onglet === "historique" ? styles.tabOn : {}) }} onClick={() => setOnglet("historique")}>
            <ChevronRight size={15} /> Historique
          </button>
        </div>

        {chargement ? (
          <p style={{ padding: 20 }}>Chargement...</p>
        ) : onglet === "facture" ? (
          <NouvelleFacture fermes={fermesActives} clients={clients} onCreee={rafraichir} totalVentesOeufs={totalVentesOeufs} />
        ) : onglet === "creances" ? (
          <Creances creances={creances} onEncaisse={rafraichir} />
        ) : (
          <Historique factures={factures} ventesManuelles={ventesManuelles} onRafraichir={rafraichir} resume={resume} />
        )}
      </div>
    </div>
  );
}

function NouvelleFacture({ fermes, clients, onCreee, totalVentesOeufs }) {
  const [clientNom, setClientNom] = useState("");
  const [clientTel, setClientTel] = useState("");
  const [date, setDate] = useState(today());
  const [lignes, setLignes] = useState([{ ...LIGNE_VIDE }]);
  const [paiement, setPaiement] = useState("COMPTANT");
  const [avance, setAvance] = useState("");
  const [erreur, setErreur] = useState("");
  const [facture, setFacture] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const setLigne = (i, k, v) => {
    setLignes((L) => L.map((l, j) => {
      if (j !== i) return l;
      if (k === "type_produit") return { ...l, type_produit: v, prix_unitaire: String(CATALOGUE_MAP[v].prixDefaut) };
      return { ...l, [k]: v };
    }));
    setFacture(null); setErreur("");
  };
  const addLigne = () => setLignes((L) => [...L, { ...LIGNE_VIDE }]);
  const delLigne = (i) => setLignes((L) => L.filter((_, j) => j !== i));

  const detail = useMemo(() => lignes.map((l) => {
    const produit = CATALOGUE_MAP[l.type_produit];
    const qte = Number(l.quantite) || 0;
    const prix = Number(l.prix_unitaire) || 0;
    const facteur = produit.plateaux || 1;
    const montant = qte * facteur * prix;
    const oeufs = produit.oeufsParUnite ? qte * produit.oeufsParUnite : 0;
    const effectifVendu = produit.effectif ? qte : 0;
    // Seule la chair au kilo garde une ferme choisie à la main (pas de
    // notion de stock/effectif à répartir) — les autres produits sont
    // regroupés et répartis automatiquement entre les fermes (FIFO, bande
    // la plus ancienne d'abord) côté serveur, cf. conversation du
    // 27/07/2026 avec Serge.
    const ferme = l.type_produit === "CHAIR_KG" ? fermes.find((f) => String(f.id) === String(l.ferme)) : null;
    return { ...l, produit, qte, prix, montant, oeufs, effectifVendu, ferme };
  }), [lignes, fermes]);

  const total = detail.reduce((s, d) => s + d.montant, 0);
  const resteDu = paiement === "COMPTANT" ? 0 : paiement === "DOIT" ? total : Math.max(0, total - (Number(avance) || 0));

  const oeufsBrouillon = detail.reduce((s, d) => s + d.oeufs, 0);
  const totalAffiche = totalVentesOeufs - oeufsBrouillon;

  // Disponible total agrégé sur toutes les fermes éligibles à chaque
  // produit groupé — remplace l'ancien contrôle "par ferme sélectionnée"
  // puisque la ferme n'est plus choisie à la main pour ces produits.
  const stockOeufDispoTotal = useMemo(
    () => fermes.filter((f) => f.type === "PONTE").reduce((s, f) => s + (f.bande_active?.stock_oeuf_actuel ?? 0), 0),
    [fermes],
  );
  const effectifChairDispoTotal = useMemo(
    () => fermes.filter((f) => f.type === "CHAIR").reduce((s, f) => s + (f.bande_active?.effectif_actuel ?? 0), 0),
    [fermes],
  );
  const effectifPonteDispoTotal = useMemo(
    () => fermes.filter((f) => f.type === "PONTE").reduce((s, f) => s + (f.bande_active?.effectif_actuel ?? 0), 0),
    [fermes],
  );

  const avertissements = useMemo(() => {
    const oeufsDemandes = detail.filter((d) => d.produit.oeufsParUnite).reduce((s, d) => s + d.oeufs, 0);
    const chairDemandee = detail.filter((d) => d.type_produit === "CHAIR_UNITE").reduce((s, d) => s + d.effectifVendu, 0);
    const reformeDemandee = detail.filter((d) => d.type_produit === "REFORME").reduce((s, d) => s + d.effectifVendu, 0);
    const alertes = [];
    if (oeufsDemandes > stockOeufDispoTotal) alertes.push(`Stock d'œufs insuffisant, toutes fermes confondues (${formatCartons(oeufsDemandes)} demandés, ${formatCartons(stockOeufDispoTotal)} disponibles)`);
    if (chairDemandee > effectifChairDispoTotal) alertes.push(`Effectif chair insuffisant, toutes fermes confondues (${nf(chairDemandee)} demandés, ${nf(effectifChairDispoTotal)} disponibles)`);
    if (reformeDemandee > effectifPonteDispoTotal) alertes.push(`Effectif réforme insuffisant, toutes fermes confondues (${nf(reformeDemandee)} demandés, ${nf(effectifPonteDispoTotal)} disponibles)`);
    detail.filter((d) => d.type_produit === "CHAIR_KG" && !d.ferme && d.qte > 0).forEach(() => {
      alertes.push("Chair au kilo : choisis la ferme d'origine.");
    });
    return alertes;
  }, [detail, stockOeufDispoTotal, effectifChairDispoTotal, effectifPonteDispoTotal]);

  const clientTrouve = useMemo(
    () => clients.find((c) => c.nom.trim().toLowerCase() === clientNom.trim().toLowerCase()),
    [clients, clientNom],
  );
  const [historiquePrix, setHistoriquePrix] = useState(null);
  useEffect(() => {
    if (!clientTrouve) { setHistoriquePrix(null); return; }
    let annule = false;
    getHistoriquePrixClient(clientTrouve.id).then((data) => { if (!annule) setHistoriquePrix(data); });
    return () => { annule = true; };
  }, [clientTrouve]);

  const pretAEnvoyer = clientNom.trim() && date
    && lignes.every((l) => Number(l.quantite) > 0 && (l.type_produit !== "CHAIR_KG" || l.ferme))
    && total > 0;

  async function valider() {
    setEnvoi(true); setErreur("");
    try {
      const data = await creerFacture({
        client_nom: clientNom.trim(),
        client_telephone: clientTel.trim(),
        date,
        mode_paiement: paiement,
        avance_initiale: paiement === "PARTIEL" ? (Number(avance) || 0) : 0,
        lignes: lignes.map((l) => ({
          ferme: l.type_produit === "CHAIR_KG" ? Number(l.ferme) : null, type_produit: l.type_produit,
          quantite: Number(l.quantite) || 0, prix_unitaire: Number(l.prix_unitaire) || 0,
        })),
      });
      setFacture(data);
      onCreee();
    } catch (e) {
      if (!e.response) {
        setErreur("Impossible de créer une facture hors-ligne — la vérification du stock nécessite une connexion. Réessaie une fois reconnecté.");
      } else {
        setErreur(e.response?.data?.detail || "Erreur lors de la création de la facture.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  function nouvelle() {
    setClientNom(""); setClientTel(""); setDate(today());
    setLignes([{ ...LIGNE_VIDE }]); setPaiement("COMPTANT"); setAvance("");
    setFacture(null); setErreur("");
  }

  return (
    <div style={styles.body}>
      <div style={styles.stockGlobal}>
        <span style={styles.stockGlobalLabel}>Œufs restants à facturer (Point Journalier − Factures{oeufsBrouillon > 0 ? " − en cours" : ""})</span>
        <span style={styles.stockGlobalVal}>{formatCartons(totalAffiche)}</span>
      </div>

      <div style={styles.card}>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Client</span>
            <input style={styles.input} list="clients-list" placeholder="Nom du client" value={clientNom}
              onChange={(e) => { setClientNom(e.target.value); setFacture(null); }} />
            <datalist id="clients-list">{clients.map((c) => <option key={c.id} value={c.nom} />)}</datalist>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Téléphone (optionnel)</span>
            <input style={styles.input} value={clientTel} onChange={(e) => { setClientTel(e.target.value); setFacture(null); }} />
          </label>
        </div>

        {historiquePrix && historiquePrix.length > 0 && (
          <div style={styles.prixHistoBox}>
            <div style={styles.prixHistoTitre}>Prix déjà pratiqués pour {clientTrouve.nom}</div>
            {historiquePrix.map((h) => (
              <div key={h.type_produit} style={styles.prixHistoLigne}>
                <span style={styles.prixHistoProduit}>{CATALOGUE_MAP[h.type_produit]?.label || h.type_produit}</span>
                <span style={styles.prixHistoValeurs}>
                  {h.dernieres.map((d, i) => (
                    <span key={i} style={styles.prixHistoValeur}>
                      {fcfa(d.prix_unitaire)} <span style={styles.prixHistoDate}>({new Date(d.date).toLocaleDateString("fr-FR")})</span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}

        <label style={styles.field}>
          <span style={styles.fieldLabel}>Date</span>
          <input type="date" style={styles.input} value={date} onChange={(e) => { setDate(e.target.value); setFacture(null); }} />
        </label>
      </div>

      <div style={styles.sectionLabel}>Articles</div>
      {detail.map((d, i) => (
        <div key={i} style={styles.ligne}>
          <div style={styles.ligneTop}>
            <select style={styles.select} value={d.type_produit} onChange={(e) => setLigne(i, "type_produit", e.target.value)}>
              {CATALOGUE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {d.type_produit === "CHAIR_KG" && (
              <select style={styles.select} value={d.ferme?.id ?? ""} onChange={(e) => setLigne(i, "ferme", e.target.value)}>
                <option value="">— Ferme —</option>
                {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            )}
            {lignes.length > 1 && <button style={styles.delBtn} onClick={() => delLigne(i)}><Trash2 size={15} /></button>}
          </div>
          <div style={styles.ligneGrid}>
            <label style={styles.miniField}>
              <span style={styles.miniLabel}>Quantité ({d.produit.unite}{d.qte > 1 && d.produit.unite !== "kg" ? "s" : ""})</span>
              <input type="number" inputMode="decimal" style={styles.miniInput} placeholder="0" value={d.quantite} onChange={(e) => setLigne(i, "quantite", e.target.value)} />
            </label>
            <label style={styles.miniField}>
              <span style={styles.miniLabel}>Prix / {d.produit.plateaux ? "plateau" : d.produit.unite}</span>
              <input type="number" inputMode="numeric" style={styles.miniInput} placeholder="0" value={d.prix_unitaire} onChange={(e) => setLigne(i, "prix_unitaire", e.target.value)} />
            </label>
          </div>
          <div style={styles.ligneCalc}>
            <span style={styles.calcExpr}>
              {d.produit.plateaux > 1 ? `${d.qte || 0} × ${d.produit.plateaux} plateaux × ${fcfa(d.prix)}` : `${d.qte || 0} × ${fcfa(d.prix)}`}
            </span>
            <span style={styles.ligneTotal}>{fcfa(d.montant)}</span>
          </div>
          {d.oeufs > 0 && <div style={styles.note}>— déduit {nf(d.oeufs)} œufs, réparti automatiquement entre les fermes</div>}
          {d.effectifVendu > 0 && <div style={styles.note}>— déduit {nf(d.effectifVendu)} sujets, réparti automatiquement entre les fermes</div>}
        </div>
      ))}
      <button style={styles.addBtn} onClick={addLigne}><Plus size={16} /> Ajouter un article</button>

      <div style={styles.sectionLabel}>Paiement</div>
      <div style={styles.payRow}>
        <PayBtn active={paiement === "COMPTANT"} onClick={() => setPaiement("COMPTANT")} icon={<Wallet size={15} />} txt="Comptant" />
        <PayBtn active={paiement === "DOIT"} onClick={() => setPaiement("DOIT")} icon={<CreditCard size={15} />} txt="Crédit (Doit)" />
        <PayBtn active={paiement === "PARTIEL"} onClick={() => setPaiement("PARTIEL")} icon={<CreditCard size={15} />} txt="Partiel" />
      </div>
      {paiement === "PARTIEL" && (
        <div style={styles.card}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Avance versée</span>
            <input type="number" inputMode="numeric" style={styles.input} placeholder="0" value={avance} onChange={(e) => setAvance(e.target.value)} />
          </label>
        </div>
      )}

      {avertissements.length > 0 && (
        <div style={styles.warnBox}>
          {avertissements.map((a, i) => <div key={i} style={styles.warnLine}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {a}</div>)}
        </div>
      )}

      <div style={styles.totalCard}>
        <div style={styles.totalRow}><span>Total facture</span><span style={styles.totalVal}>{fcfa(total)}</span></div>
        {paiement !== "COMPTANT" && (
          <div style={{ ...styles.totalRow, ...styles.resteRow }}><span>Reste dû</span><span style={styles.resteVal}>{fcfa(resteDu)}</span></div>
        )}
      </div>

      {erreur && <p style={styles.erreur}>{erreur}</p>}

      {facture ? (
        <>
          <p style={styles.synced}>Facture n°{String(facture.numero).padStart(7, "0")} enregistrée · {fcfa(facture.montant_total)}</p>
          <button style={styles.printBtn} onClick={() => telechargerPdf(genererPdfFacture(facture), nomFichierFacture(facture))}>
            <Download size={17} /> Télécharger le PDF
          </button>
          {partageDisponible && (
            <button style={styles.printBtn} onClick={() => partagerPdf(genererPdfFacture(facture), nomFichierFacture(facture))}>
              <Share2 size={17} /> Partager
            </button>
          )}
          <button style={styles.addBtn} onClick={nouvelle}>Nouvelle facture</button>
        </>
      ) : (
        <button style={{ ...styles.submit, ...((!pretAEnvoyer || envoi) ? styles.submitDis : {}) }} disabled={!pretAEnvoyer || envoi} onClick={valider}>
          <Check size={18} /> {envoi ? "Enregistrement..." : "Valider la facture"}
        </button>
      )}
    </div>
  );
}

function Creances({ creances, onEncaisse }) {
  const [ouverte, setOuverte] = useState(null);
  const [montant, setMontant] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // creances arrive déjà filtrée (reste_du > 0) et triée par date depuis le
  // serveur (getFacturesCreances) — cf. audit du 30/07/2026.
  const total = creances.reduce((s, f) => s + Number(f.reste_du), 0);
  const nbEnRetard = creances.filter((f) => joursDepuis(f.date) > JOURS_CREANCE_RETARD).length;

  async function encaisser(facture) {
    const m = Number(montant) || 0;
    if (m <= 0) return;
    setEnvoi(true);
    try {
      await encaisserVersement(facture.id, { montant: m, date: today() });
      setMontant(""); setOuverte(null);
      onEncaisse();
    } finally {
      setEnvoi(false);
    }
  }

  function exporter() {
    telechargerPdf(genererPdfCreances(creances, JOURS_CREANCE_RETARD), `creances-${today()}.pdf`);
  }

  return (
    <div style={styles.body}>
      <div style={styles.creanceHead}>
        <span style={styles.creanceLabel}>Total créances clients</span>
        <span style={styles.creanceTotal}>{fcfa(total)}</span>
      </div>
      <button style={styles.printBtn} onClick={exporter}>
        <Download size={17} /> Exporter les créances (PDF)
      </button>
      <div style={styles.sectionLabel}>Clients qui doivent ({creances.length})</div>
      {nbEnRetard > 0 && (
        <p style={styles.retardWarn}><AlertTriangle size={13} /> {nbEnRetard} créance{nbEnRetard > 1 ? "s" : ""} en retard depuis plus de {JOURS_CREANCE_RETARD} jours</p>
      )}
      {creances.length === 0 && <p style={styles.noAlert}>Aucune créance en cours — tout est soldé ✓</p>}
      {creances.map((f) => {
        const ouvert = ouverte === f.id;
        const jours = joursDepuis(f.date);
        const enRetard = jours > JOURS_CREANCE_RETARD;
        return (
          <div key={f.id} style={styles.creanceCard}>
            <button style={styles.creanceRowBtn} onClick={() => { setOuverte(ouvert ? null : f.id); setMontant(""); }}>
              <div>
                <div style={styles.creanceClient}>{f.client.nom}</div>
                <div style={styles.creanceMeta}>
                  Facture {String(f.numero).padStart(7, "0")} · {new Date(f.date).toLocaleDateString("fr-FR")}
                  {enRetard && <span style={styles.retardBadge}>en retard · {jours} j</span>}
                </div>
              </div>
              <div style={styles.creanceRight}>
                <span style={styles.creanceMontant}>{fcfa(f.reste_du)}</span>
                <ChevronRight size={16} color="#B5BBB2" style={{ transform: ouvert ? "rotate(90deg)" : "none", transition: ".2s" }} />
              </div>
            </button>
            {ouvert && (
              <div style={styles.encaisseZone}>
                <div style={styles.recapRow}><span>Total facturé</span><span>{fcfa(f.montant_total)}</span></div>
                <div style={styles.recapRow}><span>Déjà versé</span><span style={{ color: GREEN_DARK }}>− {fcfa(f.montant_verse)}</span></div>
                <div style={{ ...styles.recapRow, ...styles.recapReste }}><span>Reste dû</span><span>{fcfa(f.reste_du)}</span></div>
                {f.versements.length > 0 && (
                  <div style={styles.histo}>
                    <div style={styles.histoTitre}>Versements</div>
                    {f.versements.map((v) => (
                      <div key={v.id} style={styles.histoLigne}><span>{new Date(v.date).toLocaleDateString("fr-FR")}</span><span>{fcfa(v.montant)}</span></div>
                    ))}
                  </div>
                )}
                {lienRelanceWhatsapp(f) ? (
                  <a href={lienRelanceWhatsapp(f)} target="_blank" rel="noopener noreferrer" style={styles.relanceBtn}>
                    <MessageCircle size={16} /> Relancer via WhatsApp
                  </a>
                ) : (
                  <p style={styles.relanceIndispo}>Aucun téléphone enregistré pour ce client — impossible de relancer par WhatsApp.</p>
                )}
                <div style={styles.encaisseInputRow}>
                  <input type="number" inputMode="numeric" style={styles.miniInput} placeholder="Montant reçu" value={montant} onChange={(e) => setMontant(e.target.value)} />
                  <button style={styles.soldeBtn} onClick={() => setMontant(String(f.reste_du))}>Tout solder</button>
                </div>
                <button style={{ ...styles.encaisseBtn, ...((Number(montant) || 0) <= 0 || envoi ? styles.submitDis : {}) }}
                  disabled={(Number(montant) || 0) <= 0 || envoi} onClick={() => encaisser(f)}>
                  <Wallet size={16} /> Encaisser {(Number(montant) || 0) > 0 ? fcfa(montant) : ""}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Historique({ factures, ventesManuelles, onRafraichir, resume }) {
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({ quantite: "", responsable: "" });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  function commencerEdition(v) {
    setEdition(v.id);
    setBrouillon({ quantite: String(v.quantite), responsable: v.responsable });
    setErreur("");
  }

  async function enregistrerEdition(id) {
    setEnvoi(true);
    setErreur("");
    try {
      await updateSortieOeuf(id, { quantite: Number(brouillon.quantite) || 0, responsable: brouillon.responsable });
      setEdition(null);
      onRafraichir();
    } catch (e) {
      setErreur(e.response?.data?.detail || "Erreur lors de la modification de cette vente.");
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(v) {
    if (!window.confirm(`Supprimer la sortie de ${nf(v.quantite)} œufs (${v.ferme}, ${v.responsable}) ?`)) return;
    setEnvoi(true);
    setErreur("");
    try {
      await deleteSortieOeuf(v.id);
      onRafraichir();
    } catch (e) {
      setErreur(e.response?.data?.detail || "Erreur lors de la suppression de cette vente.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={styles.body}>
      {resume && (
        <div style={styles.venduHead}>
          <span style={styles.venduLabel}>Total œufs vendus (historique, manuel + facturé)</span>
          <span style={styles.venduTotal}>{formatCartons(resume.oeufs_vendus_total)}</span>
        </div>
      )}
      <div style={styles.sectionLabel}>Factures</div>
      <section style={styles.card}>
        {factures.length === 0 ? (
          <p style={styles.empty}>Aucune facture pour l'instant.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>N°</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Client</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Total</th>
                <th style={styles.th}>Paiement</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Reste dû</th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id}>
                  <td style={styles.td}>{String(f.numero).padStart(7, "0")}</td>
                  <td style={styles.td}>{new Date(f.date).toLocaleDateString("fr-FR")}</td>
                  <td style={styles.td}>{f.client.nom}</td>
                  <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>{fcfa(f.montant_total)}</td>
                  <td style={styles.td}>{f.mode_paiement === "COMPTANT" ? "Comptant" : f.mode_paiement === "DOIT" ? "Doit" : "Partiel"}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: Number(f.reste_du) > 0 ? CLAY : "inherit" }}>{fcfa(f.reste_du)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div style={styles.sectionLabel}>Sorties d'œufs saisies sur le Point Journalier</div>
      {erreur && <p style={styles.erreur}>{erreur}</p>}
      <section style={styles.card}>
        {ventesManuelles.length === 0 ? (
          <p style={styles.empty}>Aucune vente saisie manuellement.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Ferme</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                <th style={styles.th}>Responsable</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ventesManuelles.map((v) => {
                const enEdition = edition === v.id;
                return (
                  <tr key={v.id}>
                    <td style={styles.td}>{new Date(v.date).toLocaleDateString("fr-FR")}</td>
                    <td style={styles.td}>{v.ferme}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>
                      {enEdition ? (
                        <input type="number" style={styles.tableInput} value={brouillon.quantite}
                          onChange={(e) => setBrouillon((b) => ({ ...b, quantite: e.target.value }))} />
                      ) : nf(v.quantite)}
                    </td>
                    <td style={styles.td}>
                      {enEdition ? (
                        <input style={styles.tableInput} value={brouillon.responsable}
                          onChange={(e) => setBrouillon((b) => ({ ...b, responsable: e.target.value }))} />
                      ) : v.responsable}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {enEdition ? (
                        <div style={styles.actionsRow}>
                          <button style={styles.actionBtn} disabled={envoi} onClick={() => enregistrerEdition(v.id)}><Check size={14} /></button>
                          <button style={styles.actionBtn} disabled={envoi} onClick={() => setEdition(null)}><X size={14} /></button>
                        </div>
                      ) : (
                        <div style={styles.actionsRow}>
                          <button style={styles.actionBtn} disabled={envoi} onClick={() => commencerEdition(v)}><Pencil size={14} /></button>
                          <button style={{ ...styles.actionBtn, color: "#C6603A" }} disabled={envoi} onClick={() => supprimer(v)}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function PayBtn({ active, onClick, icon, txt }) {
  return <button style={{ ...styles.payBtn, ...(active ? styles.payBtnOn : {}) }} onClick={onClick}>{icon}<span>{txt}</span></button>;
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px" },
  wrap: { maxWidth: 640, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 14 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12.5, fontWeight: 500, padding: "9px 16px", marginBottom: 14, borderRadius: 10 },
  tabs: { display: "flex", gap: 6, marginBottom: 16 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: "1px solid #ECE9DF", color: "#7A857F", padding: "10px 8px", borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" },
  tabOn: { background: GREEN, borderColor: GREEN, color: "#fff", fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: 0 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #ECE9DF", padding: "12px 14px", marginBottom: 12 },
  stockGlobal: { display: "flex", justifyContent: "space-between", alignItems: "center", background: `linear-gradient(150deg, ${GREEN}, ${GREEN_DARK})`, color: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 14 },
  stockGlobalLabel: { fontSize: 12.5, opacity: .9 },
  stockGlobalVal: { fontSize: 20, fontWeight: 700 },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  prixHistoBox: { background: "#F4F9F6", border: "1px solid #DCEAE1", borderRadius: 10, padding: "10px 12px", margin: "4px 0 10px", display: "flex", flexDirection: "column", gap: 6 },
  prixHistoTitre: { fontSize: 11.5, fontWeight: 600, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: .3 },
  prixHistoLigne: { display: "flex", flexDirection: "column", gap: 2 },
  prixHistoProduit: { fontSize: 12.5, fontWeight: 600, color: INK },
  prixHistoValeurs: { display: "flex", gap: 10, flexWrap: "wrap" },
  prixHistoValeur: { fontSize: 12.5, color: GREEN_DARK, fontWeight: 600 },
  prixHistoDate: { fontSize: 11, color: "#8A948D", fontWeight: 400 },
  field: { display: "flex", flexDirection: "column", gap: 5, padding: "6px 0" },
  fieldLabel: { fontSize: 12, color: "#7A857F", fontWeight: 500 },
  input: { border: "1px solid #DDE2DE", borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", background: "#FCFCFA", color: INK },
  sectionLabel: { fontSize: 12, fontWeight: 600, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: .6, margin: "14px 0 8px" },
  ligne: { background: "#fff", borderRadius: 12, border: "1px solid #ECE9DF", padding: "12px", marginBottom: 8 },
  ligneTop: { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" },
  select: { flex: 1, minWidth: 140, border: "1px solid #DDE2DE", borderRadius: 8, padding: "9px 10px", fontSize: 13.5, fontFamily: "inherit", background: "#FCFCFA", color: INK },
  delBtn: { background: "#FBF0EB", border: "none", color: "#C6603A", width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ligneGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  miniField: { display: "flex", flexDirection: "column", gap: 4 },
  miniLabel: { fontSize: 11, color: "#8A948D", fontWeight: 500 },
  miniInput: { flex: 1, width: "100%", border: "1px solid #DDE2DE", background: "#F4F1EA", borderRadius: 8, padding: "8px 10px", fontSize: 15, fontWeight: 600, fontFamily: "inherit", color: INK },
  ligneCalc: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #F2F0E8" },
  calcExpr: { fontSize: 12, color: "#8A948D" },
  ligneTotal: { fontWeight: 700, fontSize: 16, color: GREEN_DARK },
  note: { fontSize: 11, color: "#A0A89F", marginTop: 8, fontStyle: "italic" },
  addBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#EAF3EE", border: `1px dashed ${GREEN}`, color: GREEN_DARK, padding: "11px", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", marginTop: 4 },
  payRow: { display: "flex", gap: 7 },
  payBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #ECE9DF", color: "#5A655F", padding: "11px 6px", borderRadius: 11, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", fontWeight: 500 },
  payBtnOn: { background: "#EAF3EE", borderColor: GREEN, color: GREEN_DARK, fontWeight: 600 },
  warnBox: { background: "#FBF0EB", border: "1px solid #F0D9CC", borderRadius: 10, padding: "10px 12px", margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 },
  warnLine: { display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, color: "#9E4527" },
  totalCard: { background: "#fff", borderRadius: 14, border: "1px solid #ECE9DF", padding: "14px 16px", margin: "8px 0 0" },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 },
  totalVal: { fontWeight: 700, fontSize: 22, color: INK },
  resteRow: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #F2F0E8", color: CLAY },
  resteVal: { fontWeight: 700, fontSize: 18, color: CLAY },
  erreur: { color: "#9E4527", background: "#FBF0EB", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 12 },
  submit: { marginTop: 16, width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: 13, padding: "16px", fontSize: 16, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  submitDis: { background: "#C9CFC8", cursor: "not-allowed" },
  synced: { textAlign: "center", fontSize: 12.5, color: GREEN_DARK, marginTop: 14, lineHeight: 1.5 },
  printBtn: { marginTop: 10, width: "100%", background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 13, padding: "14px", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  creanceHead: { background: `linear-gradient(135deg, ${CLAY}, #9E4527)`, color: "#fff", borderRadius: 16, padding: "18px 20px", marginBottom: 4 },
  creanceLabel: { fontSize: 13, opacity: .9, display: "block", marginBottom: 4 },
  creanceTotal: { fontWeight: 700, fontSize: 28 },
  venduHead: { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`, color: "#fff", borderRadius: 16, padding: "18px 20px", marginBottom: 4 },
  venduLabel: { fontSize: 13, opacity: .9, display: "block", marginBottom: 4 },
  venduTotal: { fontWeight: 700, fontSize: 22 },
  relanceBtn: { marginTop: 12, width: "100%", background: "#25D366", color: "#fff", border: "none", borderRadius: 13, padding: "13px", fontSize: 14.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" },
  relanceIndispo: { marginTop: 12, fontSize: 12.5, color: "#8A9088", textAlign: "center" },
  creanceCard: { background: "#fff", borderRadius: 12, border: "1px solid #ECE9DF", marginBottom: 8, overflow: "hidden" },
  creanceRowBtn: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "13px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  encaisseZone: { padding: "4px 14px 14px", borderTop: "1px solid #F2F0E8" },
  recapRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#5A655F", padding: "6px 0" },
  recapReste: { fontWeight: 700, color: CLAY, fontSize: 15, borderTop: "1px solid #F2F0E8", marginTop: 4, paddingTop: 8 },
  histo: { background: "#F4F1EA", borderRadius: 9, padding: "8px 11px", margin: "10px 0" },
  histoTitre: { fontSize: 11, fontWeight: 600, color: "#8A948D", textTransform: "uppercase", letterSpacing: .5, marginBottom: 5 },
  histoLigne: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: GREEN_DARK, padding: "3px 0" },
  encaisseInputRow: { display: "flex", gap: 8, marginTop: 10, alignItems: "stretch" },
  soldeBtn: { background: "#EAF3EE", border: `1px solid ${GREEN}`, color: GREEN_DARK, borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" },
  encaisseBtn: { width: "100%", marginTop: 10, background: GREEN, color: "#fff", border: "none", borderRadius: 11, padding: "13px", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  noAlert: { fontSize: 13, color: GREEN, background: "#EAF3EE", borderRadius: 10, padding: "14px", textAlign: "center", margin: "0 0 8px" },
  retardWarn: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#9E4527", background: "#FDEEE8", borderRadius: 10, padding: "9px 13px", margin: "0 0 10px", fontWeight: 500 },
  retardBadge: { marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: "#9E4527", background: "#FDEEE8", borderRadius: 6, padding: "1px 6px", textTransform: "uppercase", letterSpacing: .3 },
  creanceClient: { fontSize: 15, fontWeight: 600, color: INK },
  creanceMeta: { fontSize: 11.5, color: "#8A948D", marginTop: 3 },
  creanceRight: { display: "flex", alignItems: "center", gap: 8 },
  creanceMontant: { fontWeight: 700, fontSize: 15, color: CLAY },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK },
  tableInput: { width: "100%", maxWidth: 140, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK },
  actionsRow: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actionBtn: { background: "#F4F1EA", border: "none", color: GREEN_DARK, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
