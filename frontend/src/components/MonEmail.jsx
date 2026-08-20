import { useState, useEffect } from "react";
import { Mail, Check, AlertTriangle } from "lucide-react";
import { getMoi, definirMonEmail } from "../api/client";
import {
  GREEN, GREEN_DARK, INK, TEXTE_GRIS, BORD, BORD_FORT, ALERTE, ALERTE_FOND, VERT_FOND,
} from "../theme";

// Adresse e-mail du compte connecté.
//
// C'est le prérequis du « mot de passe oublié » : sans adresse enregistrée,
// aucun lien de réinitialisation ne peut partir, et le formulaire répond dans
// le vide. Autant pouvoir la renseigner AVANT d'en avoir besoin, plutôt que
// de découvrir le problème le jour où on est déjà bloqué dehors.

export default function MonEmail() {
  const [email, setEmail] = useState("");
  const [initial, setInitial] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    getMoi()
      .then((moi) => { setEmail(moi.email || ""); setInitial(moi.email || ""); setChargement(false); })
      .catch(() => setChargement(false));
  }, []);

  async function enregistrer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    setMessage("");
    try {
      const data = await definirMonEmail(email.trim(), motDePasse);
      setInitial(data.email);
      setMotDePasse("");
      setMessage(data.email ? "Adresse enregistrée." : "Adresse effacée.");
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Impossible d'enregistrer cette adresse.");
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement) return null;

  return (
    <section style={styles.card}>
      <div style={styles.entete}>
        <Mail size={18} color={GREEN} />
        <div>
          <h2 style={styles.titre}>Mon adresse e-mail</h2>
          <p style={styles.sousTitre}>
            Sert uniquement à recevoir un lien si vous oubliez votre mot de passe.
          </p>
        </div>
      </div>

      {!initial && (
        <div style={styles.avertissement}>
          <AlertTriangle size={15} />
          <span>
            Aucune adresse enregistrée. En cas d'oubli de votre mot de passe, aucun lien
            ne pourra vous être envoyé — il faudra passer par l'administration.
          </span>
        </div>
      )}

      {message && <div style={styles.succes}><Check size={14} /> {message}</div>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}

      <form style={styles.form} onSubmit={enregistrer}>
        <div style={styles.ligne}>
          <input
            type="email"
            style={styles.input}
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button
            style={styles.btn}
            type="submit"
            disabled={envoi || email.trim() === initial || motDePasse === ""}
          >
            {envoi ? "..." : "Enregistrer"}
          </button>
        </div>
        {/* Le serveur exige le mot de passe actuel pour tout changement
            d'adresse — sans lui, un jeton volé suffisait à détourner le
            « mot de passe oublié » (cf. pentest du 20/08/2026). */}
        {email.trim() !== initial && (
          <input
            type="password"
            style={styles.input}
            placeholder="Votre mot de passe actuel"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
          />
        )}
      </form>
    </section>
  );
}

const styles = {
  card: { background: "#fff", borderRadius: 16, border: `1px solid ${BORD}`, padding: 18, marginTop: 16 },
  entete: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  titre: { fontSize: 17, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 14, color: TEXTE_GRIS, margin: "4px 0 0", lineHeight: 1.4 },
  avertissement: {
    display: "flex", gap: 8, alignItems: "flex-start", background: ALERTE_FOND, color: ALERTE,
    fontSize: 14, lineHeight: 1.45, padding: "10px 14px", borderRadius: 10, marginBottom: 12,
  },
  succes: {
    display: "flex", alignItems: "center", gap: 6, background: VERT_FOND, color: GREEN_DARK,
    fontSize: 14, fontWeight: 600, padding: "9px 14px", borderRadius: 10, marginBottom: 12,
  },
  erreur: {
    background: ALERTE_FOND, color: ALERTE, fontSize: 14, padding: "9px 14px",
    borderRadius: 10, marginBottom: 12,
  },
  form: { display: "flex", flexDirection: "column", gap: 8 },
  ligne: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: {
    flex: "1 1 200px", minWidth: 0, minHeight: 46, padding: "0 12px", borderRadius: 10,
    border: `1.5px solid ${BORD_FORT}`, fontFamily: "inherit", fontSize: 15, color: INK,
  },
  btn: {
    minHeight: 46, padding: "0 18px", borderRadius: 10, border: "none", background: GREEN,
    color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
};
