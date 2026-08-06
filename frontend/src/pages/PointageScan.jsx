import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Clock, CheckCircle2, LogIn, LogOut, Camera, WifiOff, RefreshCw } from "lucide-react";
import { getInfosPointageScan, validerPointageScan } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, CLAY, TEXTE_DOUX, TEXTE_GRIS, ALERTE, ALERTE_FOND } from "../theme";
import CaptureSelfie from "../components/CaptureSelfie";
import { ajouterPointageEnAttente, listerPointagesEnAttente } from "../offline/queuePointage";
import { synchroniserPointagesEnAttente } from "../offline/syncPointage";
import { obtenirPosition } from "../utils/position";

// timeZone explicite : sans lui, l'heure s'affiche dans le fuseau du
// téléphone/navigateur (souvent réglé sur l'heure française, GMT+1/+2) au
// lieu de l'heure d'Abidjan (GMT+0) — cf. conversation du 02/08/2026 avec Serge.
const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

export default function PointageScan() {
  const { token } = useParams();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [captureOuverte, setCaptureOuverte] = useState(false);
  // Distinct d'une vraie erreur (QR invalide, employé désactivé) : ici on
  // ne sait juste pas si c'est une arrivée ou un départ faute de réseau
  // pour consulter l'état du jour (cf. conversation du 29/07/2026 avec
  // Serge — le message "QR invalide" affiché jusque-là en cas de coupure
  // réseau était trompeur).
  const [horsLigne, setHorsLigne] = useState(false);
  const [envoyeHorsLigne, setEnvoyeHorsLigne] = useState(false);
  const [enAttenteCount, setEnAttenteCount] = useState(0);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerPointagesEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  const charger = useCallback(() => {
    setHorsLigne(false);
    getInfosPointageScan(token)
      .then((data) => { setEtat(data); setErreur(""); })
      .catch((err) => {
        if (!err.response) {
          setHorsLigne(true);
        } else {
          setErreur("QR invalide ou employé désactivé. Contactez la direction.");
        }
      });
  }, [token]);

  useEffect(() => { charger(); rafraichirEnAttente(); }, [charger, rafraichirEnAttente]);

  useEffect(() => {
    const synchroniser = () => synchroniserPointagesEnAttente(() => { rafraichirEnAttente(); charger(); });
    function onOnline() { synchroniser(); }
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => { if (navigator.onLine) synchroniser(); }, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [charger, rafraichirEnAttente]);

  // Un selfie est obligatoire pour valider (arrivée ou départ) — un seul
  // téléphone partagé scanne désormais le badge de chaque employé (plus
  // celui d'un superviseur qui les reconnaît tous), donc ça dissuade et
  // permet de vérifier a posteriori qu'un employé n'a pas scanné le badge
  // d'un collègue absent (cf. conversation du 28/07/2026 avec Serge). La
  // photo est prise directement en basse résolution (CaptureSelfie) plutôt
  // que via l'appareil photo natif — ce dernier renvoyait des photos en
  // pleine résolution qui faisaient planter la validation sur certains
  // téléphones ("Mémoire insuffisante", cf. conversation du 29/07/2026).
  function demanderSelfie() {
    setErreur("");
    setCaptureOuverte(true);
  }

  async function valider(photo) {
    setCaptureOuverte(false);
    setEnvoi(true);
    // Position lue au moment du scan — y compris hors-ligne, pour qu'elle
    // parte avec le pointage mis en file. Elle vaut null si le GPS n'aboutit
    // pas : le serveur accepte alors et signale, il ne bloque pas.
    const position = await obtenirPosition();
    if (!navigator.onLine) {
      try {
        await ajouterPointageEnAttente({ type: "scan", token, photo, position });
        await rafraichirEnAttente();
        setEnvoyeHorsLigne(true);
      } catch {
        // Écriture IndexedDB impossible (quota dépassé, navigation privée...)
        // — sans ce catch, le selfie disparaissait silencieusement et le
        // bouton restait bloqué indéfiniment (cf. audit du 30/07/2026).
        setErreur("Impossible d'enregistrer hors-ligne sur cet appareil — réessaie ou repasse en ligne.");
      } finally {
        setEnvoi(false);
      }
      return;
    }
    try {
      const data = await validerPointageScan(token, photo, position);
      setEtat(data);
      setHorsLigne(false);
      setEnvoyeHorsLigne(false);
    } catch (err) {
      if (!err.response) {
        // Coupure réseau pendant l'envoi (pas juste au chargement) — on met
        // en file plutôt que d'afficher une erreur, comme au-dessus.
        try {
          await ajouterPointageEnAttente({ type: "scan", token, photo, position });
          await rafraichirEnAttente();
          setEnvoyeHorsLigne(true);
        } catch {
          setErreur("Impossible d'enregistrer hors-ligne sur cet appareil — réessaie ou repasse en ligne.");
        }
      } else {
        setErreur(err.response?.data?.detail || "Une erreur est survenue. Réessaie.");
      }
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

  if (envoyeHorsLigne) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <CheckCircle2 size={34} color={GREEN} />
          <p style={styles.recapTitre}>Enregistré hors-ligne</p>
          <p style={styles.txtHorsLigne}>Ta validation sera envoyée automatiquement dès que le réseau reviendra sur ce téléphone.</p>
        </div>
      </div>
    );
  }

  if (horsLigne) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.offlineBanner}><WifiOff size={14} /><span>Pas de réseau — impossible de vérifier ton état du jour</span></div>
          <p style={styles.txtHorsLigne}>Choisis toi-même ce que tu viens faire — le selfie et l'heure seront quand même enregistrés, envoyés dès que le réseau reviendra.</p>
          <button style={styles.bouton} onClick={demanderSelfie} disabled={envoi}>
            <LogIn size={18} /> {envoi ? "Enregistrement..." : "Valider l'arrivée"}
          </button>
          <button style={{ ...styles.bouton, background: CLAY, marginTop: 8 }} onClick={demanderSelfie} disabled={envoi}>
            <LogOut size={18} /> {envoi ? "Enregistrement..." : "Valider le départ"}
          </button>
          <button style={styles.reessayerBtn} onClick={charger}><RefreshCw size={13} /> Réessayer avec le réseau</button>
          {captureOuverte && <CaptureSelfie onCapture={valider} onAnnuler={() => setCaptureOuverte(false)} />}
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
        {enAttenteCount > 0 && (
          <div style={styles.offlineBanner}><RefreshCw size={14} /><span>{enAttenteCount} pointage(s) en attente de synchronisation</span></div>
        )}
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        {etat.employe.photo && <img src={etat.employe.photo} alt="" style={styles.photo} />}
        <h1 style={styles.nom}>{etat.employe.nom}</h1>
        <p style={styles.ferme}>{etat.employe.role ? `${etat.employe.role} · ${etat.employe.ferme_nom}` : etat.employe.ferme_nom}</p>

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
            {etat.deja_complet && (
              <p style={styles.dejaCompletNote}>
                Ce badge a déjà pointé arrivée et départ aujourd'hui. Contactez la Direction pour un rappel.
              </p>
            )}
          </div>
        )}
      </div>
      {captureOuverte && <CaptureSelfie onCapture={valider} onAnnuler={() => setCaptureOuverte(false)} />}
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
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: { height: 48, width: 48, borderRadius: 12, objectFit: "cover", marginBottom: 4 },
  photo: { height: 80, width: 80, borderRadius: "50%", objectFit: "cover", marginBottom: 4 },
  nom: { fontSize: 20, fontWeight: 700, margin: 0, color: INK },
  ferme: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 10px" },
  statut: { fontSize: 14, color: INK, margin: "6px 0 8px" },
  selfieNote: { fontSize: 12, color: TEXTE_DOUX, margin: "0 0 14px" },
  bouton: {
    display: "flex", alignItems: "center", gap: 8, background: GREEN, color: "#fff", border: "none",
    borderRadius: 12, padding: "14px 22px", fontSize: 15.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%", justifyContent: "center",
  },
  attente: { fontSize: 14, color: TEXTE_GRIS },
  erreur: { fontSize: 14, color: ALERTE, margin: 0 },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: ALERTE_FOND, color: ALERTE, fontSize: 12, fontWeight: 500, padding: "8px 12px", borderRadius: 10, width: "100%", marginBottom: 6 },
  txtHorsLigne: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 10px", lineHeight: 1.5 },
  reessayerBtn: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: TEXTE_GRIS, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", marginTop: 10, padding: 0 },
  recap: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 6 },
  recapTitre: { fontSize: 16, fontWeight: 700, color: INK, margin: "6px 0 10px" },
  recapLigne: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: 14, color: "#4C544E", padding: "5px 0", borderBottom: "1px solid #ECE9DF" },
  dejaCompletNote: { fontSize: 12.5, color: CLAY, marginTop: 10, textAlign: "center", lineHeight: 1.4 },
};
