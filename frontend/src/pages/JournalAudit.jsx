import { useState, useEffect, useCallback } from "react";
import { ScrollText } from "lucide-react";
import { getJournalAudit } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

const LABEL_ACTION = { CREATION: "Création", MODIFICATION: "Modification", SUPPRESSION: "Suppression" };
const COULEUR_ACTION = { CREATION: GREEN_DARK, MODIFICATION: "#B8860B", SUPPRESSION: CLAY };
const MODELES = [
  "PointJournalier", "Facture", "VersementCreance", "Bande", "CommandeAliment",
  "EvenementSante", "Employe", "Pointage", "Absence", "LignePaie",
];

export default function JournalAudit() {
  const [entrees, setEntrees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [action, setAction] = useState("");
  const [modele, setModele] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const rafraichir = useCallback(() => {
    setChargement(true);
    const params = {};
    if (action) params.action = action;
    if (modele) params.modele = modele;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    getJournalAudit(params).then((data) => { setEntrees(data); setChargement(false); });
  }, [action, modele, dateDebut, dateFin]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Direction</div>
          <h1 style={styles.h1}>Journal d'audit</h1>
        </header>

        <div style={styles.filters}>
          <select style={styles.select} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Toutes les actions</option>
            <option value="CREATION">Création</option>
            <option value="MODIFICATION">Modification</option>
            <option value="SUPPRESSION">Suppression</option>
          </select>
          <select style={styles.select} value={modele} onChange={(e) => setModele(e.target.value)}>
            <option value="">Tous les types</option>
            {MODELES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label style={styles.dateLabel}>
            Du
            <input type="date" style={styles.date} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </label>
          <label style={styles.dateLabel}>
            Au
            <input type="date" style={styles.date} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </label>
          {(action || modele || dateDebut || dateFin) && (
            <button style={styles.clear} onClick={() => { setAction(""); setModele(""); setDateDebut(""); setDateFin(""); }}>
              Réinitialiser
            </button>
          )}
        </div>

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : entrees.length === 0 ? (
            <p style={styles.empty}>Aucune entrée pour ces filtres.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Utilisateur</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {entrees.map((e) => (
                    <tr key={e.id}>
                      <td style={styles.td}>{new Date(e.date).toLocaleString("fr-FR")}</td>
                      <td style={styles.td}>{e.utilisateur_nom}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: COULEUR_ACTION[e.action] }}>{LABEL_ACTION[e.action]}</td>
                      <td style={styles.td}>{e.modele}</td>
                      <td style={styles.td}>{e.objet_repr}{e.details ? ` — ${e.details}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={styles.note}>
          <ScrollText size={13} style={{ verticalAlign: -2 }} /> Limité aux 200 entrées les plus récentes pour les filtres actifs.
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
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A857F" },
  date: { padding: "8px 10px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  clear: { padding: "8px 14px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 12.5, cursor: "pointer", color: "#7A857F", fontFamily: "inherit" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  note: { fontSize: 12, color: "#8A948D", marginTop: 14, lineHeight: 1.5 },
};
