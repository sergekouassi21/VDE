import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Smartphone } from "lucide-react";
import { verifierAppareilPointage, setAppareilPointageToken } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, TEXTE_GRIS } from "../theme";

export default function PointageActiverAppareil() {
  const { token } = useParams();
  const [etat, setEtat] = useState("verification"); // verification | active | invalide

  useEffect(() => {
    verifierAppareilPointage(token)
      .then((data) => {
        if (data.valide) {
          setAppareilPointageToken(token);
          setEtat("active");
        } else {
          setEtat("invalide");
        }
      })
      .catch(() => setEtat("invalide"));
  }, [token]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        {etat === "verification" && <p style={styles.txt}>Vérification...</p>}
        {etat === "active" && (
          <>
            <CheckCircle2 size={40} color={GREEN} />
            <h1 style={styles.titre}>Téléphone activé</h1>
            <p style={styles.txt}>Cet appareil est maintenant autorisé à scanner et valider les pointages. Cette autorisation reste enregistrée sur ce téléphone.</p>
          </>
        )}
        {etat === "invalide" && (
          <>
            <Smartphone size={40} color={INK} />
            <h1 style={styles.titre}>Code d'activation invalide</h1>
            <p style={styles.txt}>Ce QR n'est plus valide (peut-être régénéré depuis) — demande un nouveau QR à la Direction.</p>
          </>
        )}
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
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: { height: 48, width: 48, borderRadius: 12, objectFit: "cover", marginBottom: 4 },
  titre: { fontSize: 18, fontWeight: 700, margin: 0, color: INK },
  txt: { fontSize: 13.5, color: TEXTE_GRIS, margin: 0, lineHeight: 1.5 },
};
