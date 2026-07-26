import { useState, useEffect, useCallback } from "react";
import { QrCode, Plus, X, Download, UserX, UserCheck, Pencil, Trash2, LifeBuoy } from "lucide-react";
import { getFermes, getEmployes, creerEmploye, modifierEmploye, supprimerEmploye, getQrEmployeBlob, getUtilisateursDisponibles, getQrBadgeTemporaireBlob } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

const LABEL_ROLE = { CHEF_FERME: "Chef de ferme", SOUS_CHEF_FERME: "Sous-chef de ferme", SUPERVISEUR: "Superviseur", OUVRIER: "Volailler", GARDIEN: "Gardien" };
const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function PointageEmployes() {
  const [fermes, setFermes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [fermeFiltre, setFermeFiltre] = useState("");
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [userId, setUserId] = useState("");
  const [nom, setNom] = useState("");
  const [fermesSelectionnees, setFermesSelectionnees] = useState([]);
  const [salaireMensuel, setSalaireMensuel] = useState("");
  const [jourRepos, setJourRepos] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [qrOuvert, setQrOuvert] = useState(null);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => { getFermes().then(setFermes); }, []);
  useEffect(() => { if (formOuvert) getUtilisateursDisponibles().then(setUtilisateurs); }, [formOuvert]);

  function choisirUtilisateur(id) {
    setUserId(id);
    const utilisateur = utilisateurs.find((u) => String(u.id) === String(id));
    if (utilisateur) {
      setNom(utilisateur.nom);
      setFermesSelectionnees(utilisateur.fermes.map((f) => f.id));
    } else {
      setNom("");
    }
  }

  function toggleFerme(id) {
    setFermesSelectionnees((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  const rafraichir = useCallback(() => {
    setChargement(true);
    const params = {};
    if (fermeFiltre) params.ferme = fermeFiltre;
    getEmployes(params).then((data) => { setEmployes(data); setChargement(false); });
  }, [fermeFiltre]);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  function fermerForm() {
    setFormOuvert(false); setEditionId(null);
    setNom(""); setFermesSelectionnees([]); setSalaireMensuel(""); setJourRepos(""); setUserId(""); setErreur("");
  }

  function commencerEdition(emp) {
    setEditionId(emp.id);
    setNom(emp.nom);
    setFermesSelectionnees(emp.fermes);
    setSalaireMensuel(String(emp.salaire_mensuel));
    setJourRepos(emp.jour_repos === null || emp.jour_repos === undefined ? "" : String(emp.jour_repos));
    setUserId("");
    setErreur("");
    setFormOuvert(true);
  }

  async function soumettre(e) {
    e.preventDefault();
    if (fermesSelectionnees.length === 0 || !salaireMensuel) return;
    setEnvoi(true);
    setErreur("");
    const payload = { nom, fermes: fermesSelectionnees, salaire_mensuel: salaireMensuel, jour_repos: jourRepos === "" ? null : jourRepos };
    try {
      if (editionId) {
        await modifierEmploye(editionId, payload);
      } else {
        await creerEmploye({ ...payload, user: userId || null });
      }
      fermerForm();
      rafraichir();
    } catch {
      setErreur(editionId ? "Impossible d'enregistrer les modifications." : "Impossible d'ajouter l'employé. Vérifie les champs.");
    } finally {
      setEnvoi(false);
    }
  }

  async function basculerActif(emp) {
    await modifierEmploye(emp.id, { actif: !emp.actif });
    rafraichir();
  }

  async function supprimer(emp) {
    if (!window.confirm(`Supprimer définitivement le badge de ${emp.nom} ?`)) return;
    try {
      await supprimerEmploye(emp.id);
      rafraichir();
    } catch (err) {
      window.alert(err?.response?.data?.detail || "Impossible de supprimer cet employé.");
    }
  }

  async function voirQr(emp) {
    setQrOuvert(emp);
    setQrUrl("");
    const url = await getQrEmployeBlob(emp.id);
    setQrUrl(url);
  }

  async function voirBadgeTemporaire() {
    setQrOuvert({ nom: "Badge temporaire", fermes_noms: "Secours — tous les employés", temporaire: true });
    setQrUrl("");
    const url = await getQrBadgeTemporaireBlob();
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
          <button style={styles.addBtn} onClick={() => (formOuvert ? fermerForm() : setFormOuvert(true))}>
            <Plus size={16} /> Ajouter un employé
          </button>
          <button style={styles.secoursBtn} onClick={voirBadgeTemporaire}>
            <LifeBuoy size={16} /> Badge temporaire
          </button>
        </div>

        {formOuvert && (
          <form style={styles.formCard} onSubmit={soumettre}>
            {!editionId && (
              <select style={styles.input} value={userId} onChange={(e) => choisirUtilisateur(e.target.value)}>
                <option value="">— Nouvel ouvrier sans compte —</option>
                {utilisateurs.map((u) => (
                  <option key={u.id} value={u.id}>{u.nom} ({LABEL_ROLE[u.role] || u.role})</option>
                ))}
              </select>
            )}
            <input style={styles.input} placeholder="Nom de l'employé" value={nom} onChange={(e) => setNom(e.target.value)} required />
            <div style={styles.fermesGroup}>
              <span style={styles.fermesLabel}>Ferme(s) :</span>
              {fermes.map((f) => (
                <label key={f.id} style={styles.fermeCheckbox}>
                  <input type="checkbox" checked={fermesSelectionnees.includes(f.id)} onChange={() => toggleFerme(f.id)} />
                  {f.nom}
                </label>
              ))}
            </div>
            <input style={styles.input} type="number" min="0" step="1" placeholder="Salaire mensuel (FCFA)" value={salaireMensuel} onChange={(e) => setSalaireMensuel(e.target.value)} required />
            <select style={styles.input} value={jourRepos} onChange={(e) => setJourRepos(e.target.value)}>
              <option value="">Jour de repos...</option>
              {JOURS_SEMAINE.map((j, i) => <option key={i} value={i}>{j}</option>)}
            </select>
            {erreur && <p style={styles.erreur}>{erreur}</p>}
            <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Enregistrement..." : editionId ? "Enregistrer les modifications" : "Ajouter"}</button>
            {editionId && <button type="button" style={styles.cancelBtn} onClick={fermerForm}>Annuler</button>}
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
                    <th style={styles.th}>Compte lié</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Salaire mensuel</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Taux horaire</th>
                    <th style={styles.th}>Repos</th>
                    <th style={styles.th}>Statut</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {employes.map((emp) => (
                    <tr key={emp.id}>
                      <td style={styles.td}>{emp.nom}</td>
                      <td style={styles.td}>{emp.user_nom ? <span style={{ color: GREEN_DARK }}>{emp.user_nom}</span> : <span style={{ color: "#B5BBB2" }}>—</span>}</td>
                      <td style={styles.td}>{emp.fermes_noms}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{emp.salaire_mensuel} F</td>
                      <td style={{ ...styles.td, textAlign: "right", color: "#8A948D" }}>{emp.taux_horaire} F/h</td>
                      <td style={styles.td}>{emp.jour_repos === null || emp.jour_repos === undefined ? "—" : JOURS_SEMAINE[emp.jour_repos]}</td>
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
                        <button style={styles.iconBtn} onClick={() => commencerEdition(emp)} title="Modifier (ex: changer de ferme)">
                          <Pencil size={16} />
                        </button>
                        <button style={{ ...styles.iconBtn, color: CLAY }} onClick={() => supprimer(emp)} title="Supprimer le badge">
                          <Trash2 size={16} />
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
            <p style={styles.modalSousTitre}>{qrOuvert.fermes_noms}</p>
            {qrUrl ? (
              <>
                <img src={qrUrl} alt="QR code" style={styles.qrImage} />
                <a href={qrUrl} download={`${qrOuvert.temporaire ? "badge-temporaire" : "qr-" + qrOuvert.nom.replace(/\s+/g, "-")}.png`} style={styles.downloadBtn}>
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
  secoursBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK, flex: "1 1 160px" },
  fermesGroup: { display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", flex: "1 1 100%" },
  fermesLabel: { fontSize: 12.5, color: "#7A857F", fontWeight: 600 },
  fermeCheckbox: { display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: INK, cursor: "pointer" },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  cancelBtn: { background: "#fff", color: "#7A857F", border: "1px solid #DAD5C7", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
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
