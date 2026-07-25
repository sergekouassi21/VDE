import { useState, useEffect, useCallback, useMemo } from "react";
import { getFermes, getEmployes, getPointages } from "../api/client";
import { GREEN, GREEN_DARK, INK } from "../theme";

const separeMilliers = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (v) => `${separeMilliers(Number(v) || 0)} F`;
const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function PointageHistorique() {
  const [fermes, setFermes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [pointages, setPointages] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState("");
  const [employeId, setEmployeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  useEffect(() => { getFermes().then(setFermes); }, []);
  useEffect(() => {
    getEmployes(fermeId ? { ferme: fermeId } : {}).then(setEmployes);
    setEmployeId("");
  }, [fermeId]);

  const rafraichir = useCallback(() => {
    setChargement(true);
    const params = {};
    if (fermeId) params.ferme = fermeId;
    if (employeId) params.employe = employeId;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    getPointages(params).then((data) => { setPointages(data); setChargement(false); });
  }, [fermeId, employeId, dateDebut, dateFin]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  const totaux = useMemo(() => ({
    heures: pointages.reduce((s, p) => s + Number(p.heures_travaillees || 0), 0),
    montant: pointages.reduce((s, p) => s + Number(p.montant_du_jour || 0), 0),
  }), [pointages]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Pointage</div>
          <h1 style={styles.h1}>Historique des heures travaillées</h1>
        </header>

        <div style={styles.filters}>
          <select style={styles.select} value={fermeId} onChange={(e) => setFermeId(e.target.value)}>
            <option value="">Toutes les fermes</option>
            {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <select style={styles.select} value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
            <option value="">Tous les employés</option>
            {employes.map((emp) => <option key={emp.id} value={emp.id}>{emp.nom}</option>)}
          </select>
          <label style={styles.dateLabel}>
            Du
            <input type="date" style={styles.date} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </label>
          <label style={styles.dateLabel}>
            Au
            <input type="date" style={styles.date} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </label>
          {(fermeId || employeId || dateDebut || dateFin) && (
            <button style={styles.clear} onClick={() => { setFermeId(""); setEmployeId(""); setDateDebut(""); setDateFin(""); }}>
              Réinitialiser
            </button>
          )}
        </div>

        {pointages.length > 0 && (
          <div style={styles.totaux}>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total heures</span><span style={styles.totalValeur}>{totaux.heures.toFixed(2)} h</span></div>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total à payer</span><span style={styles.totalValeur}>{fcfa(totaux.montant)}</span></div>
          </div>
        )}

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : pointages.length === 0 ? (
            <p style={styles.empty}>Aucun pointage sur cette période.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Employé</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Arrivée</th>
                    <th style={styles.th}>Départ</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Heures</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p) => (
                    <tr key={p.id}>
                      <td style={styles.td}>{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{p.employe_nom}</td>
                      <td style={styles.td}>{p.ferme_nom}</td>
                      <td style={styles.td}>{heure(p.heure_debut)}</td>
                      <td style={styles.td}>{heure(p.heure_fin)}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{p.heure_fin ? `${p.heures_travaillees} h` : "—"}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{p.heure_fin ? fcfa(p.montant_du_jour) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1000, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A857F" },
  date: { padding: "8px 10px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  clear: { padding: "8px 14px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 12.5, cursor: "pointer", color: "#7A857F", fontFamily: "inherit" },
  totaux: { display: "flex", gap: 12, marginBottom: 16 },
  totalItem: { background: "#fff", borderRadius: 14, border: "1px solid #ECE9DF", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 2 },
  totalLabel: { fontSize: 11, color: "#8A948D", textTransform: "uppercase", letterSpacing: .5 },
  totalValeur: { fontSize: 18, fontWeight: 700, color: GREEN_DARK },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
};
