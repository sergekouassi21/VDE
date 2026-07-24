import { useState, useEffect, useMemo } from "react";
import { ShoppingBasket } from "lucide-react";
import { getVentes, getFermes } from "../api/client";
import { GREEN, GREEN_DARK, INK } from "../theme";

const nf = (v) => (v ?? 0).toLocaleString("fr-FR");

export default function Ventes() {
  const [fermes, setFermes] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  useEffect(() => {
    getFermes().then(setFermes);
  }, []);

  useEffect(() => {
    setChargement(true);
    const params = {};
    if (fermeId) params.ferme = fermeId;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    getVentes(params).then((data) => { setVentes(data); setChargement(false); });
  }, [fermeId, dateDebut, dateFin]);

  const total = useMemo(() => ventes.reduce((s, v) => s + v.quantite, 0), [ventes]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div>
            <div style={styles.eyebrow}>Volailles de l'Est · Ventes</div>
            <h1 style={styles.h1}>Historique des ventes d'œufs</h1>
          </div>
        </header>

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

        <div style={styles.kpiRow}>
          <div style={styles.kpi}>
            <div style={styles.kpiIcon}><ShoppingBasket size={16} /></div>
            <div style={styles.kpiVal}>{nf(total)} <span style={styles.kpiSub}>œufs</span></div>
            <div style={styles.kpiLabel}>Total des ventes affichées ({ventes.length})</div>
          </div>
        </div>

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : ventes.length === 0 ? (
            <p style={styles.empty}>Aucune vente sur cette période.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Ferme</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                  <th style={styles.th}>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map((v) => (
                  <tr key={v.id}>
                    <td style={styles.td}>{new Date(v.date).toLocaleDateString("fr-FR")}</td>
                    <td style={styles.td}>{v.ferme}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>{nf(v.quantite)}</td>
                    <td style={styles.td}>{v.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A857F" },
  date: { padding: "8px 10px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  clear: { padding: "8px 14px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 12.5, cursor: "pointer", color: "#7A857F", fontFamily: "inherit" },
  kpiRow: { marginBottom: 16 },
  kpi: { background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ECE9DF", maxWidth: 260 },
  kpiIcon: { width: 30, height: 30, borderRadius: 8, background: "#EAF3EE", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN, marginBottom: 9 },
  kpiVal: { fontSize: 22, fontWeight: 700 },
  kpiSub: { fontSize: 12, fontWeight: 400, opacity: .7 },
  kpiLabel: { fontSize: 11.5, opacity: .78, marginTop: 2 },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK },
};
