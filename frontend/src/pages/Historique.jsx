import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, Share2, Pencil, Trash2, Archive, WifiOff, GitCompareArrows, RefreshCw, Lock, LockOpen, Siren } from "lucide-react";
import {
  getFermes, getPointsJournaliers, deletePointJournalier, corrigerPointJournalier, getBandes, getBilanBande,
  getComparaisonBandes, getCloturesMensuelles, cloturerMois, rouvrirMois,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, formatSacs, formatColis } from "../theme";
import { genererPdfHistoriquePoint, genererBilanBande, telechargerPdf, partagerPdf } from "../utils/pdf";
import { mettreEnCache, lireCache } from "../offline/cache";
import { estDirectionOuAdmin } from "../utils/auth";

const CACHE_CLE_HISTORIQUE = "historique-points";

const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");
const partageDisponible = typeof navigator !== "undefined" && !!navigator.share;
const nomFichierPoint = (p) => `point-journalier-${p.ferme_nom.replace(/\s+/g, "-")}-${p.date}.pdf`;
const LABEL_MOTIF_FIN = { REFORME: "Réforme", TRANSFERT: "Transfert", MORTALITE_TOTALE: "Mortalité totale" };
const LABEL_CAUSE_MORTS = {
  MALADIE: "Maladie", CHALEUR: "Chaleur / stress thermique", PICAGE: "Picage / cannibalisme",
  PREDATEUR: "Prédateur", ACCIDENT: "Accident", INCONNUE: "Cause inconnue", AUTRE: "Autre",
};
const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const todayISO = () => new Date().toISOString().slice(0, 10);

const peutSupprimer = estDirectionOuAdmin;
// Un chef peut librement resoumettre le jour même (rattrapage), mais
// corriger un jour déjà passé et déjà enregistré est réservé à
// Direction/Admin — même règle appliquée côté serveur (point 15 du
// backlog, cf. conversation du 27/07/2026 avec Serge).
function peutModifier(p) {
  return peutSupprimer() || p.date === todayISO();
}

export default function Historique() {
  const [fermes, setFermes] = useState([]);
  const [points, setPoints] = useState([]);
  const [bandesTerminees, setBandesTerminees] = useState([]);
  const [comparaisonBandes, setComparaisonBandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoiBilan, setEnvoiBilan] = useState(null);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState(null);
  const [clotures, setClotures] = useState([]);
  const aujourdhui = new Date();
  const [nouvelleCloture, setNouvelleCloture] = useState({ annee: aujourdhui.getFullYear(), mois: aujourdhui.getMonth() + 1 });
  const [envoiCloture, setEnvoiCloture] = useState(false);

  useEffect(() => { getFermes().then(setFermes).catch(() => {}); }, []);

  const rafraichirClotures = useCallback(() => {
    if (!fermeId) { setClotures([]); return; }
    getCloturesMensuelles({ ferme: fermeId }).then(setClotures).catch(() => {});
  }, [fermeId]);

  useEffect(() => { rafraichirClotures(); }, [rafraichirClotures]);

  async function handleCloturerMois() {
    setEnvoiCloture(true);
    try {
      await cloturerMois(fermeId, nouvelleCloture);
      rafraichirClotures();
    } finally {
      setEnvoiCloture(false);
    }
  }

  async function handleRouvrirMois(c) {
    if (!window.confirm(`Rouvrir ${NOMS_MOIS[c.mois - 1]} ${c.annee} pour ${c.ferme_nom} ? Les corrections redeviendront possibles sur ce mois.`)) return;
    setEnvoiCloture(true);
    try {
      await rouvrirMois(fermeId, { annee: c.annee, mois: c.mois });
      rafraichirClotures();
    } finally {
      setEnvoiCloture(false);
    }
  }

  useEffect(() => {
    getBandes({ statut: "TERMINEE", ...(fermeId ? { ferme: fermeId } : {}) }).then(setBandesTerminees).catch(() => {});
  }, [fermeId]);

  useEffect(() => {
    if (!fermeId) { setComparaisonBandes([]); return; }
    getComparaisonBandes(fermeId).then(setComparaisonBandes).catch(() => {});
  }, [fermeId]);

  async function telechargerBilan(bande) {
    setEnvoiBilan(bande.id);
    try {
      const bilan = await getBilanBande(bande.id);
      telechargerPdf(genererBilanBande(bilan), `bilan-cloture-${bande.ferme_nom.replace(/\s+/g, "-")}-${bande.date_fin}.pdf`);
    } finally {
      setEnvoiBilan(null);
    }
  }

  const rafraichir = useCallback(() => {
    setChargement(true);
    const params = {};
    if (fermeId) params.ferme = fermeId;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    getPointsJournaliers(params)
      .then((data) => {
        setPoints(data);
        setChargement(false);
        setHorsLigneDepuis(null);
        mettreEnCache(CACHE_CLE_HISTORIQUE, data);
      })
      .catch(async () => {
        // Pas de réseau (ou serveur injoignable) : on retombe sur la
        // dernière consultation réussie plutôt que d'afficher une page
        // vide — lecture seule, les filtres ne se ré-appliquent qu'au
        // retour du réseau.
        const cache = await lireCache(CACHE_CLE_HISTORIQUE);
        setPoints(cache?.donnees || []);
        setHorsLigneDepuis(cache?.sauvegardeLe || Date.now());
        setChargement(false);
      });
  }, [fermeId, dateDebut, dateFin]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  useEffect(() => {
    function surReconnexion() { rafraichir(); }
    window.addEventListener("online", surReconnexion);
    return () => window.removeEventListener("online", surReconnexion);
  }, [rafraichir]);

  async function supprimer(p) {
    if (!window.confirm(`Supprimer le point journalier de ${p.ferme_nom} du ${new Date(p.date).toLocaleDateString("fr-FR")} ? Cette action est irréversible.`)) return;
    setEnvoi(true);
    try {
      await deletePointJournalier(p.id);
      rafraichir();
    } finally {
      setEnvoi(false);
    }
  }

  async function recalculer(p) {
    // Force le recalcul en cascade (stock aliment/alvéole/œuf, effectif...)
    // depuis cette date jusqu'à aujourd'hui — utile après l'ajout tardif
    // d'un jour manquant plus tôt dans l'historique, qui ne se répercute
    // pas automatiquement sur les jours déjà enregistrés après coup.
    setEnvoi(true);
    try {
      // version_attendue permet au serveur de détecter qu'un autre appareil
      // a modifié ce point entretemps (cf. le même verrouillage optimiste
      // utilisé par le formulaire de correction) — sans ça, Recalculer
      // pouvait écraser silencieusement une modification concurrente sans
      // jamais déclencher le message de conflit (cf. audit du 30/07/2026).
      await corrigerPointJournalier(p.id, { version_attendue: p.updated_at });
      rafraichir();
    } catch (err) {
      if (err.response?.status === 409) {
        window.alert("Ce point a été modifié par quelqu'un d'autre entretemps — rechargez la page pour voir la dernière version.");
      } else {
        throw err;
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Historique</div>
          <h1 style={styles.h1}>Points journaliers enregistrés</h1>
        </header>

        {horsLigneDepuis && (
          <div style={styles.offlineBanner}>
            <WifiOff size={14} />
            <span>Hors-ligne — données du {new Date(horsLigneDepuis).toLocaleString("fr-FR")} (les filtres ne s'appliqueront qu'au retour du réseau)</span>
          </div>
        )}

        <div style={styles.filters}>
          <select style={styles.select} value={fermeId} onChange={(e) => setFermeId(e.target.value)}>
            <option value="">Toutes les fermes</option>
            {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <label style={styles.dateLabel}>
            Du
            <input type="date" style={styles.date} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </label>
          <label style={styles.dateLabel}>
            Au
            <input type="date" style={styles.date} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </label>
          {(fermeId || dateDebut || dateFin) && (
            <button style={styles.clear} onClick={() => { setFermeId(""); setDateDebut(""); setDateFin(""); }}>
              Réinitialiser
            </button>
          )}
        </div>

        {fermeId && peutSupprimer() && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}><Lock size={15} color={GREEN} /><span>Clôture mensuelle</span></div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {clotures.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {clotures.map((c) => (
                    <div key={c.id} style={styles.clotureRow}>
                      <span><Lock size={13} /> {NOMS_MOIS[c.mois - 1]} {c.annee} — clôturé par {c.cloture_par_nom}</span>
                      <button style={styles.pdfBtn} disabled={envoiCloture} onClick={() => handleRouvrirMois(c)}>
                        <LockOpen size={14} /> Rouvrir
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select style={styles.select} value={nouvelleCloture.mois} onChange={(e) => setNouvelleCloture((c) => ({ ...c, mois: Number(e.target.value) }))}>
                  {NOMS_MOIS.map((nom, i) => <option key={i} value={i + 1}>{nom}</option>)}
                </select>
                <input type="number" style={{ ...styles.date, width: 90 }} value={nouvelleCloture.annee}
                  onChange={(e) => setNouvelleCloture((c) => ({ ...c, annee: Number(e.target.value) }))} />
                <button style={styles.pdfBtn} disabled={envoiCloture} onClick={handleCloturerMois}>
                  <Lock size={14} /> Clôturer ce mois pour cette ferme
                </button>
              </div>
            </div>
          </section>
        )}

        {comparaisonBandes.length > 1 && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}><GitCompareArrows size={15} color={GREEN} /><span>Comparaison des bandes successives</span></div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Période</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Durée</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Effectif final</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Mortalité</th>
                    {comparaisonBandes[0].type_ferme === "PONTE" ? (
                      <>
                        <th style={{ ...styles.th, textAlign: "right" }}>Production</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Ponte moyenne</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>IC (g/œuf)</th>
                      </>
                    ) : (
                      <>
                        <th style={{ ...styles.th, textAlign: "right" }}>Poids début → fin</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>GMQ moyen</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>IC (kg/kg)</th>
                      </>
                    )}
                    <th style={{ ...styles.th, textAlign: "right" }}>Aliment</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Revenus</th>
                  </tr>
                </thead>
                <tbody>
                  {comparaisonBandes.map((b) => (
                    <tr key={`${b.date_mise_en_place}-${b.date_fin}`}>
                      <td style={styles.td}>
                        {new Date(b.date_mise_en_place).toLocaleDateString("fr-FR")} → {new Date(b.date_fin).toLocaleDateString("fr-FR")}
                        {b.statut === "ACTIVE" ? <span style={styles.badgeEnCours}>en cours</span> : ` · ${LABEL_MOTIF_FIN[b.motif_fin] || b.motif_fin || ""}`}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{b.duree_jours} j</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{nf(b.effectif_final)}</td>
                      <td style={{ ...styles.td, textAlign: "right", color: b.taux_mortalite > 5 ? CLAY : "inherit" }}>{nf(b.total_morts)} ({b.taux_mortalite.toFixed(1)} %)</td>
                      {b.type_ferme === "PONTE" ? (
                        <>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(b.total_production_oeufs)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{b.taux_ponte_moyen.toFixed(1)} %</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{b.ic_global_g_par_oeuf != null ? `${nf(b.ic_global_g_par_oeuf)} g` : "—"}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...styles.td, textAlign: "right" }}>{b.poids_initial_grammes ? `${nf(b.poids_initial_grammes)} g` : "—"} → {b.poids_final_grammes ? `${nf(b.poids_final_grammes)} g` : "—"}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{b.gmq_moyen_grammes != null ? `${nf(b.gmq_moyen_grammes)} g/j` : "—"}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{b.ic_global_kg_par_kg ?? "—"}</td>
                        </>
                      )}
                      <td style={{ ...styles.td, textAlign: "right" }}>{b.total_aliment_sacs} sacs</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{nf(b.revenus_ventes)} F</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {bandesTerminees.length > 0 && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}><Archive size={15} color={GREEN} /><span>Bandes terminées</span></div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Mise en place</th>
                    <th style={styles.th}>Fin</th>
                    <th style={styles.th}>Motif</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Effectif initial → final</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {bandesTerminees.map((b) => (
                    <tr key={b.id}>
                      <td style={styles.td}>{b.ferme_nom}</td>
                      <td style={styles.td}>{new Date(b.date_mise_en_place).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{b.date_fin ? new Date(b.date_fin).toLocaleDateString("fr-FR") : "—"}</td>
                      <td style={styles.td}>
                        {LABEL_MOTIF_FIN[b.motif_fin] || b.motif_fin}
                        {b.motif_fin === "TRANSFERT" && b.ferme_destination_nom ? ` → ${b.ferme_destination_nom}` : ""}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{nf(b.effectif_initial)} → {nf(b.effectif_actuel)}</td>
                      <td style={{ ...styles.td, width: 1 }}>
                        <button style={styles.pdfBtn} disabled={envoiBilan === b.id} onClick={() => telechargerBilan(b)}>
                          <Download size={14} /> {envoiBilan === b.id ? "..." : "Bilan"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : points.length === 0 ? (
            <p style={styles.empty}>Aucun point journalier sur cette période.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}></th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Morts</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Effectif</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Production</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Taux ponte</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Stock œuf</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => {
                    const estOuvert = ouvert === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr style={{ cursor: "pointer", ...(p.urgent ? styles.rowUrgente : {}) }} onClick={() => setOuvert(estOuvert ? null : p.id)}>
                          <td style={{ ...styles.td, width: 24 }}>
                            <ChevronRight size={15} color="#B5BBB2" style={{ transform: estOuvert ? "rotate(90deg)" : "none", transition: ".2s" }} />
                          </td>
                          <td style={styles.td}>
                            {new Date(p.date).toLocaleDateString("fr-FR")}
                            {p.urgent && <Siren size={13} color={CLAY} style={{ marginLeft: 6, verticalAlign: "middle" }} />}
                          </td>
                          <td style={styles.td}>{p.ferme_nom}</td>
                          <td style={{ ...styles.td, textAlign: "right", color: p.morts > 5 ? CLAY : "inherit" }}>{nf(p.morts)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.effectif_reste)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.production_oeufs)}</td>
                          <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>{Number(p.taux_ponte).toFixed(1)} %</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.stock_oeuf_total)}</td>
                        </tr>
                        {estOuvert && (
                          <tr>
                            <td colSpan={8} style={styles.detailCell}>
                              <div style={styles.detailGrid}>
                                {p.cause_morts && <DetailItem label="Cause de mortalité" value={LABEL_CAUSE_MORTS[p.cause_morts] || p.cause_morts} danger />}
                                <DetailItem label="Aliment consommé" value={`${p.conso_aliment_sacs} sacs`} />
                                <DetailItem label="Aliment reçu" value={`${p.aliment_recu_sacs} sacs`} />
                                <DetailItem label="Stock aliment après" value={formatSacs(Number(p.stock_aliment_apres_sacs))} />
                                {/* N'apparaît que si un transfert de stock a touché ce point ce
                                    jour-là — explique un saut de stock qui ne vient ni d'un achat
                                    ni de la consommation (cf. conversation du 31/07/2026). */}
                                {Number(p.aliment_transfert_entree_sacs) > 0 && <DetailItem label="Aliment reçu (transfert)" value={`${p.aliment_transfert_entree_sacs} sacs`} />}
                                {Number(p.aliment_transfert_sortie_sacs) > 0 && <DetailItem label="Aliment envoyé (transfert)" value={`${p.aliment_transfert_sortie_sacs} sacs`} />}
                                <DetailItem label="Alvéole reçu" value={`${nf(p.alveole_recu_unites)} unités`} />
                                <DetailItem label="Alvéole consommé" value={`${nf(p.alveole_conso_unites)} unités`} />
                                <DetailItem label="Stock alvéole après" value={formatColis(p.stock_alveole_apres_unites)} />
                                {p.alveole_transfert_entree_unites > 0 && <DetailItem label="Alvéole reçu (transfert)" value={`${nf(p.alveole_transfert_entree_unites)} unités`} />}
                                {p.alveole_transfert_sortie_unites > 0 && <DetailItem label="Alvéole envoyé (transfert)" value={`${nf(p.alveole_transfert_sortie_unites)} unités`} />}
                                {p.oeuf_transfert_entree_unites > 0 && <DetailItem label="Œufs reçus (transfert)" value={`${nf(p.oeuf_transfert_entree_unites)} œufs`} />}
                                {p.oeuf_transfert_sortie_unites > 0 && <DetailItem label="Œufs envoyés (transfert)" value={`${nf(p.oeuf_transfert_sortie_unites)} œufs`} />}
                                <DetailItem label="Cassé" value={`${nf(p.casse)} œufs`} />
                                <DetailItem label="Brisé" value={`${nf(p.brise)} œufs`} />
                                <DetailItem label="Sorties d'œufs" value={`${nf(p.sortie_oeuf)} œufs`} />
                                <DetailItem label="Sorties d'effectif" value={`${nf(p.sortie_effectif)} sujets`} />
                                {Number(p.eau_consommee_litres) > 0 && <DetailItem label="Eau consommée" value={`${p.eau_consommee_litres} litres`} />}
                                {p.poids_moyen_grammes != null && (
                                  <DetailItem label="Poids moyen (pesée)" value={`${nf(p.poids_moyen_grammes)} g`} />
                                )}
                                {p.gmq_grammes != null && <DetailItem label="GMQ" value={`${p.gmq_grammes} g/j`} />}
                                {p.poids_cible_grammes != null && (
                                  <DetailItem
                                    label="Poids cible (Cobb 500)"
                                    value={`${nf(p.poids_cible_grammes)} g`}
                                    danger={p.poids_moyen_grammes != null && Number(p.poids_moyen_grammes) < p.poids_cible_grammes}
                                  />
                                )}
                                {p.traitement && <DetailItem label="Traitement" value={p.traitement} />}
                              </div>
                              {p.sorties.length > 0 && (
                                <div style={styles.sortiesDetail}>
                                  <div style={styles.sortiesTitre}>Sorties d'œufs saisies</div>
                                  {p.sorties.map((s) => (
                                    <div key={s.id} style={styles.sortieLigne}>
                                      <span>{s.type_sortie === "VENTE" ? "Vente" : "Don"} — {s.responsable}</span>
                                      <span style={{ fontWeight: 600 }}>{nf(s.quantite)} œufs</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.observation && <p style={styles.observation}>« {p.observation} »</p>}
                              <div style={styles.pdfRow}>
                                <button style={styles.pdfBtn} onClick={() => telechargerPdf(genererPdfHistoriquePoint(p), nomFichierPoint(p))}>
                                  <Download size={15} /> Télécharger le PDF
                                </button>
                                {partageDisponible && (
                                  <button style={styles.pdfBtn} onClick={() => partagerPdf(genererPdfHistoriquePoint(p), nomFichierPoint(p))}>
                                    <Share2 size={15} /> Partager
                                  </button>
                                )}
                                {peutModifier(p) && (
                                  <Link to={`/point-journalier?ferme=${p.ferme_id}&date=${p.date}`} style={styles.pdfBtnLink}>
                                    <Pencil size={15} /> Modifier
                                  </Link>
                                )}
                                {peutSupprimer() && (
                                  <button style={styles.pdfBtn} disabled={envoi} onClick={() => recalculer(p)} title="Recalcule les stocks depuis cette date jusqu'à aujourd'hui (utile après l'ajout d'un jour manquant plus tôt)">
                                    <RefreshCw size={15} /> Recalculer
                                  </button>
                                )}
                                {peutSupprimer() && (
                                  <button style={styles.deleteBtn} disabled={envoi} onClick={() => supprimer(p)}>
                                    <Trash2 size={15} /> Supprimer
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DetailItem({ label, value, danger }) {
  return (
    <div style={styles.detailItem}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={{ ...styles.detailValue, ...(danger ? { color: CLAY } : {}) }}>{value}</span>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1000, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12.5, fontWeight: 500, padding: "9px 16px", marginBottom: 14, borderRadius: 10 },
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A857F" },
  date: { padding: "8px 10px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  clear: { padding: "8px 14px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 12.5, cursor: "pointer", color: "#7A857F", fontFamily: "inherit" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  resumeHead: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", fontSize: 13, fontWeight: 600, color: GREEN_DARK, borderBottom: "1px solid #ECE9DF" },
  badgeEnCours: { marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: GREEN_DARK, background: "#EAF3EE", borderRadius: 6, padding: "1px 6px", textTransform: "uppercase", letterSpacing: .3 },
  clotureRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: GREEN_DARK, background: "#F4F1EA", borderRadius: 9, padding: "7px 11px" },
  rowUrgente: { background: "#FDEEE8" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  detailCell: { padding: "14px 16px 18px 40px", background: "#FBFAF6", borderBottom: "1px solid #F2F0E8" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px 20px" },
  detailItem: { display: "flex", flexDirection: "column", gap: 2 },
  detailLabel: { fontSize: 11, color: "#8A948D" },
  detailValue: { fontSize: 13.5, fontWeight: 600, color: GREEN_DARK },
  sortiesDetail: { marginTop: 14, background: "#F4F1EA", borderRadius: 9, padding: "8px 11px" },
  sortiesTitre: { fontSize: 11, fontWeight: 600, color: "#8A948D", textTransform: "uppercase", letterSpacing: .5, marginBottom: 5 },
  sortieLigne: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: GREEN_DARK, padding: "3px 0" },
  observation: { marginTop: 12, fontSize: 12.5, color: "#6B756E", fontStyle: "italic", margin: "12px 0 0" },
  pdfRow: { display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" },
  pdfBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  pdfBtnLink: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textDecoration: "none" },
  deleteBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
};
