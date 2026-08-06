import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, CheckCircle2, ArrowLeft } from "lucide-react";
import { reinitialiserMotDePasse } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, TEXTE_META, TEXTE_GRIS, ALERTE, VERT_FOND } from "../theme";

// Choix du nouveau mot de passe, depuis le lien reçu par e-mail.
//
// Le mot de passe est affichable par défaut : on arrive ici pour en CHOISIR
// un, souvent sur un téléphone, et le saisir deux fois à l'aveugle sur un
// clavier tactile est le meilleur moyen de se retrouver bloqué dehors une
// seconde fois. Un seul champ, visible, vaut mieux que deux champs masqués.

export default function NouveauMotDePasse() {
  const { uid, jeton } = useParams();
  const navigate = useNavigate();
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(true);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await reinitialiserMotDePasse({ uid, jeton, nouveau_mot_de_passe: motDePasse });
      setFini(true);
      setTimeout(() => navigate("/connexion"), 2500);
    } catch (err) {
      if (!err.response) {
        setErreur("Serveur injoignable. Vérifiez votre connexion, puis réessayez.");
      } else {
        setErreur(err.response?.data?.detail || "Impossible de modifier le mot de passe.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  if (fini) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <CheckCircle2 size={36} color={GREEN} />
          <h1 style={styles.titre}>Mot de passe modifié</h1>
          <p style={styles.sousTitre}>
            Vous allez être redirigé vers la connexion. Vos autres appareils ont été
            déconnectés : il faudra vous y reconnecter avec ce nouveau mot de passe.
          </p>
          <Link to="/connexion" style={styles.bouton}>Se connecter</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={envoyer}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.titre}>Nouveau mot de passe</h1>
        <p style={styles.sousTitre}>Choisissez un mot de passe d'au moins 8 caractères, pas trop courant.</p>

        <div style={styles.champ}>
          <input
            style={{ ...styles.input, paddingRight: 52 }}
            type={visible ? "text" : "password"}
            placeholder="Nouveau mot de passe"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <button
            type="button"
            style={styles.oeilBtn}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {erreur && <p style={styles.erreur}>{erreur}</p>}

        <button style={styles.bouton} type="submit" disabled={envoi || motDePasse.length < 8}>
          {envoi ? "Enregistrement..." : "Enregistrer"}
        </button>
        <Link to="/mot-de-passe-oublie" style={styles.retour}><ArrowLeft size={15} /> Demander un nouveau lien</Link>
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
  champ: { position: "relative", display: "flex" },
  input: {
    flex: 1, border: "1px solid #DDE2DE", borderRadius: 9, padding: "11px 13px", fontSize: 15,
    fontFamily: "inherit", background: "#fff", color: INK,
  },
  oeilBtn: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 48,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer", color: TEXTE_META, padding: 0,
  },
  erreur: { color: ALERTE, fontSize: 14, margin: 0, lineHeight: 1.4 },
  bouton: {
    background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px",
    fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 4,
    textAlign: "center", textDecoration: "none",
  },
  retour: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8,
    color: TEXTE_META, fontSize: 14, textDecoration: "none", minHeight: 44,
  },
  succes: { background: VERT_FOND },
};
