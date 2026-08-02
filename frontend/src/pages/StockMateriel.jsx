import { useState, useEffect, useCallback, useMemo } from "react";
import { Pencil, Check, X, Wrench, Plus, Trash2 } from "lucide-react";
import {
  getInventaireEquipement, modifierInventaireEquipement,
  getReceptionsEquipement, creerReceptionEquipement, modifierReceptionEquipement, supprimerReceptionEquipement,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";
import { estDirectionOuAdmin } from "../utils/auth";

const todayISO = () => new Date().toISOString().slice(0, 10);
const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");

const LABEL_EQUIPEMENT = { MANGEOIRES: "Mangeoires", ABREUVOIRS: "Abreuvoirs" };

const CHAMPS = ["bon_etat", "gate", "reserve", "jete"];
const LABEL_CHAMP = { bon_etat: "Bon état", gate: "Gâté", reserve: "Réserve", jete: "Jeté" };

const FORM_VIDE_RECEPTION = { date: todayISO(), ferme: "", type_equipement: "MANGEOIRES", quantite: "", observation: "" };

// Même règle que les transferts : un chef corrige librement le jour même,
// au-delà c'est réservé à la Direction (cf. conversation du 31/07/2026).
function peutModifier(r) {
  return estDirectionOuAdmin() || r.date === todayISO();
}

export default function StockMateriel() {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({});
  const [envoi, setEnvoi] = useState(false);

  const [receptions, setReceptions] = useState([]);
  const [chargementReceptions, setChargementReceptions] = useState(true);
  const [formReception, setFormReception] = useState(FORM_VIDE_RECEPTION);
  const [erreurReception, setErreurReception] = useState("");
  const [envoiReception, setEnvoiReception] = useState(false);
  const [editionReception, setEditionReception] = useState(null);
  const [brouillonReception, setBrouillonReception] = useState({ quantite: "", observation: "" });
  const [envoiEditionReception, setEnvoiEditionReception] = useState(false);

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

  const rafraichirReceptions = useCallback(() => {
    setChargementReceptions(true);
    let annule = false;
    getReceptionsEquipement().then((data) => {
      if (annule) return;
      setReceptions(data);
      setChargementReceptions(false);
    });
    return () => { annule = true; };
  }, []);

  useEffect(() => rafraichir(), [rafraichir]);
  useEffect(() => rafraichirReceptions(), [rafraichirReceptions]);

  const fermes = useMemo(() => {
    const vues = new Map();
    lignes.forEach((l) => vues.set(l.ferme, l.ferme_nom));
    return Array.from(vues, ([id, nom]) => ({ id, nom }));
  }, [lignes]);

  useEffect(() => {
    setFormReception((f) => (f.ferme ? f : { ...f, ferme: fermes[0]?.id ?? "" }));
  }, [fermes]);

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

  async function soumettreReception(e) {
    e.preventDefault();
    if (!formReception.ferme || !formReception.quantite) return;
    setEnvoiReception(true);
    setErreurReception("");
    try {
      await creerReceptionEquipement({
        date: formReception.date, ferme: formReception.ferme, type_equipement: formReception.type_equipement,
        quantite: formReception.quantite, observation: formReception.observation,
      });
      setFormReception((f) => ({ ...FORM_VIDE_RECEPTION, ferme: f.ferme, date: f.date }));
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      setErreurReception(err.response?.data?.detail || "Impossible d'enregistrer cette réception.");
    } finally {
      setEnvoiReception(false);
    }
  }

  function commencerEditionReception(r) {
    setEditionReception(r.id);
    setBrouillonReception({ quantite: String(r.quantite), observation: r.observation });
  }

  async function enregistrerEditionReception(id) {
    setEnvoiEditionReception(true);
    try {
      await modifierReceptionEquipement(id, {
        quantite: Number(brouillonReception.quantite) || 0, observation: brouillonReception.observation,
      });
      setEditionReception(null);
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de modifier cette réception.");
    } finally {
      setEnvoiEditionReception(false);
    }
  }

  async function supprimerReception(r) {
    if (!window.confirm(`Supprimer cette réception de ${nf(r.quantite)} ${LABEL_EQUIPEMENT[r.type_equipement].toLowerCase()} (${r.ferme_nom}) ?`)) return;
    try {
      await supprimerReceptionEquipement(r.id);
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de supprimer cette réception.");
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

        <form style={styles.formCard} onSubmit={soumettreReception}>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ferme</span>
              <select style={styles.input} value={formReception.ferme} onChange={(e) => setFormReception({ ...formReception, ferme: e.target.value })} required>
                <option value="">Sélectionner...</option>
                {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Type</span>
              <select style={styles.input} value={formReception.type_equipement} onChange={(e) => setFormReception({ ...formReception, type_equipement: e.target.value })}>
                {Object.entries(LABEL_EQUIPEMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date</span>
              <input style={styles.input} type="date" max={todayISO()} value={formReception.date} onChange={(e) => setFormReception({ ...formReception, date: e.target.value })} required />
            </label>
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Quantité reçue</span>
              <input
                style={styles.input} type="number" min="1" step="1"
                value={formReception.quantite} onChange={(e) => setFormReception({ ...formReception, quantite: e.target.value })} required
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Observation (optionnel)</span>
              <input style={styles.input} placeholder="Ex: achat fournisseur X" value={formReception.observation} onChange={(e) => setFormReception({ ...formReception, observation: e.target.value })} />
            </label>
          </div>
          {erreurReception && <p style={styles.erreur}>{erreurReception}</p>}
          <button style={styles.submitBtn} type="submit" disabled={envoiReception}>
            <Plus size={15} /> {envoiReception ? "Enregistrement..." : "Ajouter du matériel reçu"}
          </button>
        </form>

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
                                type="number" min="0" style={styles.tableInputNum} value={brouillon[c]}
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

        <h2 style={styles.h2}>Historique des réceptions</h2>
        <section style={styles.card}>
          {chargementReceptions ? (
            <p style={styles.empty}>Chargement...</p>
          ) : receptions.length === 0 ? (
            <p style={styles.empty}>Aucune réception enregistrée.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Type</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                    <th style={styles.th}>Observation</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {receptions.map((r) => {
                    const enEdition = editionReception === r.id;
                    return (
                      <tr key={r.id}>
                        <td style={styles.td}>{new Date(r.date).toLocaleDateString("fr-FR")}</td>
                        <td style={styles.td}>{r.ferme_nom}</td>
                        <td style={styles.td}>{LABEL_EQUIPEMENT[r.type_equipement]}</td>
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>
                          {enEdition ? (
                            <input type="number" style={styles.tableInput} value={brouillonReception.quantite}
                              onChange={(e) => setBrouillonReception((b) => ({ ...b, quantite: e.target.value }))} />
                          ) : `+${nf(r.quantite)}`}
                        </td>
                        <td style={{ ...styles.td, color: "#6B756E" }}>
                          {enEdition ? (
                            <input style={styles.tableInput} value={brouillonReception.observation}
                              onChange={(e) => setBrouillonReception((b) => ({ ...b, observation: e.target.value }))} />
                          ) : (r.observation || "—")}
                        </td>
                        <td style={{ ...styles.td, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {enEdition ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} disabled={envoiEditionReception} onClick={() => enregistrerEditionReception(r.id)}><Check size={14} /></button>
                              <button style={styles.actionBtn} disabled={envoiEditionReception} onClick={() => setEditionReception(null)}><X size={14} /></button>
                            </div>
                          ) : peutModifier(r) ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} onClick={() => commencerEditionReception(r)}><Pencil size={14} /></button>
                              <button style={{ ...styles.actionBtn, color: CLAY }} onClick={() => supprimerReception(r)}><Trash2 size={14} /></button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={styles.note}>
          <Wrench size={13} style={{ verticalAlign: -2 }} /> Une réception ajoute directement au bon état ; le tableau ci-dessus
          reste la seule façon de déclarer du matériel gâté, mis en réserve ou jeté. Ces chiffres (bon état) sont ceux utilisés
          par les transferts d'équipement entre fermes.
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
  h2: { fontSize: 16, fontWeight: 700, margin: "24px 0 12px", letterSpacing: -.2 },
  sous: { fontSize: 13, color: "#6B756E", margin: "6px 0 0" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#6B756E", flex: "1 1 160px" },
  fieldLabel: { fontSize: 11.5 },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  submitBtn: { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  tableInputNum: { width: 70, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK, textAlign: "right" },
  tableInput: { width: "100%", maxWidth: 140, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK },
  actionsRow: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actionBtn: { background: "#F4F1EA", border: "none", color: GREEN_DARK, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: "12px 0 0" },
  note: { fontSize: 12, color: "#8A948D", marginTop: 14, lineHeight: 1.5 },
};
