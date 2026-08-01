import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { getStatut2FA, getQrConfigurer2FA, confirmer2FA, desactiver2FA } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";

export default function Securite() {
  const [actif, setActif] = useState(null);
  const [etape, setEtape] = useState("statut"); // statut | desactivation | qr | confirmation
  const [qrUrl, setQrUrl] = useState("");
  const [code, setCode] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { getStatut2FA().then((d) => setActif(d.actif)); }, []);

  async function demarrerConfiguration() {
    setErreur("");
    setEnvoi(true);
    try {
      const url = await getQrConfigurer2FA();
      setQrUrl(url);
      setEtape("qr");
    } catch {
      setErreur("Impossible de générer le QR de configuration.");
    } finally {
      setEnvoi(false);
    }
  }

  async function confirmer(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await confirmer2FA(code);
      setActif(true);
      setEtape("statut");
      setCode("");
    } catch {
      setErreur("Code incorrect — vérifie l'heure de ton téléphone et réessaie.");
    } finally {
      setEnvoi(false);
    }
  }

  // Redemande le mot de passe actuel avant de désactiver — sans ça, un
  // jeton de session volé suffirait à lui seul à couper cette protection
  // (cf. conversation du 01/08/2026 avec Serge).
  async function confirmerDesactivation(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await desactiver2FA(motDePasse);
      setActif(false);
      setEtape("statut");
      setMotDePasse("");
    } catch (err) {
      setErreur(err.response?.data?.detail || "Mot de passe incorrect.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Sécurité</div>
          <h1 style={styles.h1}>Double authentification</h1>
        </header>

        <section style={styles.card}>
          {actif === null ? (
            <p style={styles.empty}>Chargement...</p>
          ) : etape === "statut" ? (
            <div style={styles.statutBox}>
              {actif ? (
                <>
                  <div style={styles.statutHead}><ShieldCheck size={20} color={GREEN} /><span>Activée</span></div>
                  <p style={styles.texte}>Un code de ton application d'authentification est demandé à chaque connexion.</p>
                  <button style={styles.dangerBtn} onClick={() => { setErreur(""); setEtape("desactivation"); }}>
                    <ShieldOff size={15} /> Désactiver
                  </button>
                </>
              ) : (
                <>
                  <div style={styles.statutHead}><ShieldOff size={20} color="#8A948D" /><span>Désactivée</span></div>
                  <p style={styles.texte}>Ajoute une étape de vérification (code à 6 chiffres) à la connexion, via une application comme Google Authenticator ou Authy.</p>
                  <button style={styles.submitBtn} onClick={demarrerConfiguration} disabled={envoi}>
                    <Smartphone size={15} /> {envoi ? "Génération..." : "Activer la double authentification"}
                  </button>
                </>
              )}
              {erreur && <p style={styles.erreur}>{erreur}</p>}
            </div>
          ) : etape === "desactivation" ? (
            <form style={styles.qrBox} onSubmit={confirmerDesactivation}>
              <p style={styles.texte}>Confirme ton mot de passe actuel pour désactiver la double authentification.</p>
              <input
                style={styles.input} type="password" placeholder="Mot de passe"
                value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoFocus
              />
              {erreur && <p style={styles.erreur}>{erreur}</p>}
              <button style={styles.dangerBtn} type="submit" disabled={envoi || !motDePasse}>
                <ShieldOff size={15} /> {envoi ? "Vérification..." : "Confirmer la désactivation"}
              </button>
              <button type="button" style={styles.cancelBtn} onClick={() => { setEtape("statut"); setErreur(""); setMotDePasse(""); }}>Annuler</button>
            </form>
          ) : (
            <form style={styles.qrBox} onSubmit={confirmer}>
              <p style={styles.texte}>1. Scanne ce QR avec Google Authenticator, Authy ou une app équivalente.</p>
              {qrUrl && <img src={qrUrl} alt="QR de configuration 2FA" style={styles.qrImage} />}
              <p style={styles.texte}>2. Entre le code à 6 chiffres affiché par l'application pour confirmer.</p>
              <input
                style={styles.input} inputMode="numeric" placeholder="Code à 6 chiffres"
                value={code} onChange={(e) => setCode(e.target.value)} autoFocus
              />
              {erreur && <p style={styles.erreur}>{erreur}</p>}
              <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Vérification..." : "Confirmer et activer"}</button>
              <button type="button" style={styles.cancelBtn} onClick={() => { setEtape("statut"); setErreur(""); setCode(""); }}>Annuler</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 520, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 22 },
  empty: { textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  statutBox: { display: "flex", flexDirection: "column", gap: 10 },
  statutHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700 },
  texte: { fontSize: 13.5, color: "#6B756E", lineHeight: 1.5, margin: 0 },
  submitBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", alignSelf: "flex-start" },
  dangerBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#fff", color: CLAY, border: "1.5px solid #E0BBA9", borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", alignSelf: "flex-start" },
  cancelBtn: { background: "none", border: "none", color: "#7A857F", fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: "4px 0" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: 0 },
  qrBox: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" },
  qrImage: { width: 200, height: 200, imageRendering: "pixelated" },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 15, fontFamily: "inherit", color: INK, textAlign: "center" },
};
