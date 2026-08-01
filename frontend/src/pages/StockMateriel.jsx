import { useState, useEffect, useCallback } from "react";
import { Pencil, Check, X, Wrench } from "lucide-react";
import { getInventaireEquipement, modifierInventaireEquipement } from "../api/client";
import { GREEN, GREEN_DARK, INK } from "../theme";

const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");

const LABEL_EQUIPEMENT = { MANGEOIRES: "Mangeoires", ABREUVOIRS: "Abreuvoirs" };

const CHAMPS = ["bon_etat", "gate", "reserve", "jete"];
const LABEL_CHAMP = { bon_etat: "Bon état", gate: "Gâté", reserve: "Réserve", jete: "Jeté" };

export default function StockMateriel() {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({});
  const [envoi, setEnvoi] = useState(false);

  const rafraichir = useCallback(() => {
    setChargement(true);
    let annule = false;
    getInventaireEquipement().then((data) => {
      if (annule) return;
      setLignes(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, []);

  useEffect(() => rafraichir(), [rafraichir]);

  function commencerEdition(ligne) {
    setEdition(ligne.id);
    setBrouillon({
      bon_etat: String(ligne.bon_etat), gate: String(ligne.gate),
      reserve: String(ligne.reserve), jete: String(ligne.jete),
    });
    setErreur("");
  }

  async function enregistrerEdition(id) {
    setEnvoi(true);
    setErreur("");
    try {
      await modifierInventaireEquipement(id, {
        bon_etat: Number(brouillon.bon_etat) || 0, gate: Number(brouillon.gate) || 0,
        reserve: Number(brouillon.reserve) || 0, jete: Number(brouillon.jete) || 0,
      });
      setEdition(null);
      rafraichir();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible d'enregistrer ces valeurs.");
    } finally {
      setEnvoi(false);
    }
  }

  const stockBrouillon = CHAMPS.reduce((acc, c, i) => (i < 3 ? acc + (Number(brouillon[c]) || 0) : acc - (Number(brouillon[c]) || 0)), 0);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Stock</div>
          <h1 style={styles.h1}>Stock de matériel</h1>
          <p style={styles.sous}>Mangeoires et abreuvoirs, par état — stock = bon état + gâté + réserve - jeté.</p>
        </header>

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : lignes.length === 0 ? (
            <p style={styles.empty}>Aucune ferme visible.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Type</th>
                    {CHAMPS.map((c) => <th key={c} style={{ ...styles.th, textAlign: "right" }}>{LABEL_CHAMP[c]}</th>)}
                    <th style={{ ...styles.th, textAlign: "right" }}>Stock</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const enEdition = edition === l.id;
                    return (
                      <tr key={l.id}>
                        <td style={styles.td}>{l.ferme_nom}</td>
                        <td style={styles.td}>{LABEL_EQUIPEMENT[l.type_equipement]}</td>
                        {CHAMPS.map((c) => (
                          <td key={c} style={{ ...styles.td, textAlign: "right" }}>
                            {enEdition ? (
                              <input
                                type="number" min="0" style={styles.tableInput} value={brouillon[c]}
                                onChange={(e) => setBrouillon((b) => ({ ...b, [c]: e.target.value }))}
                              />
                            ) : nf(l[c])}
                          </td>
                        ))}
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: GREEN_DARK }}>
                          {nf(enEdition ? stockBrouillon : l.stock)}
                        </td>
                        <td style={{ ...styles.td, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {enEdition ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} disabled={envoi} onClick={() => enregistrerEdition(l.id)}><Check size={14} /></button>
                              <button style={styles.actionBtn} disabled={envoi} onClick={() => setEdition(null)}><X size={14} /></button>
                            </div>
                          ) : (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} onClick={() => commencerEdition(l)}><Pencil size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {erreur && <p style={styles.erreur}>{erreur}</p>}

        <p style={styles.note}>
          <Wrench size={13} style={{ verticalAlign: -2 }} /> Déclarez ici l'état réel du matériel de chaque ferme — ces chiffres
          sont ceux utilisés (bon état) par les transferts d'équipement entre fermes.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  sous: { fontSize: 13, color: "#6B756E", margin: "6px 0 0" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  tableInput: { width: 70, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK, textAlign: "right" },
  actionsRow: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actionBtn: { background: "#F4F1EA", border: "none", color: GREEN_DARK, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: "12px 0 0" },
  note: { fontSize: 12, color: "#8A948D", marginTop: 14, lineHeight: 1.5 },
};
