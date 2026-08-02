import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Clock, CheckCircle2, LogIn, LogOut, Search, ChevronLeft, Camera, WifiOff } from "lucide-react";
import { getEmployesBadgeTemporaire, validerBadgeTemporaire } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, CLAY } from "../theme";
import CaptureSelfie from "../components/CaptureSelfie";
import { ajouterPointageEnAttente, listerPointagesEnAttente } from "../offline/queuePointage";
import { synchroniserPointagesEnAttente } from "../offline/syncPointage";

const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const LABEL_ETAT = {
  NON_COMMENCE: "Pas encore arrivé",
  EN_COURS: "En cours",
  TERMINE: "Journée terminée",
};

export default function PointageBadgeTemporaire() {
  const { token } = useParams();
  const [employes, setEmployes] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [selectionne, setSelectionne] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [captureOuverte, setCaptureOuverte] = useState(false);
  const [envoyeHorsLigne, setEnvoyeHorsLigne] = useState(false);
  const [enAttenteCount, setEnAttenteCount] = useState(0);
  const employeAValiderRef = useRef(null);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerPointagesEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  const charger = useCallback(() => {
    getEmployesBadgeTemporaire(token)
      .then((data) => { setEmployes(data); setChargement(false); setErreur(""); })
      .catch((err) => {
        // Distinct d'un badge vraiment invalide : sans réseau, on ne peut
        // même pas charger la liste des employés depuis ce badge de secours
        // (cf. conversation du 29/07/2026 avec Serge — l'ancien message
        // "Badge temporaire invalide" était trompeur en cas de coupure).
        setErreur(!err.response
          ? "Pas de réseau — impossible de charger la liste des employés. Réessaie une fois la connexion revenue."
          : "Badge temporaire invalide. Contactez la direction.");
        setChargement(false);
      });
  }, [token]);

  useEffect(() => { charger(); rafraichirEnAttente(); }, [charger, rafraichirEnAttente]);

  useEffect(() => {
    const synchroniser = () => synchroniserPointagesEnAttente(() => rafraichirEnAttente());
    function onOnline() { synchroniser(); }
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => { if (navigator.onLine) synchroniser(); }, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [rafraichirEnAttente]);

  // Selfie obligatoire ici aussi — ce badge partagé n'a même pas de jeton
  // personnel à vérifier (n'importe qui choisit n'importe quel nom dans la
  // liste), donc c'est le seul garde-fou contre le pointage pour un
  // collègue absent (cf. conversation du 28/07/2026 avec Serge). Photo
  // prise directement en basse résolution (CaptureSelfie), cf. PointageScan.
  function demanderSelfie(employeId) {
    setErreur("");
    employeAValiderRef.current = employeId;
    setCaptureOuverte(true);
  }

  async function valider(photo) {
    const employeId = employeAValiderRef.current;
    setCaptureOuverte(false);
    setEnvoi(true);
    if (!navigator.onLine) {
      try {
        await ajouterPointageEnAttente({ type: "temporaire", token, employeId, photo });
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
      const data = await validerBadgeTemporaire(token, employeId, photo);
      if (data.deja_complet) {
        window.alert("Ce badge a déjà pointé arrivée et départ aujourd'hui. Contactez la Direction pour un rappel.");
      }
      setSelectionne(null);
      charger();
    } catch (err) {
      if (!err.response) {
        try {
          await ajouterPointageEnAttente({ type: "temporaire", token, employeId, photo });
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
        <div style={styles.card}><p style={styles.erreur}>{erreur}</p></div>
      </div>
    );
  }

  if (envoyeHorsLigne) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <CheckCircle2 size={34} color={GREEN} />
          <p style={styles.recapTitre}>Enregistré hors-ligne</p>
          <p style={styles.txtHorsLigne}>Cette validation sera envoyée automatiquement dès que le réseau reviendra sur ce téléphone.</p>
          <button style={styles.bouton} onClick={() => { setEnvoyeHorsLigne(false); setSelectionne(null); }}>Retour à la liste</button>
        </div>
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

  const employe = employes.find((e) => e.employe.id === selectionne);

  if (employe) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <button style={styles.retour} onClick={() => setSelectionne(null)}><ChevronLeft size={16} /> Retour à la liste</button>
          <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
          {employe.employe.photo && <img src={employe.employe.photo} alt="" style={styles.photo} />}
          <h1 style={styles.nom}>{employe.employe.nom}</h1>
          <p style={styles.ferme}>{employe.employe.role ? `${employe.employe.role} · ${employe.employe.ferme_nom}` : employe.employe.ferme_nom}</p>

          {employe.etat === "NON_COMMENCE" && (
            <>
              <p style={styles.statut}>Journée pas encore commencée</p>
              <p style={styles.selfieNote}><Camera size={13} style={{ verticalAlign: -2 }} /> Un selfie te sera demandé pour valider</p>
              <button style={styles.bouton} onClick={() => demanderSelfie(employe.employe.id)} disabled={envoi}>
                <LogIn size={18} /> {envoi ? "Validation..." : "Valider l'arrivée"}
              </button>
            </>
          )}

          {employe.etat === "EN_COURS" && (
            <>
              <p style={styles.statut}><Clock size={15} style={{ verticalAlign: -2 }} /> Arrivé à {heure(employe.heure_debut)}</p>
              <p style={styles.selfieNote}><Camera size={13} style={{ verticalAlign: -2 }} /> Un selfie te sera demandé pour valider</p>
              <button style={{ ...styles.bouton, background: CLAY }} onClick={() => demanderSelfie(employe.employe.id)} disabled={envoi}>
                <LogOut size={18} /> {envoi ? "Validation..." : "Valider le départ"}
              </button>
            </>
          )}

          {employe.etat === "TERMINE" && (
            <div style={styles.recap}>
              <CheckCircle2 size={34} color={GREEN} />
              <p style={styles.recapTitre}>Journée terminée</p>
              <div style={styles.recapLigne}><span>Arrivée</span><span>{heure(employe.heure_debut)}</span></div>
              <div style={{ ...styles.recapLigne, borderBottom: "none" }}><span>Départ</span><span>{heure(employe.heure_fin)}</span></div>
            </div>
          )}
        </div>
        {captureOuverte && <CaptureSelfie onCapture={valider} onAnnuler={() => setCaptureOuverte(false)} />}
      </div>
    );
  }

  const employesFiltres = employes.filter((e) => e.employe.nom.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, width: 380 }}>
        {enAttenteCount > 0 && (
          <div style={styles.offlineBanner}><WifiOff size={14} /><span>{enAttenteCount} pointage(s) en attente de synchronisation</span></div>
        )}
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.nom}>Badge temporaire</h1>
        <p style={styles.ferme}>Choisis l'employé qui a oublié ou perdu son badge</p>

        <div style={styles.rechercheWrap}>
          <Search size={15} color="#8A948D" />
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
              <button key={e.employe.id} style={styles.ligneEmploye} onClick={() => setSelectionne(e.employe.id)}>
                <div style={{ textAlign: "left" }}>
                  <div style={styles.ligneNom}>{e.employe.nom}</div>
                  <div style={styles.ligneFerme}>{e.employe.ferme_nom}</div>
                </div>
                <span style={{ ...styles.badgeEtat, ...(e.etat === "TERMINE" ? styles.badgeTermine : e.etat === "EN_COURS" ? styles.badgeEnCours : {}) }}>
                  {LABEL_ETAT[e.etat]}
                </span>
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
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "'Inter', sans-serif", padding: 16,
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "32px 28px", width: 340, maxWidth: "100%",
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)", position: "relative",
  },
  retour: {
    display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", background: "none", border: "none",
    color: "#6B756E", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 4,
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
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12, fontWeight: 500, padding: "8px 12px", borderRadius: 10, width: "100%", marginBottom: 6 },
  txtHorsLigne: { fontSize: 13, color: "#6B756E", margin: "0 0 10px", lineHeight: 1.5 },
  recap: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 6 },
  recapTitre: { fontSize: 16, fontWeight: 700, color: INK, margin: "6px 0 10px" },
  recapLigne: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: 13.5, color: "#4C544E", padding: "5px 0", borderBottom: "1px solid #ECE9DF" },
  rechercheWrap: { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "#fff", border: "1px solid #DDE2DE", borderRadius: 10, padding: "9px 12px", marginTop: 6 },
  recherche: { border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", color: INK, width: "100%", background: "none" },
  liste: { width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 12, maxHeight: 360, overflowY: "auto" },
  ligneEmploye: {
    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "#fff",
    border: "1px solid #ECE9DF", borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit",
  },
  ligneNom: { fontSize: 14, fontWeight: 600, color: INK },
  ligneFerme: { fontSize: 11.5, color: "#8A948D", marginTop: 1 },
  badgeEtat: { fontSize: 10.5, fontWeight: 600, color: "#8A948D", background: "#F2F0E8", padding: "3px 8px", borderRadius: 7, whiteSpace: "nowrap" },
  badgeEnCours: { color: GREEN_DARK, background: "#EAF3EE" },
  badgeTermine: { color: "#6B756E", background: "#EDEAE0" },
};
