import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Search, ChevronLeft, CheckCircle2 } from "lucide-react";
import { getEmployesBadgeAbsence, declarerBadgeAbsence } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, TEXTE_DOUX, TEXTE_GRIS, ALERTE } from "../theme";

const pad = (n) => String(n).padStart(2, "0");
const aujourdhuiISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export default function PointageBadgeAbsence() {
  const { token } = useParams();
  const [employes, setEmployes] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [selectionne, setSelectionne] = useState(null);
  const [date, setDate] = useState(aujourdhuiISO());
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false);

  const charger = useCallback(() => {
    getEmployesBadgeAbsence(token)
      .then((data) => { setEmployes(data); setChargement(false); })
      .catch(() => { setErreur("Badge invalide. Contactez la direction."); setChargement(false); });
  }, [token]);

  useEffect(() => { charger(); }, [charger]);

  async function soumettre(e) {
    e.preventDefault();
    if (!motif.trim()) return;
    setEnvoi(true);
    setErreur("");
    try {
      await declarerBadgeAbsence(token, { employe: selectionne.id, date, motif });
      setSucces(true);
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Impossible d'enregistrer cette absence.");
    } finally {
      setEnvoi(false);
    }
  }

  function nouvelleDeclaration() {
    setSelectionne(null);
    setDate(aujourdhuiISO());
    setMotif("");
    setSucces(false);
    setErreur("");
  }

  if (erreur && !selectionne) {
    return (
      <div style={styles.page}>
        <div style={styles.card}><p style={styles.erreur}>{erreur}</p></div>
      </div>
    );
  }

  if (chargement) {
    return (
      <div style={styles.page}>
        <div style={styles.card}><p style={styles.attente}>Chargement...</p></div>
      </div>
    );
  }

  if (succes) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <CheckCircle2 size={34} color={GREEN} />
          <h1 style={styles.nom}>Absence signalée</h1>
          <p style={styles.ferme}>{selectionne.nom} — {new Date(date).toLocaleDateString("fr-FR")}</p>
          <p style={styles.statut}>En attente de validation par la direction.</p>
          <button style={styles.bouton} onClick={nouvelleDeclaration}>Signaler une autre absence</button>
        </div>
      </div>
    );
  }

  if (selectionne) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <button style={styles.retour} onClick={() => setSelectionne(null)}><ChevronLeft size={16} /> Retour à la liste</button>
          <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
          <h1 style={styles.nom}>{selectionne.nom}</h1>
          <p style={styles.ferme}>{selectionne.ferme_nom}</p>

          <form style={styles.form} onSubmit={soumettre}>
            <label style={styles.champLabel}>
              Date de l'absence
              <input style={styles.champInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label style={styles.champLabel}>
              Motif (obligatoire)
              <textarea style={{ ...styles.champInput, resize: "vertical", minHeight: 60 }} value={motif} onChange={(e) => setMotif(e.target.value)} required />
            </label>
            {erreur && <p style={styles.erreur}>{erreur}</p>}
            <button style={styles.bouton} type="submit" disabled={envoi}>{envoi ? "Envoi..." : "Signaler l'absence"}</button>
          </form>
        </div>
      </div>
    );
  }

  const employesFiltres = employes.filter((e) => e.nom.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, width: 380 }}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.nom}>Signaler une absence</h1>
        <p style={styles.ferme}>Choisis l'employé absent</p>

        <div style={styles.rechercheWrap}>
          <Search size={15} color={TEXTE_DOUX} />
          <input
            style={styles.recherche}
            placeholder="Rechercher un nom..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            autoFocus
          />
        </div>

        <div style={styles.liste}>
          {employesFiltres.length === 0 ? (
            <p style={styles.attente}>Aucun employé trouvé.</p>
          ) : (
            employesFiltres.map((e) => (
              <button key={e.id} style={styles.ligneEmploye} onClick={() => setSelectionne(e)}>
                <div style={{ textAlign: "left" }}>
                  <div style={styles.ligneNom}>{e.nom}</div>
                  <div style={styles.ligneFerme}>{e.ferme_nom}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "inherit", padding: 16,
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "32px 28px", width: 340, maxWidth: "100%",
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)", position: "relative",
  },
  retour: {
    display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", background: "none", border: "none",
    color: TEXTE_GRIS, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 4,
  },
  logo: { height: 48, width: 48, borderRadius: 12, objectFit: "cover", marginBottom: 4 },
  nom: { fontSize: 20, fontWeight: 700, margin: 0, color: INK },
  ferme: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 10px" },
  statut: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 16px" },
  bouton: {
    display: "flex", alignItems: "center", gap: 8, background: GREEN, color: "#fff", border: "none",
    borderRadius: 12, padding: "14px 22px", fontSize: 15.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%", justifyContent: "center",
  },
  attente: { fontSize: 14, color: TEXTE_GRIS },
  erreur: { fontSize: 14, color: ALERTE, margin: 0 },
  rechercheWrap: { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "#fff", border: "1px solid #DDE2DE", borderRadius: 10, padding: "9px 12px", marginTop: 6 },
  recherche: { border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", color: INK, width: "100%", background: "none" },
  liste: { width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 12, maxHeight: 360, overflowY: "auto" },
  ligneEmploye: {
    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "#fff",
    border: "1px solid #ECE9DF", borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit",
  },
  ligneNom: { fontSize: 14, fontWeight: 600, color: INK },
  ligneFerme: { fontSize: 12, color: TEXTE_DOUX, marginTop: 1 },
  form: { width: "100%", display: "flex", flexDirection: "column", gap: 12, marginTop: 10 },
  champLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: TEXTE_GRIS, textAlign: "left" },
  champInput: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 14, fontFamily: "inherit", color: INK },
};
