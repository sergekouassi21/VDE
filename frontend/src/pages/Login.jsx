import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK } from "../theme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setErreur("Identifiants incorrects.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
        <h1 style={styles.titre}>Volailles de l'Est</h1>
        <p style={styles.sousTitre}>Point Journalier &amp; Tableau de bord</p>
        <input
          style={styles.input}
          name="vde-username"
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v) { setUsername(v); e.preventDefault(); } }}
          autoComplete="off"
          autoFocus
        />
        <input
          style={styles.input}
          name="vde-password"
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v) { setPassword(v); e.preventDefault(); } }}
          autoComplete="new-password"
        />
        {erreur && <p style={styles.erreur}>{erreur}</p>}
        <button style={styles.bouton} type="submit" disabled={chargement}>
          {chargement ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, fontFamily: "'Inter', sans-serif",
  },
  card: {
    background: CREAM, borderRadius: 20, padding: "36px 32px", width: 340,
    display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  logo: {
    height: 56, width: 56, borderRadius: 12, objectFit: "cover", alignSelf: "flex-start", marginBottom: 6,
  },
  titre: { fontSize: 22, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 13, color: "#6B756E", margin: "0 0 12px" },
  input: {
    border: "1px solid #DDE2DE", borderRadius: 9, padding: "11px 13px", fontSize: 15,
    fontFamily: "inherit", background: "#fff", color: INK,
  },
  erreur: { color: "#9E4527", fontSize: 13, margin: 0 },
  bouton: {
    background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px",
    fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 8,
  },
};
