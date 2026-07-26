import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { getRentabilite } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

const pad = (n) => String(n).padStart(2, "0");
const moisCourant = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const separeMilliers = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (v) => `${separeMilliers(Number(v) || 0)} F`;

export default function Rentabilite() {
  const [mois, setMois] = useState(moisCourant());
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);

  const rafraichir = useCallback(() => {
    setChargement(true);
    getRentabilite({ mois: `${mois}-01` }).then((d) => {
      setDonnees(d);
      setChargement(false);
    });
  }, [mois]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Direction</div>
          <h1 style={styles.h1}>Rentabilité par ferme</h1>
        </header>

        <div style={styles.filters}>
          <label style={styles.dateLabel}>
            Mois
            <input type="month" style={styles.date} value={mois} onChange={(e) => setMois(e.target.value)} />
          </label>
        </div>

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : !donnees || donnees.fermes.length === 0 ? (
            <p style={styles.empty}>Aucune ferme visible.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ferme</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Revenus (ventes)</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Coût aliment</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Coût paie</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.fermes.map((f) => {
                    const positive = Number(f.marge) >= 0;
                    return (
                      <tr key={f.ferme_id}>
                        <td style={styles.td}>{f.ferme_nom}</td>
                        <td style={{ ...styles.td, textAlign: "right" }}>{fcfa(f.revenus)}</td>
                        <td style={{ ...styles.td, textAlign: "right", color: CLAY }}>
                          −{fcfa(f.cout_aliment)}
                          {f.prix_sac != null && <div style={styles.prixSacHint}>{fcfa(f.prix_sac)}/sac</div>}
                        </td>
                        <td style={{ ...styles.td, textAlign: "right", color: CLAY }}>−{fcfa(f.cout_paie)}</td>
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: positive ? GREEN_DARK : CLAY, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {fcfa(f.marge)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={styles.tdTotal}>Total</td>
                    <td style={{ ...styles.tdTotal, textAlign: "right" }}>{fcfa(donnees.total.revenus)}</td>
                    <td style={{ ...styles.tdTotal, textAlign: "right" }}>−{fcfa(donnees.total.cout_aliment)}</td>
                    <td style={{ ...styles.tdTotal, textAlign: "right" }}>−{fcfa(donnees.total.cout_paie)}</td>
                    <td style={{ ...styles.tdTotal, textAlign: "right", color: Number(donnees.total.marge) >= 0 ? GREEN_DARK : CLAY }}>
                      {fcfa(donnees.total.marge)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <p style={styles.note}>
          Revenus : lignes de facture émises sur le mois. Coût aliment : valorisé au prix moyen réel des commandes du magasin
          (cf. page Achats d'aliment), ou {fcfa(donnees?.prix_aliment_sac_defaut)}/sac par défaut si aucune commande n'est encore enregistrée.
          Coût paie : pointages + absences justifiées + frais/primes/avances/retenues du mois, réparti à parts égales entre les fermes d'un employé qui en couvre plusieurs.
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
  filters: { display: "flex", gap: 14, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A857F" },
  date: { padding: "8px 10px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  hint: { fontSize: 12.5, color: "#8A948D" },
  prixSacHint: { fontSize: 11, color: "#8A948D", fontWeight: 400 },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  tdTotal: { padding: "12px 16px", color: INK, fontWeight: 700, borderTop: "2px solid #ECE9DF", whiteSpace: "nowrap" },
  note: { fontSize: 12, color: "#8A948D", marginTop: 14, lineHeight: 1.5 },
};
