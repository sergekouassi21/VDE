import { useState, useEffect, Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { getFermes, getPointsJournaliers } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, formatSacs, formatColis } from "../theme";

const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");

export default function Historique() {
  const [fermes, setFermes] = useState([]);
  const [points, setPoints] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [ouvert, setOuvert] = useState(null);

  useEffect(() => { getFermes().then(setFermes); }, []);

  useEffect(() => {
    setChargement(true);
    const params = {};
    if (fermeId) params.ferme = fermeId;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;
    getPointsJournaliers(params).then((data) => { setPoints(data); setChargement(false); });
  }, [fermeId, dateDebut, dateFin]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Historique</div>
          <h1 style={styles.h1}>Points journaliers enregistrés</h1>
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
                        <tr style={{ cursor: "pointer" }} onClick={() => setOuvert(estOuvert ? null : p.id)}>
                          <td style={{ ...styles.td, width: 24 }}>
                            <ChevronRight size={15} color="#B5BBB2" style={{ transform: estOuvert ? "rotate(90deg)" : "none", transition: ".2s" }} />
                          </td>
                          <td style={styles.td}>{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                          <td style={styles.td}>{p.ferme_nom}</td>
                          <td style={{ ...styles.td, textAlign: "right", color: p.morts > 5 ? CLAY : "inherit" }}>{nf(p.morts)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.effectif_reste)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.production_oeufs)}</td>
                          <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>{Number(p.taux_ponte).toFixed(1)} %</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{nf(p.stock_oeuf_total)}</td>
                        </tr>
                        {estOuvert && (
                          <tr key={`${p.id}-detail`}>
                            <td colSpan={8} style={styles.detailCell}>
                              <div style={styles.detailGrid}>
                                <DetailItem label="Aliment consommé" value={`${p.conso_aliment_sacs} sacs`} />
                                <DetailItem label="Aliment reçu" value={`${p.aliment_recu_sacs} sacs`} />
                                <DetailItem label="Stock aliment après" value={formatSacs(Number(p.stock_aliment_apres_sacs))} />
                                <DetailItem label="Alvéole reçu" value={`${nf(p.alveole_recu_unites)} unités`} />
                                <DetailItem label="Alvéole consommé (auto)" value={`${nf(p.alveole_conso_unites)} unités`} />
                                <DetailItem label="Stock alvéole après" value={formatColis(p.stock_alveole_apres_unites)} />
                                <DetailItem label="Cassé" value={`${nf(p.casse)} œufs`} />
                                <DetailItem label="Brisé" value={`${nf(p.brise)} œufs`} />
                                <DetailItem label="Sorties d'œufs" value={`${nf(p.sortie_oeuf)} œufs`} />
                                <DetailItem label="Sorties d'effectif" value={`${nf(p.sortie_effectif)} sujets`} />
                                {Number(p.eau_consommee_litres) > 0 && <DetailItem label="Eau consommée" value={`${p.eau_consommee_litres} litres`} />}
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

function DetailItem({ label, value }) {
  return (
    <div style={styles.detailItem}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
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
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
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
};
