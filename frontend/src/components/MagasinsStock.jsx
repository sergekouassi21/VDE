import { useState, useEffect, useCallback } from "react";
import { Warehouse, AlertTriangle, ClipboardCheck, History, X } from "lucide-react";
import { getMagasins, getStockTheorique, getAjustementsMagasin, ajusterMagasin } from "../api/client";
import { estDirectionOuAdmin } from "../utils/auth";
import { GREEN, GREEN_DARK, INK, TEXTE_DOUX, TEXTE_GRIS, FOND_PAGE, ALERTE } from "../theme";
import ChampNombre from "./ChampNombre";

// Le magasin de toutes les fermes : ce qu'il reste en stock, et de quoi
// corriger un écart constaté (cf. conversation du 09/08/2026 avec Serge).
//
// Le stock n'est PAS une valeur qu'on saisit. Il se déduit, jour après jour,
// des entrées et des sorties du Point Journalier, et il est entièrement
// recalculé dès qu'une saisie passée est corrigée. Un bouton « modifier le
// stock » ne tiendrait donc pas une journée : la première correction de
// saisie l'effacerait.
//
// Ce qu'on enregistre ici, c'est un INVENTAIRE : à telle date, on a compté
// tant. L'écart est daté, signé, motivé, et la chaîne de calcul le rejoue
// comme le reste — il survit aux corrections.

const todayISO = () => new Date().toISOString().slice(0, 10);
const nombre = (v) => Number(v ?? 0);
const sacs = (v) => `${nombre(v).toFixed(2)} sacs`;

export default function MagasinsStock() {
  const [magasins, setMagasins] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [inventaire, setInventaire] = useState(null); // magasin en cours d'inventaire
  const [historique, setHistorique] = useState(null); // magasin dont on lit l'historique

  const rafraichir = useCallback(() => {
    setChargement(true);
    return getMagasins()
      .then(setMagasins)
      .catch(() => setMagasins([]))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  if (chargement) return <p style={styles.vide}>Chargement des magasins...</p>;
  if (magasins.length === 0) return null;

  return (
    <section style={styles.bloc}>
      <div style={styles.titreRangee}>
        <h2 style={styles.h2}><Warehouse size={16} style={{ verticalAlign: -3 }} /> Stock des magasins</h2>
        <span style={styles.sousTitre}>Mis à jour automatiquement par les Points Journaliers</span>
      </div>

      <div style={styles.grille}>
        {magasins.map((m) => (
          <article key={m.id} style={styles.carte}>
            <header style={styles.carteHead}>
              <span style={styles.magasinNom}>{m.nom}</span>
              {/* Un magasin peut servir plusieurs fermes : sans ce rappel, on
                  croirait à un doublon ou à un stock manquant. */}
              {m.fermes?.length > 0 && (
                <span style={styles.fermes}>{m.fermes.join(" · ")}</span>
              )}
            </header>

            <div style={styles.mesures}>
              <div style={styles.mesure}>
                <span style={styles.mesureLabel}>Aliment</span>
                <span style={{ ...styles.mesureValeur, color: m.sous_seuil_aliment ? ALERTE : GREEN_DARK }}>
                  {sacs(m.stock_aliment_sacs)}
                </span>
                {m.sous_seuil_aliment && (
                  <span style={styles.alerte}>
                    <AlertTriangle size={11} /> sous le seuil de {sacs(m.seuil_alerte_aliment_sacs)}
                  </span>
                )}
              </div>
              <div style={styles.mesure}>
                <span style={styles.mesureLabel}>Alvéoles</span>
                <span style={{ ...styles.mesureValeur, color: m.sous_seuil_alveoles ? ALERTE : GREEN_DARK }}>
                  {nombre(m.stock_alveoles_unites)}
                </span>
                {m.sous_seuil_alveoles && (
                  <span style={styles.alerte}>
                    <AlertTriangle size={11} /> sous le seuil de {nombre(m.seuil_alerte_alveoles_unites)}
                  </span>
                )}
              </div>
            </div>

            <footer style={styles.carteFooter}>
              {estDirectionOuAdmin() && (
                <button style={styles.btnPrincipal} onClick={() => setInventaire(m)}>
                  <ClipboardCheck size={13} /> Faire un inventaire
                </button>
              )}
              <button style={styles.btnDiscret} onClick={() => setHistorique(m)}>
                <History size={13} /> Écarts
              </button>
              {m.dernier_ajustement && (
                <span style={styles.dernier}>
                  dernier : {new Date(m.dernier_ajustement).toLocaleDateString("fr-FR")}
                </span>
              )}
            </footer>
          </article>
        ))}
      </div>

      {inventaire && (
        <ModaleInventaire
          magasin={inventaire}
          onFermer={() => setInventaire(null)}
          onEnregistre={() => { setInventaire(null); rafraichir(); }}
        />
      )}
      {historique && (
        <ModaleHistorique magasin={historique} onFermer={() => setHistorique(null)} />
      )}
    </section>
  );
}

function ModaleInventaire({ magasin, onFermer, onEnregistre }) {
  const [date, setDate] = useState(todayISO());
  const [theorique, setTheorique] = useState(null);
  const [alimentCompte, setAlimentCompte] = useState("");
  const [alveoleCompte, setAlveoleCompte] = useState("");
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  // Le théorique dépend de la date choisie : un inventaire rétroactif doit se
  // comparer au stock de CE jour-là, pas à celui d'aujourd'hui.
  useEffect(() => {
    let annule = false;
    setTheorique(null);
    getStockTheorique(magasin.id, date)
      .then((d) => { if (!annule) setTheorique(d); })
      .catch(() => { if (!annule) setTheorique(null); });
    return () => { annule = true; };
  }, [magasin.id, date]);

  // Pré-remplir avec le théorique ferait valider un écart nul sans compter.
  // Les champs restent vides : c'est un relevé, pas une confirmation.
  const ecartAliment = alimentCompte === "" || !theorique
    ? null
    : Number(alimentCompte) - nombre(theorique.aliment_theorique_sacs);
  const ecartAlveole = alveoleCompte === "" || !theorique
    ? null
    : Number(alveoleCompte) - nombre(theorique.alveole_theorique_unites);

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await ajusterMagasin(magasin.id, {
        date,
        aliment_compte_sacs: alimentCompte,
        alveole_compte_unites: alveoleCompte,
        motif: motif.trim(),
      });
      onEnregistre();
    } catch (err) {
      setErreur(err?.response?.data?.detail || "L'inventaire n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  }

  const complet = alimentCompte !== "" && alveoleCompte !== "" && motif.trim() !== "";

  return (
    <Modale titre={`Inventaire · ${magasin.nom}`} onFermer={onFermer}>
      <form onSubmit={soumettre} style={styles.form}>
        <p style={styles.explication}>
          Comptez le stock réel, puis saisissez-le ici. L'écart est enregistré à
          sa date, avec son motif — les saisies des jours précédents ne sont pas
          modifiées, et le stock repart du compte pour la suite.
        </p>

        <label style={styles.champ}>
          <span style={styles.champLabel}>Date du comptage</span>
          <input style={styles.input} type="date" max={todayISO()} value={date}
            onChange={(e) => setDate(e.target.value)} required />
        </label>

        <div style={styles.rangee}>
          <label style={styles.champ}>
            <span style={styles.champLabel}>Aliment compté (sacs)</span>
            <ChampNombre decimal style={styles.input} value={alimentCompte} onChange={setAlimentCompte} required />
            <span style={styles.aide}>
              L'application annonce {theorique ? sacs(theorique.aliment_theorique_sacs) : "..."}
            </span>
            {ecartAliment !== null && ecartAliment !== 0 && (
              <span style={{ ...styles.ecart, color: ecartAliment < 0 ? ALERTE : GREEN_DARK }}>
                écart {ecartAliment > 0 ? "+" : ""}{ecartAliment.toFixed(2)} sacs
              </span>
            )}
          </label>

          <label style={styles.champ}>
            <span style={styles.champLabel}>Alvéoles comptées</span>
            <ChampNombre style={styles.input} value={alveoleCompte} onChange={setAlveoleCompte} required />
            <span style={styles.aide}>
              L'application annonce {theorique ? nombre(theorique.alveole_theorique_unites) : "..."}
            </span>
            {ecartAlveole !== null && ecartAlveole !== 0 && (
              <span style={{ ...styles.ecart, color: ecartAlveole < 0 ? ALERTE : GREEN_DARK }}>
                écart {ecartAlveole > 0 ? "+" : ""}{ecartAlveole}
              </span>
            )}
          </label>
        </div>

        <label style={styles.champ}>
          <span style={styles.champLabel}>Motif</span>
          <input style={styles.input} maxLength={200} value={motif} placeholder="Inventaire mensuel, sacs crevés, livraison non saisie..."
            onChange={(e) => setMotif(e.target.value)} required />
          <span style={styles.aide}>
            Dans six mois, « −8 sacs » sans explication ne se distinguera plus d'une panne.
          </span>
        </label>

        {erreur && <p style={styles.erreur}>{erreur}</p>}

        <div style={styles.actions}>
          <button type="button" style={styles.btnDiscret} onClick={onFermer}>Annuler</button>
          <button type="submit" style={styles.btnPrincipal} disabled={envoi || !complet}>
            {envoi ? "Enregistrement..." : "Enregistrer l'inventaire"}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function ModaleHistorique({ magasin, onFermer }) {
  const [lignes, setLignes] = useState(null);

  useEffect(() => {
    let annule = false;
    getAjustementsMagasin(magasin.id)
      .then((d) => { if (!annule) setLignes(d); })
      .catch(() => { if (!annule) setLignes([]); });
    return () => { annule = true; };
  }, [magasin.id]);

  return (
    <Modale titre={`Écarts constatés · ${magasin.nom}`} onFermer={onFermer}>
      {lignes === null ? (
        <p style={styles.vide}>Chargement...</p>
      ) : lignes.length === 0 ? (
        <p style={styles.vide}>Aucun écart constaté sur ce magasin.</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Aliment</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Alvéoles</th>
                <th style={styles.th}>Motif</th>
                <th style={styles.th}>Par</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((a) => (
                <tr key={a.id}>
                  <td style={styles.td}>{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: nombre(a.ecart_aliment_sacs) < 0 ? ALERTE : GREEN_DARK, fontWeight: 600 }}>
                    {nombre(a.ecart_aliment_sacs) > 0 ? "+" : ""}{nombre(a.ecart_aliment_sacs).toFixed(2)}
                    <span style={styles.detail}> ({nombre(a.aliment_theorique_sacs).toFixed(2)} → {nombre(a.aliment_compte_sacs).toFixed(2)})</span>
                  </td>
                  <td style={{ ...styles.td, textAlign: "right", color: a.ecart_alveole_unites < 0 ? ALERTE : GREEN_DARK, fontWeight: 600 }}>
                    {a.ecart_alveole_unites > 0 ? "+" : ""}{a.ecart_alveole_unites}
                  </td>
                  <td style={styles.td}>{a.motif}</td>
                  <td style={styles.td}>{a.auteur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modale>
  );
}

function Modale({ titre, onFermer, children }) {
  return (
    <div style={styles.overlay} onClick={onFermer}>
      <div style={styles.modale} onClick={(e) => e.stopPropagation()}>
        <header style={styles.modaleHead}>
          <h3 style={styles.modaleTitre}>{titre}</h3>
          <button style={styles.fermer} onClick={onFermer} aria-label="Fermer"><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

const styles = {
  bloc: { marginBottom: 20 },
  titreRangee: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 12, color: TEXTE_DOUX },
  grille: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 },
  carte: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  carteHead: { display: "flex", flexDirection: "column", gap: 2 },
  magasinNom: { fontSize: 15, fontWeight: 700, color: INK },
  fermes: { fontSize: 11.5, color: TEXTE_DOUX },
  mesures: { display: "flex", gap: 16 },
  mesure: { display: "flex", flexDirection: "column", gap: 2, flex: 1 },
  mesureLabel: { fontSize: 11, color: TEXTE_DOUX, textTransform: "uppercase", letterSpacing: .5 },
  mesureValeur: { fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  alerte: { fontSize: 11, color: ALERTE, display: "flex", alignItems: "center", gap: 3 },
  carteFooter: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: "auto" },
  dernier: { fontSize: 11, color: TEXTE_DOUX },
  btnPrincipal: { background: GREEN, color: "#fff", border: "none", borderRadius: 9, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 },
  btnDiscret: { background: FOND_PAGE, color: TEXTE_GRIS, border: "1px solid #ECE9DF", borderRadius: 9, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 },

  overlay: { position: "fixed", inset: 0, background: "rgba(24,22,18,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 },
  modale: { background: "#fff", borderRadius: 18, border: "1px solid #ECE9DF", width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 20 },
  modaleHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  modaleTitre: { fontSize: 16, fontWeight: 700, margin: 0, color: INK },
  fermer: { background: "none", border: "none", cursor: "pointer", color: TEXTE_GRIS, display: "flex", padding: 4 },

  form: { display: "flex", flexDirection: "column", gap: 14 },
  explication: { fontSize: 12.5, color: TEXTE_GRIS, lineHeight: 1.55, margin: 0, background: FOND_PAGE, borderRadius: 12, padding: "10px 12px" },
  rangee: { display: "flex", gap: 12, flexWrap: "wrap" },
  champ: { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" },
  champLabel: { fontSize: 12, color: TEXTE_GRIS },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 14, fontFamily: "inherit", color: INK, width: "100%", boxSizing: "border-box" },
  aide: { fontSize: 11.5, color: TEXTE_DOUX },
  ecart: { fontSize: 12, fontWeight: 700 },
  erreur: { color: ALERTE, fontSize: 12.5, margin: 0 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end" },

  vide: { padding: 16, textAlign: "center", color: TEXTE_DOUX, fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: .5, color: TEXTE_DOUX, borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #F2F0E8", color: INK, verticalAlign: "top" },
  detail: { fontSize: 11, color: TEXTE_DOUX, fontWeight: 400 },
};
