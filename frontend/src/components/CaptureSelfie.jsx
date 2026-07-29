import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { GREEN, CREAM, INK, CLAY } from "../theme";
import { comprimerImage } from "../utils/image";

// Taille cible du selfie — largement suffisant pour identifier visuellement
// quelqu'un, et surtout : demander directement un flux caméra à cette
// résolution évite de jamais décoder la photo en pleine résolution du
// capteur. Prendre la photo via <input capture> puis la recompresser avait
// encore fait planter la validation ("Mémoire insuffisante") sur certains
// téléphones — le décodage de l'image d'origine (souvent 10+ Mpx) pour la
// recompresser pouvait consommer autant, voire plus, de mémoire que
// l'upload direct (cf. conversation du 29/07/2026 avec Serge).
const TAILLE = 480;

export default function CaptureSelfie({ onCapture, onAnnuler }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const inputSecoursRef = useRef(null);
  const [pret, setPret] = useState(false);
  const [secours, setSecours] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setSecours(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: TAILLE }, height: { ideal: TAILLE } }, audio: false })
      .then((stream) => {
        if (annule) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setPret(true);
        }
      })
      .catch(() => setSecours(true));
    return () => {
      annule = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturer() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const cote = Math.min(video.videoWidth, video.videoHeight, TAILLE) || TAILLE;
    const canvas = document.createElement("canvas");
    canvas.width = cote;
    canvas.height = cote;
    const ctx = canvas.getContext("2d");
    const decalageX = (video.videoWidth - cote) / 2;
    const decalageY = (video.videoHeight - cote) / 2;
    ctx.drawImage(video, decalageX, decalageY, cote, cote, 0, 0, cote, cote);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    canvas.toBlob((blob) => onCapture(blob), "image/jpeg", 0.75);
  }

  // Repli pour les navigateurs sans caméra web accessible en direct (rare) :
  // on retombe sur la capture native, en recompressant quand même le
  // résultat pour rester aussi léger que possible.
  async function onFichierSecours(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErreur("");
    try {
      const photo = await comprimerImage(f, { maxDimension: TAILLE, qualite: 0.75 });
      onCapture(photo);
    } catch {
      setErreur("Impossible de traiter la photo. Réessaie.");
    }
  }

  return (
    <div style={styles.overlay} onClick={onAnnuler}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.close} onClick={onAnnuler} aria-label="Annuler"><X size={18} /></button>
        <h2 style={styles.titre}>Selfie de pointage</h2>
        {erreur && <p style={styles.erreurTxt}>{erreur}</p>}
        {secours ? (
          <>
            <p style={styles.txt}>Caméra en direct indisponible — prends la photo avec l'appareil du téléphone.</p>
            <input ref={inputSecoursRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onFichierSecours} />
            <button type="button" style={styles.bouton} onClick={() => inputSecoursRef.current?.click()}>
              <Camera size={18} /> Ouvrir l'appareil photo
            </button>
          </>
        ) : (
          <>
            <div style={styles.videoWrap}>
              <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
            </div>
            <button type="button" style={styles.bouton} onClick={capturer} disabled={!pret}>
              <Camera size={18} /> {pret ? "Prendre la photo" : "Ouverture de la caméra..."}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 },
  modal: { background: CREAM, borderRadius: 18, padding: 22, width: 320, maxWidth: "100%", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" },
  close: { position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", color: "#8A948D" },
  titre: { fontSize: 16, fontWeight: 700, margin: 0, color: INK },
  txt: { fontSize: 13, color: "#6B756E", margin: 0, lineHeight: 1.5 },
  erreurTxt: { fontSize: 12.5, color: CLAY, margin: 0 },
  videoWrap: { width: 220, height: 220, borderRadius: "50%", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" },
  video: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" },
  bouton: {
    display: "flex", alignItems: "center", gap: 8, background: GREEN, color: "#fff", border: "none",
    borderRadius: 12, padding: "13px 20px", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%", justifyContent: "center",
  },
};
