import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { login, getMoi } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, TEXTE_META, TEXTE_GRIS, ALERTE } from "../theme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [etape2FA, setEtape2FA] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const navigate = useNavigate();

  async function finaliserConnexion() {
    try {
      const moi = await getMoi();
      localStorage.setItem("vde_role", moi.role || "");
      localStorage.setItem("vde_role_display", moi.role_display || "");
      localStorage.setItem("vde_nom", moi.nom_complet || "");
      localStorage.setItem("vde_telephone", moi.telephone || "");
      localStorage.setItem("vde_photo", moi.photo || "");
    } catch {
      localStorage.setItem("vde_role", "");
      localStorage.setItem("vde_role_display", "");
      localStorage.setItem("vde_nom", "");
      localStorage.setItem("vde_telephone", "");
      localStorage.setItem("vde_photo", "");
    }
    navigate("/");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    try {
      const resultat = await login(username, password, etape2FA ? code : undefined);
      if (resultat.besoin2fa) {
        setEtape2FA(true);
        setChargement(false);
        return;
      }
      await finaliserConnexion();
    } catch (err) {
      // Avant, TOUTE erreur affichait « Identifiants incorrects » : serveur
      // endormi, coupure réseau, limite de tentatives ou panne serveur
      // renvoyaient le même message, et on cherchait un mot de passe alors
      // que le problème était ailleurs. Un message d'erreur doit dire ce qui
      // s'est passé et quoi faire.
      const statut = err?.response?.status;
      if (!err?.response) {
        setErreur("Serveur injoignable. Vérifiez votre connexion, puis réessayez.");
      } else if (statut === 429) {
        setErreur("Trop de tentatives. Patientez une minute avant de réessayer.");
      } else if (statut >= 500) {
        setErreur("Le serveur ne répond pas correctement. Réessayez dans un instant.");
      } else {
        setErreur(etape2FA ? "Code de vérification incorrect." : "Identifiants incorrects.");
      }
    } finally {
      setChargement(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.titre}>Volailles de l'Est</h1>
        <p style={styles.sousTitre}>{etape2FA ? "Code de vérification à deux facteurs" : "Point Journalier & Tableau de bord"}</p>
        {!etape2FA ? (
          <>
            <input
              style={styles.input}
              name="vde-username"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v) { setUsername(v); e.preventDefault(); } }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            {/* Sur un téléphone, une faute de frappe dans un mot de passe
                masqué est invisible — et les mots de passe distribués aux
                chefs de ferme sont longs et générés. Pouvoir relire ce qu'on
                a tapé évite des blocages inutiles à la connexion. */}
            <div style={styles.champMotDePasse}>
              <input
                style={{ ...styles.input, ...styles.inputMotDePasse }}
                name="vde-password"
                type={motDePasseVisible ? "text" : "password"}
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v) { setPassword(v); e.preventDefault(); } }}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                style={styles.oeilBtn}
                onClick={() => setMotDePasseVisible((v) => !v)}
                aria-label={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                title={motDePasseVisible ? "Masquer" : "Afficher"}
              >
                {motDePasseVisible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </>
        ) : (
          <input
            style={styles.input}
            name="vde-code-2fa"
            placeholder="Code à 6 chiffres"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            autoFocus
          />
        )}
        {erreur && <p style={styles.erreur}>{erreur}</p>}
        <button style={styles.bouton} type="submit" disabled={chargement}>
          {chargement ? "Connexion..." : etape2FA ? "Vérifier" : "Se connecter"}
        </button>
        {etape2FA ? (
          <button type="button" style={styles.retourBtn} onClick={() => { setEtape2FA(false); setCode(""); setErreur(""); }}>
            ← Retour
          </button>
        ) : (
          <Link to="/mot-de-passe-oublie" style={styles.lienOublie}>Mot de passe oublié ?</Link>
        )}
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "inherit",
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "36px 32px", width: 340,
    display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: {
    height: 56, width: 56, borderRadius: 12, objectFit: "cover", alignSelf: "flex-start", marginBottom: 6,
  },
  titre: { fontSize: 22, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 14, color: TEXTE_GRIS, margin: "0 0 12px" },
  input: {
    border: "1px solid #DDE2DE", borderRadius: 9, padding: "11px 13px", fontSize: 15,
    fontFamily: "inherit", background: "#fff", color: INK,
  },
  // L'oeil est posé PAR-DESSUS le champ, qui garde une réserve à droite pour
  // que le texte ne passe jamais dessous.
  champMotDePasse: { position: "relative", display: "flex" },
  inputMotDePasse: { flex: 1, paddingRight: 52 },
  oeilBtn: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 48,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer", color: TEXTE_META,
    padding: 0,
  },
  erreur: { color: ALERTE, fontSize: 14, margin: 0 },
  bouton: {
    background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px",
    fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 8,
  },
  lienOublie: {
    display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44,
    color: TEXTE_META, fontSize: 14, textDecoration: "none", marginTop: 4,
  },
  retourBtn: {
    background: "none", border: "none", color: TEXTE_META, fontSize: 14, fontFamily: "inherit",
    cursor: "pointer", padding: "4px 0",
  },
};
