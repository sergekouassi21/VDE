import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Clock, CheckCircle2, LogIn, LogOut, Camera } from "lucide-react";
import { getInfosPointageScan, validerPointageScan } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, CLAY } from "../theme";
import { comprimerImage } from "../utils/image";

const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function PointageScan() {
  const { token } = useParams();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const inputPhotoRef = useRef(null);

  const charger = useCallback(() => {
    getInfosPointageScan(token)
      .then(setEtat)
      .catch(() => setErreur("QR invalide ou employé désactivé. Contactez la direction."));
  }, [token]);

  useEffect(() => { charger(); }, [charger]);

  // Un selfie est obligatoire pour valider (arrivée ou départ) — un seul
  // téléphone partagé scanne désormais le badge de chaque employé (plus
  // celui d'un superviseur qui les reconnaît tous), donc ça dissuade et
  // permet de vérifier a posteriori qu'un employé n'a pas scanné le badge
  // d'un collègue absent (cf. conversation du 28/07/2026 avec Serge).
  function demanderSelfie() {
    setErreur("");
    inputPhotoRef.current?.click();
  }

  async function valider(photo) {
    setEnvoi(true);
    try {
      const data = await validerPointageScan(token, photo);
      setEtat(data);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Une erreur est survenue. Réessaie.");
    } finally {
      setEnvoi(false);
    }
  }

  if (erreur) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.erreur}>{erreur}</p>
        </div>
      </div>
    );
  }

  if (!etat) {
    return (
      <div style={styles.page}>
        <div style={styles.card}><p style={styles.attente}>Chargement...</p></div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        {etat.employe.photo && <img src={etat.employe.photo} alt="" style={styles.photo} />}
        <h1 style={styles.nom}>{etat.employe.nom}</h1>
        <p style={styles.ferme}>{etat.employe.role ? `${etat.employe.role} · ${etat.employe.ferme_nom}` : etat.employe.ferme_nom}</p>

        <input
          ref={inputPhotoRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            setEnvoi(true);
            const photo = await comprimerImage(f);
            valider(photo);
          }}
        />

        {etat.etat === "NON_COMMENCE" && (
          <>
            <p style={styles.statut}>Journée pas encore commencée</p>
            <p style={styles.selfieNote}><Camera size={13} style={{ verticalAlign: -2 }} /> Un selfie te sera demandé pour valider</p>
            <button style={styles.bouton} onClick={demanderSelfie} disabled={envoi}>
              <LogIn size={18} /> {envoi ? "Validation..." : "Valider l'arrivée"}
            </button>
          </>
        )}

        {etat.etat === "EN_COURS" && (
          <>
            <p style={styles.statut}><Clock size={15} style={{ verticalAlign: -2 }} /> Arrivé à {heure(etat.heure_debut)}</p>
            <p style={styles.selfieNote}><Camera size={13} style={{ verticalAlign: -2 }} /> Un selfie te sera demandé pour valider</p>
            <button style={{ ...styles.bouton, background: CLAY }} onClick={demanderSelfie} disabled={envoi}>
              <LogOut size={18} /> {envoi ? "Validation..." : "Valider le départ"}
            </button>
          </>
        )}

        {etat.etat === "TERMINE" && (
          <div style={styles.recap}>
            <CheckCircle2 size={34} color={GREEN} />
            <p style={styles.recapTitre}>Journée terminée</p>
            <div style={styles.recapLigne}><span>Arrivée</span><span>{heure(etat.heure_debut)}</span></div>
            <div style={styles.recapLigne}><span>Départ</span><span>{heure(etat.heure_fin)}</span></div>
            <div style={{ ...styles.recapLigne, borderBottom: "none" }}><span>Heures travaillées</span><span>{etat.heures_travaillees} h</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "'Inter', sans-serif", padding: 16,
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "32px 28px", width: 340, maxWidth: "100%",
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: { height: 48, width: 48, borderRadius: 12, objectFit: "cover", marginBottom: 4 },
  photo: { height: 80, width: 80, borderRadius: "50%", objectFit: "cover", marginBottom: 4 },
  nom: { fontSize: 20, fontWeight: 700, margin: 0, color: INK },
  ferme: { fontSize: 13, color: "#6B756E", margin: "0 0 10px" },
  statut: { fontSize: 14, color: INK, margin: "6px 0 8px" },
  selfieNote: { fontSize: 11.5, color: "#8A948D", margin: "0 0 14px" },
  bouton: {
    display: "flex", alignItems: "center", gap: 8, background: GREEN, color: "#fff", border: "none",
    borderRadius: 12, padding: "14px 22px", fontSize: 15.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%", justifyContent: "center",
  },
  attente: { fontSize: 14, color: "#6B756E" },
  erreur: { fontSize: 14, color: "#9E4527", margin: 0 },
  recap: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 6 },
  recapTitre: { fontSize: 16, fontWeight: 700, color: INK, margin: "6px 0 10px" },
  recapLigne: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: 13.5, color: "#4C544E", padding: "5px 0", borderBottom: "1px solid #ECE9DF" },
};
