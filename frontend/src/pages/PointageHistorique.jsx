import { useState, useEffect, useCallback, useMemo } from "react";
import { Pencil, Trash2, X, Download, FileText } from "lucide-react";
import { getFermes, getEmployes, getPointages, corrigerPointage, supprimerPointage } from "../api/client";
import { genererFichePaie, telechargerPdf } from "../utils/pdf";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

const separeMilliers = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (v) => `${separeMilliers(Number(v) || 0)} F`;
const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const pad = (n) => String(n).padStart(2, "0");
const dateISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function versDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PointageHistorique() {
  const [fermes, setFermes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [pointages, setPointages] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState("");
  const [employeId, setEmployeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [mois, setMois] = useState("");
  const [edition, setEdition] = useState(null);
  const [debutEdit, setDebutEdit] = useState("");
  const [finEdit, setFinEdit] = useState("");
  const [erreurEdit, setErreurEdit] = useState("");
  const [envoi, setEnvoi] = useState(false);

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

  const resumeParEmploye = useMemo(() => {
    const groupes = new Map();
    for (const p of pointages) {
      if (!p.heure_fin) continue; // journée pas terminée, pas encore comptabilisable
      if (!groupes.has(p.employe)) {
        groupes.set(p.employe, { employeId: p.employe, nom: p.employe_nom, fermeNom: p.ferme_nom, lignes: [], totalHeures: 0, totalMontant: 0 });
      }
      const g = groupes.get(p.employe);
      g.lignes.push(p);
      g.totalHeures += Number(p.heures_travaillees || 0);
      g.totalMontant += Number(p.montant_du_jour || 0);
    }
    return [...groupes.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [pointages]);

  const periodeLabel = useMemo(() => {
    if (dateDebut && dateFin) return `Du ${new Date(dateDebut).toLocaleDateString("fr-FR")} au ${new Date(dateFin).toLocaleDateString("fr-FR")}`;
    if (dateDebut) return `Depuis le ${new Date(dateDebut).toLocaleDateString("fr-FR")}`;
    if (dateFin) return `Jusqu'au ${new Date(dateFin).toLocaleDateString("fr-FR")}`;
    return "Toute la période";
  }, [dateDebut, dateFin]);

  function appliquerMois(valeur) {
    setMois(valeur);
    if (!valeur) return;
    const [an, m] = valeur.split("-").map(Number);
    setDateDebut(dateISO(new Date(an, m - 1, 1)));
    setDateFin(dateISO(new Date(an, m, 0)));
  }

  function telechargerFichePaie(groupe) {
    const lignesTriees = [...groupe.lignes].sort((a, b) => a.date.localeCompare(b.date));
    const doc = genererFichePaie({ nom: groupe.nom, ferme_nom: groupe.fermeNom }, periodeLabel, lignesTriees);
    telechargerPdf(doc, `fiche-paie-${groupe.nom.replace(/\s+/g, "-")}-${dateDebut || "periode"}.pdf`);
  }

  function ouvrirEdition(p) {
    setEdition(p);
    setDebutEdit(versDatetimeLocal(p.heure_debut));
    setFinEdit(versDatetimeLocal(p.heure_fin));
    setErreurEdit("");
  }

  async function enregistrerEdition(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreurEdit("");
    try {
      await corrigerPointage(edition.id, {
        heure_debut: debutEdit || null,
        heure_fin: finEdit || null,
      });
      setEdition(null);
      rafraichir();
    } catch {
      setErreurEdit("Impossible d'enregistrer — vérifie que le départ est bien après l'arrivée.");
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(p) {
    if (!window.confirm(`Supprimer le pointage de ${p.employe_nom} du ${new Date(p.date).toLocaleDateString("fr-FR")} ?`)) return;
    try {
      await supprimerPointage(p.id);
      rafraichir();
    } catch {
      window.alert("Impossible de supprimer ce pointage.");
    }
  }

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
            Mois
            <input type="month" style={styles.date} value={mois} onChange={(e) => appliquerMois(e.target.value)} />
          </label>
          <label style={styles.dateLabel}>
            Du
            <input type="date" style={styles.date} value={dateDebut} onChange={(e) => { setDateDebut(e.target.value); setMois(""); }} />
          </label>
          <label style={styles.dateLabel}>
            Au
            <input type="date" style={styles.date} value={dateFin} onChange={(e) => { setDateFin(e.target.value); setMois(""); }} />
          </label>
          {(fermeId || employeId || dateDebut || dateFin) && (
            <button style={styles.clear} onClick={() => { setFermeId(""); setEmployeId(""); setDateDebut(""); setDateFin(""); setMois(""); }}>
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

        {resumeParEmploye.length > 0 && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}>
              <FileText size={15} color={GREEN} />
              <span>Résumé par employé — {periodeLabel}</span>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Employé</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Jours</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Heures</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>À payer</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {resumeParEmploye.map((g) => (
                    <tr key={g.employeId}>
                      <td style={styles.td}>{g.nom}</td>
                      <td style={styles.td}>{g.fermeNom}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{g.lignes.length}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{g.totalHeures.toFixed(2)} h</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{fcfa(g.totalMontant)}</td>
                      <td style={styles.td}>
                        <button style={styles.pdfBtn} onClick={() => telechargerFichePaie(g)}>
                          <Download size={14} /> Fiche de paie
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
                    <th style={styles.th}></th>
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
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        <button style={styles.iconBtn} onClick={() => ouvrirEdition(p)} title="Corriger les heures">
                          <Pencil size={15} />
                        </button>
                        <button style={{ ...styles.iconBtn, color: CLAY }} onClick={() => supprimer(p)} title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {edition && (
        <div style={styles.modalOverlay} onClick={() => setEdition(null)}>
          <form style={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={enregistrerEdition}>
            <button type="button" style={styles.modalClose} onClick={() => setEdition(null)}><X size={18} /></button>
            <h2 style={styles.modalTitre}>{edition.employe_nom}</h2>
            <p style={styles.modalSousTitre}>{new Date(edition.date).toLocaleDateString("fr-FR")} · {edition.ferme_nom}</p>
            <label style={styles.champLabel}>
              Arrivée
              <input style={styles.champInput} type="datetime-local" value={debutEdit} onChange={(e) => setDebutEdit(e.target.value)} />
            </label>
            <label style={styles.champLabel}>
              Départ
              <input style={styles.champInput} type="datetime-local" value={finEdit} onChange={(e) => setFinEdit(e.target.value)} />
            </label>
            {erreurEdit && <p style={styles.erreurEdit}>{erreurEdit}</p>}
            <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Enregistrement..." : "Enregistrer"}</button>
          </form>
        </div>
      )}
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
  resumeHead: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", fontSize: 13, fontWeight: 600, color: GREEN_DARK, borderBottom: "1px solid #ECE9DF" },
  pdfBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  iconBtn: { background: "#F4F1EA", border: "1px solid #ECE9DF", borderRadius: 8, padding: 6, cursor: "pointer", color: GREEN_DARK, display: "flex" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 18, padding: 26, width: 320, maxWidth: "100%", position: "relative", display: "flex", flexDirection: "column", gap: 10 },
  modalClose: { position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "#8A948D" },
  modalTitre: { fontSize: 17, fontWeight: 700, margin: "4px 0 0" },
  modalSousTitre: { fontSize: 12.5, color: "#8A948D", margin: "0 0 8px" },
  champLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#6B756E" },
  champInput: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  erreurEdit: { color: "#9E4527", fontSize: 12.5, margin: 0 },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 6 },
};
