import { useState, useEffect, useCallback } from "react";
import { QrCode, Plus, X, Download, UserX, UserCheck, Pencil, Trash2, LifeBuoy, CalendarX, FileText, Upload, Smartphone, RefreshCw } from "lucide-react";
import {
  getFermes, getEmployes, creerEmploye, modifierEmploye, supprimerEmploye, getQrEmployeBlob, regenererQrEmployeBlob, getUtilisateursDisponibles,
  getQrBadgeTemporaireBlob, getQrBadgeAbsenceBlob, getQrAppareilPointageBlob, regenererAppareilPointageBlob,
  getStatutAppareilPointage, desactiverAppareilPointage,
  getDocumentsEmploye, uploaderDocumentEmploye, supprimerDocumentEmploye, getDocumentEmployeBlob,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, TEXTE_DOUX, TEXTE_META, FOND_PAGE, FOND_PAGE_ALT, ALERTE } from "../theme";

const LABEL_ROLE = { CHEF_FERME: "Chef de ferme", SOUS_CHEF_FERME: "Sous-chef de ferme", SUPERVISEUR: "Superviseur", OUVRIER: "Volailler", GARDIEN: "Gardien" };
const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const LABEL_TYPE_DOCUMENT = { CNI: "Carte Nationale d'Identité", CONTRAT: "Contrat de travail", AUTRE: "Autre document" };
const TYPE_DOCUMENT_VIDE = { type_document: "CNI", nom: "", fichier: null };

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
  const [appareilInfo, setAppareilInfo] = useState(null);
  const [documentsOuvert, setDocumentsOuvert] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [chargementDocs, setChargementDocs] = useState(false);
  const [formDoc, setFormDoc] = useState(TYPE_DOCUMENT_VIDE);
  const [envoiDoc, setEnvoiDoc] = useState(false);
  const [erreurDoc, setErreurDoc] = useState("");
  // Empêche un double-clic sur une action irréversible (régénérer un badge/
  // le téléphone invalide immédiatement l'ancien) d'envoyer deux requêtes à
  // la suite — cf. audit du 30/07/2026.
  const [actionEnCours, setActionEnCours] = useState(false);

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
    let annule = false;
    getEmployes(params).then((data) => {
      if (annule) return;
      setEmployes(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, [fermeFiltre]);

  // Empêche une réponse obsolète (changement rapide de filtre pendant le
  // chargement) d'écraser un state plus récent — cf. audit du 30/07/2026.
  useEffect(() => rafraichir(), [rafraichir]);

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
    if (actionEnCours) return;
    setActionEnCours(true);
    try {
      await modifierEmploye(emp.id, { actif: !emp.actif });
      rafraichir();
    } catch {
      window.alert("Impossible de modifier cet employé.");
    } finally {
      setActionEnCours(false);
    }
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

  async function regenererBadgeEmploye(emp) {
    if (actionEnCours) return;
    if (!window.confirm(`Régénérer le badge de ${emp.nom} ? L'ancienne carte imprimée ne fonctionnera plus — il faudra réimprimer/redistribuer le nouveau QR.`)) return;
    setActionEnCours(true);
    setQrUrl("");
    try {
      const url = await regenererQrEmployeBlob(emp.id);
      setQrUrl(url);
    } finally {
      setActionEnCours(false);
    }
  }

  async function ouvrirDocuments(emp) {
    setDocumentsOuvert(emp);
    setFormDoc(TYPE_DOCUMENT_VIDE);
    setErreurDoc("");
    setChargementDocs(true);
    const data = await getDocumentsEmploye(emp.id);
    setDocuments(data);
    setChargementDocs(false);
  }

  async function ajouterDocument(e) {
    e.preventDefault();
    if (!formDoc.fichier) return;
    setEnvoiDoc(true);
    setErreurDoc("");
    try {
      const data = new FormData();
      data.append("employe", documentsOuvert.id);
      data.append("type_document", formDoc.type_document);
      data.append("nom", formDoc.nom);
      data.append("fichier", formDoc.fichier);
      await uploaderDocumentEmploye(data);
      setFormDoc(TYPE_DOCUMENT_VIDE);
      const liste = await getDocumentsEmploye(documentsOuvert.id);
      setDocuments(liste);
    } catch {
      setErreurDoc("Impossible d'enregistrer ce document.");
    } finally {
      setEnvoiDoc(false);
    }
  }

  // Le document n'a plus d'URL publique : on le récupère via l'API, qui
  // vérifie le rôle, puis on l'ouvre depuis la mémoire du navigateur. L'URL
  // temporaire est libérée après ouverture pour ne pas laisser la pièce
  // d'identité en mémoire toute la session.
  async function ouvrirDocument(doc) {
    try {
      const url = await getDocumentEmployeBlob(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      window.alert("Impossible d'ouvrir ce document.");
    }
  }

  async function supprimerDocument(doc) {
    if (!window.confirm(`Supprimer « ${doc.nom || LABEL_TYPE_DOCUMENT[doc.type_document]} » ?`)) return;
    await supprimerDocumentEmploye(doc.id);
    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
  }

  async function voirBadgeTemporaire() {
    setQrOuvert({ nom: "Badge temporaire", fermes_noms: "Secours — tous les employés", temporaire: true });
    setQrUrl("");
    const url = await getQrBadgeTemporaireBlob();
    setQrUrl(url);
  }

  async function voirBadgeAbsence() {
    setQrOuvert({ nom: "Badge absence", fermes_noms: "Signalement d'absence — tous les employés", absence: true });
    setQrUrl("");
    const url = await getQrBadgeAbsenceBlob();
    setQrUrl(url);
  }

  async function voirAppareilPointage() {
    setQrOuvert({ nom: "Téléphone de pointage", fermes_noms: "Protection : un seul appareil autorisé à valider les pointages", appareil: true });
    setQrUrl("");
    setAppareilInfo(null);
    const statut = await getStatutAppareilPointage();
    setAppareilInfo(statut);
    if (statut.actif) {
      const url = await getQrAppareilPointageBlob();
      setQrUrl(url);
    }
  }

  // Action explicite et distincte du simple affichage — sinon consulter la
  // fenêtre suffirait à activer la protection avant que le téléphone désigné
  // soit prêt à scanner le QR, bloquant tous les pointages entretemps (cf.
  // conversation du 28/07/2026 avec Serge : "le téléphone n'est pas encore
  // disponible").
  async function activerAppareil() {
    const url = await getQrAppareilPointageBlob();
    setQrUrl(url);
    setAppareilInfo({ actif: true });
  }

  async function regenererAppareil() {
    if (actionEnCours) return;
    if (!window.confirm("Régénérer invalide immédiatement l'ancien téléphone — il ne pourra plus valider aucun pointage tant qu'il n'aura pas re-scanné le nouveau QR. Continuer ?")) return;
    setActionEnCours(true);
    setQrUrl("");
    try {
      const url = await regenererAppareilPointageBlob();
      setQrUrl(url);
    } finally {
      setActionEnCours(false);
    }
  }

  async function desactiverAppareil() {
    if (actionEnCours) return;
    if (!window.confirm("Désactiver la protection ? N'importe quel téléphone pourra de nouveau valider un pointage, sans jeton particulier.")) return;
    setActionEnCours(true);
    try {
      await desactiverAppareilPointage();
      setAppareilInfo({ actif: false });
      setQrUrl("");
    } finally {
      setActionEnCours(false);
    }
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
          <button style={styles.secoursBtn} onClick={voirBadgeAbsence}>
            <CalendarX size={16} /> Badge absence
          </button>
          <button style={styles.secoursBtn} onClick={voirAppareilPointage}>
            <Smartphone size={16} /> Téléphone de pointage
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
                      <td style={{ ...styles.td, textAlign: "right", color: TEXTE_DOUX }}>{emp.taux_horaire} F/h</td>
                      <td style={styles.td}>{emp.jour_repos === null || emp.jour_repos === undefined ? "—" : JOURS_SEMAINE[emp.jour_repos]}</td>
                      <td style={styles.td}>
                        <span style={{ color: emp.actif ? GREEN : CLAY, fontWeight: 600 }}>{emp.actif ? "Actif" : "Désactivé"}</span>
                      </td>
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        <button style={styles.iconBtn} onClick={() => voirQr(emp)} title="Voir le badge QR">
                          <QrCode size={16} />
                        </button>
                        <button style={styles.iconBtn} onClick={() => ouvrirDocuments(emp)} title="Documents (CNI, contrat...)">
                          <FileText size={16} />
                        </button>
                        <button style={styles.iconBtn} onClick={() => basculerActif(emp)} disabled={actionEnCours} title={emp.actif ? "Désactiver" : "Réactiver"}>
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
            {qrOuvert.appareil ? (
              appareilInfo === null ? (
                <p style={styles.empty}>Chargement...</p>
              ) : !appareilInfo.actif ? (
                <>
                  <p style={styles.empty}>Protection actuellement désactivée — n'importe quel téléphone peut valider un pointage.</p>
                  <button type="button" style={styles.activerBtn} onClick={activerAppareil}>Activer et générer le QR</button>
                </>
              ) : qrUrl ? (
                <>
                  <img src={qrUrl} alt="QR code" style={styles.qrImage} />
                  <a href={qrUrl} download="appareil-pointage.png" style={styles.downloadBtn}>
                    <Download size={15} /> Télécharger le badge
                  </a>
                  <button type="button" style={styles.regenererBtn} onClick={regenererAppareil} disabled={actionEnCours}>
                    <RefreshCw size={14} /> Régénérer (invalide l'ancien téléphone)
                  </button>
                  <button type="button" style={{ ...styles.regenererBtn, marginTop: 8 }} onClick={desactiverAppareil} disabled={actionEnCours}>
                    <UserX size={14} /> Désactiver la protection
                  </button>
                </>
              ) : (
                <p style={styles.empty}>Génération du QR...</p>
              )
            ) : qrUrl ? (
              <>
                <img src={qrUrl} alt="QR code" style={styles.qrImage} />
                <a href={qrUrl} download={`${qrOuvert.temporaire ? "badge-temporaire" : qrOuvert.absence ? "badge-absence" : "qr-" + qrOuvert.nom.replace(/\s+/g, "-")}.png`} style={styles.downloadBtn}>
                  <Download size={15} /> Télécharger le badge
                </a>
                {qrOuvert.id && (
                  <button type="button" style={styles.regenererBtn} onClick={() => regenererBadgeEmploye(qrOuvert)} disabled={actionEnCours}>
                    <RefreshCw size={14} /> Régénérer (invalide l'ancienne carte)
                  </button>
                )}
              </>
            ) : (
              <p style={styles.empty}>Génération du QR...</p>
            )}
          </div>
        </div>
      )}

      {documentsOuvert && (
        <div style={styles.modalOverlay} onClick={() => setDocumentsOuvert(null)}>
          <div style={{ ...styles.modal, width: 400, textAlign: "left", alignItems: "stretch" }} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setDocumentsOuvert(null)}><X size={18} /></button>
            <h2 style={styles.modalTitre}>Documents — {documentsOuvert.nom}</h2>

            {chargementDocs ? (
              <p style={styles.empty}>Chargement...</p>
            ) : documents.length === 0 ? (
              <p style={styles.empty}>Aucun document enregistré.</p>
            ) : (
              <div style={styles.docListe}>
                {documents.map((d) => (
                  <div key={d.id} style={styles.docLigne}>
                    <div>
                      <div style={styles.docNom}>{d.nom || LABEL_TYPE_DOCUMENT[d.type_document]}</div>
                      <div style={styles.docMeta}>{LABEL_TYPE_DOCUMENT[d.type_document]} · {new Date(d.date_ajout).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={styles.iconBtn} onClick={() => ouvrirDocument(d)} title="Ouvrir">
                        <Download size={14} />
                      </button>
                      <button style={{ ...styles.iconBtn, color: CLAY }} onClick={() => supprimerDocument(d)} title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form style={styles.docForm} onSubmit={ajouterDocument}>
              <select style={styles.input} value={formDoc.type_document} onChange={(e) => setFormDoc({ ...formDoc, type_document: e.target.value })}>
                {Object.entries(LABEL_TYPE_DOCUMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input style={styles.input} placeholder="Libellé (optionnel)" value={formDoc.nom} onChange={(e) => setFormDoc({ ...formDoc, nom: e.target.value })} />
              <input style={styles.input} type="file" onChange={(e) => setFormDoc({ ...formDoc, fichier: e.target.files[0] || null })} required />
              {erreurDoc && <p style={styles.erreur}>{erreurDoc}</p>}
              <button style={styles.submitBtn} type="submit" disabled={envoiDoc}>
                <Upload size={14} /> {envoiDoc ? "Envoi..." : "Ajouter le document"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: FOND_PAGE_ALT, fontFamily: "inherit", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1000, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 14, fontFamily: "inherit", color: INK },
  addBtn: { display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  secoursBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 14, fontFamily: "inherit", color: INK, flex: "1 1 160px" },
  fermesGroup: { display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", flex: "1 1 100%" },
  fermesLabel: { fontSize: 12.5, color: TEXTE_META, fontWeight: 600 },
  fermeCheckbox: { display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: INK, cursor: "pointer" },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  cancelBtn: { background: "#fff", color: TEXTE_META, border: "1px solid #DAD5C7", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: ALERTE, fontSize: 12.5, margin: 0, width: "100%" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: TEXTE_DOUX, fontSize: 14, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: .5, color: TEXTE_DOUX, borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  iconBtn: { background: FOND_PAGE, border: "1px solid #ECE9DF", borderRadius: 8, padding: 7, cursor: "pointer", color: GREEN_DARK, display: "flex" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 18, padding: 26, width: 300, maxWidth: "100%", textAlign: "center", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  modalClose: { position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: TEXTE_DOUX },
  modalTitre: { fontSize: 17, fontWeight: 700, margin: "4px 0 0" },
  modalSousTitre: { fontSize: 12.5, color: TEXTE_DOUX, margin: "0 0 10px" },
  qrImage: { width: 220, height: 220, imageRendering: "pixelated" },
  downloadBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 9, padding: "9px 16px", fontSize: 14, fontWeight: 600, textDecoration: "none", marginTop: 10 },
  regenererBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 9, padding: "9px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 8 },
  activerBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 9, padding: "11px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%", marginTop: 6 },
  docListe: { display: "flex", flexDirection: "column", gap: 8, margin: "10px 0" },
  docLigne: { display: "flex", justifyContent: "space-between", alignItems: "center", background: FOND_PAGE, borderRadius: 10, padding: "9px 12px" },
  docNom: { fontSize: 14, fontWeight: 600, color: INK },
  docMeta: { fontSize: 12, color: TEXTE_DOUX, marginTop: 2 },
  docForm: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #ECE9DF" },
};
