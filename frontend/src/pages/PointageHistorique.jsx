import { useState, useEffect, useCallback, useMemo } from "react";
import { Pencil, Trash2, X, Download, FileText, UserMinus, Wallet, Check, Ban, LifeBuoy } from "lucide-react";
import {
  getFermes, getEmployes, getPointages, corrigerPointage, supprimerPointage,
  getAbsences, declarerAbsence, supprimerAbsence, validerAbsence, rejeterAbsence, getLignesPaie, enregistrerLignePaie,
  getResumePaie,
} from "../api/client";
import { genererFichePaie, telechargerPdf } from "../utils/pdf";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

const LABEL_MODE_PAIEMENT = {
  WAVE: "Wave", ORANGE_MONEY: "Orange Money", MTN_MONEY: "MTN Money",
  MOOV_MONEY: "Moov Money", ESPECES: "Main en main", VIREMENT: "Virement bancaire",
};
const LIGNE_PAIE_VIDE = {
  frais: "0", primes: "0", avances: "0", retenues: "0", carburant: "0", appel_internet: "0",
  mode_paiement: "", reference_transaction: "", date_paiement: "", statut: "A_PAYER",
};

const separeMilliers = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (v) => `${separeMilliers(Number(v) || 0)} F`;
// timeZone explicite : sans lui, l'heure s'affiche dans le fuseau du
// navigateur (souvent réglé sur l'heure française, GMT+1/+2) au lieu de
// l'heure d'Abidjan (GMT+0) — cf. conversation du 02/08/2026 avec Serge.
const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }) : "—");
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
  const [absences, setAbsences] = useState([]);
  const [lignesPaie, setLignesPaie] = useState([]);
  const [resume, setResume] = useState([]);
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

  const [formAbsenceOuvert, setFormAbsenceOuvert] = useState(false);
  const [absEmploye, setAbsEmploye] = useState("");
  const [absDate, setAbsDate] = useState("");
  const [absMotif, setAbsMotif] = useState("");
  const [erreurAbsence, setErreurAbsence] = useState("");

  const [editionPaie, setEditionPaie] = useState(null);
  const [formPaie, setFormPaie] = useState(LIGNE_PAIE_VIDE);
  const [erreurPaie, setErreurPaie] = useState("");
  const [envoiPaie, setEnvoiPaie] = useState(false);

  const moisPremierJour = mois ? `${mois}-01` : "";

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
    const paieParams = { ...params };
    if (moisPremierJour) paieParams.mois = moisPremierJour;
    let annule = false;
    Promise.all([
      getPointages(params),
      getAbsences(params),
      moisPremierJour ? getLignesPaie(paieParams) : Promise.resolve([]),
      getResumePaie(paieParams),
    ]).then(([pts, abs, paie, resumeData]) => {
      if (annule) return;
      setPointages(pts); setAbsences(abs); setLignesPaie(paie); setResume(resumeData); setChargement(false);
    });
    return () => { annule = true; };
  }, [fermeId, employeId, dateDebut, dateFin, moisPremierJour]);

  // Empêche une réponse obsolète (changement rapide de filtre pendant le
  // chargement) d'écraser un state plus récent — cf. audit du 30/07/2026.
  useEffect(() => rafraichir(), [rafraichir]);

  const totaux = useMemo(() => ({
    heures: pointages.reduce((s, p) => s + Number(p.heures_travaillees || 0), 0),
    montant: pointages.reduce((s, p) => s + Number(p.montant_du_jour || 0), 0),
  }), [pointages]);

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
    const lignesTriees = [...groupe.lignesTravaillees].sort((a, b) => a.date.localeCompare(b.date));
    const absencesTriees = [...groupe.absencesJustifiees].sort((a, b) => a.date.localeCompare(b.date));
    const doc = genererFichePaie(
      { nom: groupe.nom, ferme_nom: groupe.fermeNom, role: groupe.role, telephone: groupe.telephone },
      periodeLabel,
      lignesTriees,
      absencesTriees,
      groupe.joursAbsenceInjustifiee,
      groupe.lignePaie,
    );
    telechargerPdf(doc, `fiche-paie-${groupe.nom.replace(/\s+/g, "-")}-${dateDebut || "periode"}.pdf`);
  }

  function ouvrirEditionPaie(groupe) {
    setEditionPaie(groupe);
    const lp = groupe.lignePaie;
    setFormPaie(lp ? {
      frais: String(lp.frais), primes: String(lp.primes), avances: String(lp.avances),
      retenues: String(lp.retenues), carburant: String(lp.carburant), appel_internet: String(lp.appel_internet),
      mode_paiement: lp.mode_paiement, reference_transaction: lp.reference_transaction,
      date_paiement: lp.date_paiement || "", statut: lp.statut,
    } : LIGNE_PAIE_VIDE);
    setErreurPaie("");
  }

  async function enregistrerLigne(e) {
    e.preventDefault();
    setEnvoiPaie(true);
    setErreurPaie("");
    try {
      await enregistrerLignePaie({
        employe: editionPaie.employeId,
        mois: moisPremierJour,
        ...formPaie,
        date_paiement: formPaie.date_paiement || null,
      });
      setEditionPaie(null);
      rafraichir();
    } catch {
      setErreurPaie("Impossible d'enregistrer ces informations de paie.");
    } finally {
      setEnvoiPaie(false);
    }
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

  async function soumettreAbsence(e) {
    e.preventDefault();
    if (!absEmploye || !absDate) return;
    setErreurAbsence("");
    try {
      await declarerAbsence({ employe: absEmploye, date: absDate, motif: absMotif });
      setAbsEmploye(""); setAbsDate(""); setAbsMotif(""); setFormAbsenceOuvert(false);
      rafraichir();
    } catch (err) {
      setErreurAbsence(err?.response?.data?.detail || "Impossible de déclarer cette absence.");
    }
  }

  async function supprimerAbs(a) {
    if (!window.confirm(`Annuler l'absence justifiée de ${a.employe_nom} du ${new Date(a.date).toLocaleDateString("fr-FR")} ?`)) return;
    await supprimerAbsence(a.id);
    rafraichir();
  }

  async function validerAbs(a) {
    await validerAbsence(a.id);
    rafraichir();
  }

  async function rejeterAbs(a) {
    if (!window.confirm(`Rejeter l'absence signalée de ${a.employe_nom} du ${new Date(a.date).toLocaleDateString("fr-FR")} ? Elle ne sera pas payée.`)) return;
    await rejeterAbsence(a.id);
    rafraichir();
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
          <button style={styles.addBtn} onClick={() => setFormAbsenceOuvert((o) => !o)}>
            <UserMinus size={15} /> Déclarer une absence
          </button>
        </div>

        {formAbsenceOuvert && (
          <form style={styles.formCard} onSubmit={soumettreAbsence}>
            <select style={styles.input} value={absEmploye} onChange={(e) => setAbsEmploye(e.target.value)} required>
              <option value="">Employé...</option>
              {employes.map((emp) => <option key={emp.id} value={emp.id}>{emp.nom}</option>)}
            </select>
            <input style={styles.input} type="date" value={absDate} onChange={(e) => setAbsDate(e.target.value)} required />
            <input style={styles.input} placeholder="Motif (optionnel)" value={absMotif} onChange={(e) => setAbsMotif(e.target.value)} />
            {erreurAbsence && <p style={styles.erreur}>{erreurAbsence}</p>}
            <button style={styles.submitBtn} type="submit">Déclarer (justifiée, payée)</button>
          </form>
        )}

        {pointages.length > 0 && (
          <div style={styles.totaux}>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total heures</span><span style={styles.totalValeur}>{totaux.heures.toFixed(2)} h</span></div>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total à payer</span><span style={styles.totalValeur}>{fcfa(totaux.montant)}</span></div>
          </div>
        )}

        {resume.length > 0 && (
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
                    <th style={{ ...styles.th, textAlign: "right" }}>Jours travaillés</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Absences justifiées</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Absences injustifiées</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Repos pris / dus</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Net à payer</th>
                    {moisPremierJour && <th style={styles.th}>Statut</th>}
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {resume.map((g) => (
                    <tr key={g.employeId}>
                      <td style={styles.td}>{g.nom}</td>
                      <td style={styles.td}>{g.fermeNom}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{g.lignesTravaillees.length}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{g.absencesJustifiees.length}</td>
                      <td style={{ ...styles.td, textAlign: "right", color: g.joursAbsenceInjustifiee.length > 0 ? CLAY : "inherit" }}>{g.joursAbsenceInjustifiee.length}</td>
                      <td style={{ ...styles.td, textAlign: "right", color: g.joursReposTravailles.length > 0 ? CLAY : "inherit" }}>
                        {g.jourRepos != null ? `${g.joursReposDus - g.joursReposTravailles.length} / ${g.joursReposDus}` : "—"}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{fcfa(g.totalMontant)}</td>
                      {moisPremierJour && (
                        <td style={styles.td}>
                          {g.lignePaie ? (
                            <span style={{ color: g.lignePaie.statut === "PAYE" ? GREEN : CLAY, fontWeight: 600 }}>
                              {g.lignePaie.statut === "PAYE" ? "Payé" : "À payer"}
                            </span>
                          ) : <span style={{ color: "#B5BBB2" }}>—</span>}
                        </td>
                      )}
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        <button style={styles.pdfBtn} onClick={() => telechargerFichePaie(g)}>
                          <Download size={14} /> Fiche de paie
                        </button>
                        {moisPremierJour && (
                          <button style={styles.pdfBtn} onClick={() => ouvrirEditionPaie(g)}>
                            <Wallet size={14} /> Frais / primes...
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {absences.some((a) => a.statut === "EN_ATTENTE") && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}><span>Absences signalées en attente de validation</span></div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <tbody>
                  {absences.filter((a) => a.statut === "EN_ATTENTE").map((a) => (
                    <tr key={a.id}>
                      <td style={styles.td}>{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{a.employe_nom}</td>
                      <td style={styles.td}>{a.ferme_nom}</td>
                      <td style={{ ...styles.td, color: "#6B756E" }}>{a.motif || "—"}</td>
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        <button style={{ ...styles.iconBtn, color: GREEN }} onClick={() => validerAbs(a)} title="Valider (payée)">
                          <Check size={14} />
                        </button>
                        <button style={{ ...styles.iconBtn, color: CLAY }} onClick={() => rejeterAbs(a)} title="Rejeter (non payée)">
                          <Ban size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {absences.some((a) => a.statut === "VALIDEE") && (
          <section style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.resumeHead}><span>Absences justifiées (payées)</span></div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <tbody>
                  {absences.filter((a) => a.statut === "VALIDEE").map((a) => (
                    <tr key={a.id}>
                      <td style={styles.td}>{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{a.employe_nom}</td>
                      <td style={styles.td}>{a.ferme_nom}</td>
                      <td style={{ ...styles.td, color: "#6B756E" }}>{a.motif || "—"}</td>
                      <td style={{ ...styles.td, width: 1 }}>
                        <button style={{ ...styles.iconBtn, color: CLAY }} onClick={() => supprimerAbs(a)} title="Annuler cette absence">
                          <Trash2 size={14} />
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
                    <th style={styles.th}>Selfies</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p) => (
                    <tr key={p.id}>
                      <td style={styles.td}>{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{p.employe_nom}</td>
                      <td style={styles.td}>{p.ferme_nom}</td>
                      <td style={styles.td}>
                        {heure(p.heure_debut)}
                        {p.arrivee_via_secours && <LifeBuoy size={12} color={CLAY} style={{ marginLeft: 5, verticalAlign: -1 }} title="Badge de secours utilisé" />}
                      </td>
                      <td style={styles.td}>
                        {heure(p.heure_fin)}
                        {p.depart_via_secours && <LifeBuoy size={12} color={CLAY} style={{ marginLeft: 5, verticalAlign: -1 }} title="Badge de secours utilisé" />}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{p.heure_fin ? `${p.heures_travaillees} h` : "—"}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{p.heure_fin ? fcfa(p.montant_du_jour) : "—"}</td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {p.photo_debut && (
                            <a href={p.photo_debut} target="_blank" rel="noreferrer" title="Selfie arrivée">
                              <img src={p.photo_debut} alt="Selfie arrivée" style={styles.selfieThumb} />
                            </a>
                          )}
                          {p.photo_fin && (
                            <a href={p.photo_fin} target="_blank" rel="noreferrer" title="Selfie départ">
                              <img src={p.photo_fin} alt="Selfie départ" style={{ ...styles.selfieThumb, borderColor: CLAY }} />
                            </a>
                          )}
                          {!p.photo_debut && !p.photo_fin && "—"}
                        </div>
                      </td>
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

      {editionPaie && (
        <div style={styles.modalOverlay} onClick={() => setEditionPaie(null)}>
          <form style={{ ...styles.modal, width: 380 }} onClick={(e) => e.stopPropagation()} onSubmit={enregistrerLigne}>
            <button type="button" style={styles.modalClose} onClick={() => setEditionPaie(null)}><X size={18} /></button>
            <h2 style={styles.modalTitre}>{editionPaie.nom}</h2>
            <p style={styles.modalSousTitre}>{mois} · {editionPaie.fermeNom}</p>
            <div style={styles.grillePaie}>
              <label style={styles.champLabel}>Frais
                <input style={styles.champInput} type="number" min="0" value={formPaie.frais} onChange={(e) => setFormPaie({ ...formPaie, frais: e.target.value })} />
              </label>
              <label style={styles.champLabel}>Primes
                <input style={styles.champInput} type="number" min="0" value={formPaie.primes} onChange={(e) => setFormPaie({ ...formPaie, primes: e.target.value })} />
              </label>
              <label style={styles.champLabel}>Avances
                <input style={styles.champInput} type="number" min="0" value={formPaie.avances} onChange={(e) => setFormPaie({ ...formPaie, avances: e.target.value })} />
              </label>
              <label style={styles.champLabel}>Retenues
                <input style={styles.champInput} type="number" min="0" value={formPaie.retenues} onChange={(e) => setFormPaie({ ...formPaie, retenues: e.target.value })} />
              </label>
              <label style={styles.champLabel}>Carburant
                <input style={styles.champInput} type="number" min="0" value={formPaie.carburant} onChange={(e) => setFormPaie({ ...formPaie, carburant: e.target.value })} />
              </label>
              <label style={styles.champLabel}>Appel/internet
                <input style={styles.champInput} type="number" min="0" value={formPaie.appel_internet} onChange={(e) => setFormPaie({ ...formPaie, appel_internet: e.target.value })} />
              </label>
            </div>
            <label style={styles.champLabel}>Mode de paiement
              <select style={styles.champInput} value={formPaie.mode_paiement} onChange={(e) => setFormPaie({ ...formPaie, mode_paiement: e.target.value })}>
                <option value="">—</option>
                {Object.entries(LABEL_MODE_PAIEMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={styles.champLabel}>Référence transaction
              <input style={styles.champInput} value={formPaie.reference_transaction} onChange={(e) => setFormPaie({ ...formPaie, reference_transaction: e.target.value })} />
            </label>
            <label style={styles.champLabel}>Date de paiement
              <input style={styles.champInput} type="date" value={formPaie.date_paiement} onChange={(e) => setFormPaie({ ...formPaie, date_paiement: e.target.value })} />
            </label>
            <label style={styles.champLabel}>Statut
              <select style={styles.champInput} value={formPaie.statut} onChange={(e) => setFormPaie({ ...formPaie, statut: e.target.value })}>
                <option value="A_PAYER">À payer</option>
                <option value="PAYE">Payé</option>
              </select>
            </label>
            {erreurPaie && <p style={styles.erreurEdit}>{erreurPaie}</p>}
            <button style={styles.submitBtn} type="submit" disabled={envoiPaie}>{envoiPaie ? "Enregistrement..." : "Enregistrer"}</button>
          </form>
        </div>
      )}
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
  addBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginLeft: "auto" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK, flex: "1 1 160px" },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: 0, width: "100%" },
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
  selfieThumb: { width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${GREEN}` },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 18, padding: 26, width: 320, maxWidth: "100%", position: "relative", display: "flex", flexDirection: "column", gap: 10 },
  modalClose: { position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "#8A948D" },
  modalTitre: { fontSize: 17, fontWeight: 700, margin: "4px 0 0" },
  modalSousTitre: { fontSize: 12.5, color: "#8A948D", margin: "0 0 8px" },
  champLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#6B756E" },
  grillePaie: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  champInput: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  erreurEdit: { color: "#9E4527", fontSize: 12.5, margin: 0 },
};
