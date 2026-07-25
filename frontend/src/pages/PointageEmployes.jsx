import { useState, useEffect, useCallback } from "react";
import { QrCode, Plus, X, Download, UserX, UserCheck } from "lucide-react";
import { getFermes, getEmployes, creerEmploye, modifierEmploye, getQrEmployeBlob } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

export default function PointageEmployes() {
  const [fermes, setFermes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [fermeFiltre, setFermeFiltre] = useState("");
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [ferme, setFerme] = useState("");
  const [tauxHoraire, setTauxHoraire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [qrOuvert, setQrOuvert] = useState(null);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => { getFermes().then(setFermes); }, []);

  const rafraichir = useCallback(() => {
    setChargement(true);
    const params = {};
    if (fermeFiltre) params.ferme = fermeFiltre;
    getEmployes(params).then((data) => { setEmployes(data); setChargement(false); });
  }, [fermeFiltre]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  async function ajouter(e) {
    e.preventDefault();
    if (!ferme || !tauxHoraire) return;
    setEnvoi(true);
    setErreur("");
    try {
      await creerEmploye({ nom, ferme, taux_horaire: tauxHoraire });
      setNom(""); setFerme(""); setTauxHoraire(""); setFormOuvert(false);
      rafraichir();
    } catch {
      setErreur("Impossible d'ajouter l'employé. Vérifie les champs.");
    } finally {
      setEnvoi(false);
    }
  }

  async function basculerActif(emp) {
    await modifierEmploye(emp.id, { actif: !emp.actif });
    rafraichir();
  }

  async function voirQr(emp) {
    setQrOuvert(emp);
    setQrUrl("");
    const url = await getQrEmployeBlob(emp.id);
    setQrUrl(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Pointage</div>
          <h1 style={styles.h1}>Employés &amp; badges QR</h1>
        </header>

        <div style={styles.filters}>
          <select style={styles.select} value={fermeFiltre} onChange={(e) => setFermeFiltre(e.target.value)}>
            <option value="">Toutes les fermes</option>
            {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <button style={styles.addBtn} onClick={() => setFormOuvert((o) => !o)}>
            <Plus size={16} /> Ajouter un employé
          </button>
        </div>

        {formOuvert && (
          <form style={styles.formCard} onSubmit={ajouter}>
            <input style={styles.input} placeholder="Nom de l'employé" value={nom} onChange={(e) => setNom(e.target.value)} required />
            <select style={styles.input} value={ferme} onChange={(e) => setFerme(e.target.value)} required>
              <option value="">Ferme...</option>
              {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
            <input style={styles.input} type="number" min="0" step="1" placeholder="Taux horaire (FCFA/h)" value={tauxHoraire} onChange={(e) => setTauxHoraire(e.target.value)} required />
            {erreur && <p style={styles.erreur}>{erreur}</p>}
            <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Ajout..." : "Ajouter"}</button>
          </form>
        )}

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : employes.length === 0 ? (
            <p style={styles.empty}>Aucun employé enregistré.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Nom</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Taux horaire</th>
                    <th style={styles.th}>Statut</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {employes.map((emp) => (
                    <tr key={emp.id}>
                      <td style={styles.td}>{emp.nom}</td>
                      <td style={styles.td}>{emp.ferme_nom}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{emp.taux_horaire} F/h</td>
                      <td style={styles.td}>
                        <span style={{ color: emp.actif ? GREEN : CLAY, fontWeight: 600 }}>{emp.actif ? "Actif" : "Désactivé"}</span>
                      </td>
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        <button style={styles.iconBtn} onClick={() => voirQr(emp)} title="Voir le badge QR">
                          <QrCode size={16} />
                        </button>
                        <button style={styles.iconBtn} onClick={() => basculerActif(emp)} title={emp.actif ? "Désactiver" : "Réactiver"}>
                          {emp.actif ? <UserX size={16} /> : <UserCheck size={16} />}
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

      {qrOuvert && (
        <div style={styles.modalOverlay} onClick={() => setQrOuvert(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setQrOuvert(null)}><X size={18} /></button>
            <h2 style={styles.modalTitre}>{qrOuvert.nom}</h2>
            <p style={styles.modalSousTitre}>{qrOuvert.ferme_nom}</p>
            {qrUrl ? (
              <>
                <img src={qrUrl} alt="QR code" style={styles.qrImage} />
                <a href={qrUrl} download={`qr-${qrOuvert.nom.replace(/\s+/g, "-")}.png`} style={styles.downloadBtn}>
                  <Download size={15} /> Télécharger le badge
                </a>
              </>
            ) : (
              <p style={styles.empty}>Génération du QR...</p>
            )}
          </div>
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
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  addBtn: { display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK, flex: "1 1 160px" },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: 0, width: "100%" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  iconBtn: { background: "#F4F1EA", border: "1px solid #ECE9DF", borderRadius: 8, padding: 7, cursor: "pointer", color: GREEN_DARK, display: "flex" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 18, padding: 26, width: 300, maxWidth: "100%", textAlign: "center", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  modalClose: { position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "#8A948D" },
  modalTitre: { fontSize: 17, fontWeight: 700, margin: "4px 0 0" },
  modalSousTitre: { fontSize: 12.5, color: "#8A948D", margin: "0 0 10px" },
  qrImage: { width: 220, height: 220, imageRendering: "pixelated" },
  downloadBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", marginTop: 10 },
};
