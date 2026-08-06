import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { demanderReinitialisation } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, TEXTE_META, TEXTE_GRIS, ALERTE, VERT_FOND } from "../theme";

// Demande d'un lien de réinitialisation.
//
// L'écran ne dit JAMAIS si le compte existe : le serveur répond la même chose
// dans tous les cas, et l'interface se contente de relayer. Sinon ce
// formulaire deviendrait un moyen de savoir qui travaille ici — sur une
// application dont le dépôt est public, ce serait un renseignement offert.

export default function MotDePasseOublie() {
  const [identifiant, setIdentifiant] = useState("");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setMessage("");
    setEnvoi(true);
    try {
      const data = await demanderReinitialisation(identifiant.trim());
      setMessage(data.detail);
    } catch (err) {
      if (!err.response) {
        setErreur("Serveur injoignable. Vérifiez votre connexion, puis réessayez.");
      } else if (err.response.status === 429) {
        setErreur("Trop de demandes. Patientez une minute avant de réessayer.");
      } else {
        setErreur(err.response?.data?.detail || "Impossible d'envoyer la demande.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={envoyer}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.titre}>Mot de passe oublié</h1>
        <p style={styles.sousTitre}>
          Indiquez votre nom d'utilisateur ou votre adresse e-mail. Vous recevrez
          un lien pour choisir un nouveau mot de passe.
        </p>

        {message ? (
          <div style={styles.succes}><Mail size={16} /> <span>{message}</span></div>
        ) : (
          <>
            <input
              style={styles.input}
              placeholder="Nom d'utilisateur ou e-mail"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            {erreur && <p style={styles.erreur}>{erreur}</p>}
            <button style={styles.bouton} type="submit" disabled={envoi || !identifiant.trim()}>
              {envoi ? "Envoi..." : "Envoyer le lien"}
            </button>
          </>
        )}

        <Link to="/connexion" style={styles.retour}><ArrowLeft size={15} /> Retour à la connexion</Link>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "inherit",
    padding: 16,
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 340,
    display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: { height: 56, width: 56, borderRadius: 12, objectFit: "cover", alignSelf: "flex-start", marginBottom: 6 },
  titre: { fontSize: 22, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 12px", lineHeight: 1.5 },
  input: {
    border: "1px solid #DDE2DE", borderRadius: 9, padding: "11px 13px", fontSize: 15,
    fontFamily: "inherit", background: "#fff", color: INK,
  },
  succes: {
    display: "flex", gap: 8, alignItems: "flex-start", background: VERT_FOND, color: GREEN_DARK,
    fontSize: 14, lineHeight: 1.5, padding: "12px 14px", borderRadius: 10,
  },
  erreur: { color: ALERTE, fontSize: 14, margin: 0, lineHeight: 1.4 },
  bouton: {
    background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px",
    fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 4,
  },
  retour: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8,
    color: TEXTE_META, fontSize: 14, textDecoration: "none", minHeight: 44,
  },
};
