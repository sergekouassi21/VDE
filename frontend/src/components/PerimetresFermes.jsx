import { useState, useEffect, useCallback } from "react";
import { MapPin, Crosshair, Trash2, Check } from "lucide-react";
import { getFermes, definirPerimetreFerme } from "../api/client";
import { obtenirPosition } from "../utils/position";
import {
  GREEN, GREEN_DARK, INK, CLAY, TEXTE_DOUX, TEXTE_GRIS, BORD, BORD_FORT, ALERTE, ALERTE_FOND, VERT_FOND,
} from "../theme";

// Périmètre de pointage par ferme.
//
// Le point de référence se capture DEPUIS la ferme, avec le téléphone : c'est
// bien plus fiable que de chercher des coordonnées sur une carte, et ça ne
// demande aucune compétence particulière. Tant qu'une ferme n'a pas de
// périmètre, ses employés pointent sans vérification de lieu — la protection
// s'active donc ferme par ferme, à mesure des déplacements.

export default function PerimetresFermes() {
  const [fermes, setFermes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");

  const rafraichir = useCallback(() => {
    getFermes()
      .then((data) => { setFermes(data); setChargement(false); })
      .catch(() => { setErreur("Impossible de charger les fermes."); setChargement(false); });
  }, []);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  async function capturer(ferme) {
    setEnCours(ferme.id);
    setErreur("");
    setMessage("");
    const position = await obtenirPosition();
    if (!position) {
      setErreur(
        "Impossible d'obtenir la position de ce téléphone. Sortez des bâtiments, "
        + "vérifiez que la localisation est activée, puis réessayez.",
      );
      setEnCours(null);
      return;
    }
    try {
      await definirPerimetreFerme(ferme.id, {
        latitude: position.latitude,
        longitude: position.longitude,
        rayon_metres: ferme.rayon_metres || 300,
      });
      setMessage(
        `Position de ${ferme.nom} enregistrée`
        + (position.precision ? ` (précision ${Math.round(position.precision)} m)` : ""),
      );
      rafraichir();
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Impossible d'enregistrer cette position.");
    } finally {
      setEnCours(null);
    }
  }

  async function effacer(ferme) {
    if (!window.confirm(
      `Effacer le périmètre de ${ferme.nom} ? Ses employés pourront de nouveau pointer depuis n'importe où.`,
    )) return;
    setEnCours(ferme.id);
    try {
      await definirPerimetreFerme(ferme.id, { latitude: null, longitude: null });
      setMessage(`Périmètre de ${ferme.nom} effacé`);
      rafraichir();
    } finally {
      setEnCours(null);
    }
  }

  async function changerRayon(ferme, valeur) {
    const rayon = parseInt(valeur, 10);
    if (!rayon || rayon < 50 || rayon > 5000) return;
    await definirPerimetreFerme(ferme.id, {
      latitude: ferme.latitude, longitude: ferme.longitude, rayon_metres: rayon,
    });
    rafraichir();
  }

  const sansPerimetre = fermes.filter((f) => !f.latitude).length;

  return (
    <section style={styles.card}>
      <div style={styles.entete}>
        <MapPin size={18} color={GREEN} />
        <div>
          <h2 style={styles.titre}>Périmètre de pointage</h2>
          <p style={styles.sousTitre}>
            Un pointage est refusé si le téléphone se trouve hors du périmètre d'une ferme
            où travaille la personne scannée.
          </p>
        </div>
      </div>

      <p style={styles.explication}>
        Rendez-vous sur chaque ferme, puis appuyez sur <b>Capturer ma position</b> depuis
        ce téléphone. Tant qu'une ferme n'a pas de position, ses employés pointent
        sans vérification de lieu.
      </p>

      {sansPerimetre > 0 && (
        <div style={styles.avertissement}>
          {sansPerimetre} ferme{sansPerimetre > 1 ? "s" : ""} sans périmètre — la vérification
          de lieu n'y est pas active.
        </div>
      )}

      {message && <div style={styles.succes}><Check size={14} /> {message}</div>}
      {erreur && <div style={styles.erreur}>{erreur}</div>}

      {chargement ? (
        <p style={styles.vide}>Chargement...</p>
      ) : (
        <div style={styles.liste}>
          {fermes.map((f) => (
            <div key={f.id} style={styles.ligne}>
              <div style={styles.infos}>
                <span style={styles.nom}>{f.nom}</span>
                {f.latitude ? (
                  <span style={styles.coords}>
                    {Number(f.latitude).toFixed(5)}, {Number(f.longitude).toFixed(5)}
                  </span>
                ) : (
                  <span style={styles.absent}>aucune position enregistrée</span>
                )}
              </div>

              <div style={styles.actions}>
                {f.latitude && (
                  <label style={styles.rayonLabel}>
                    rayon
                    <input
                      type="number" min="50" max="5000" step="50"
                      defaultValue={f.rayon_metres}
                      onBlur={(e) => changerRayon(f, e.target.value)}
                      style={styles.rayonInput}
                    />
                    m
                  </label>
                )}
                <button
                  style={styles.btnCapture}
                  onClick={() => capturer(f)}
                  disabled={enCours === f.id}
                >
                  <Crosshair size={14} />
                  {enCours === f.id ? "Localisation..." : f.latitude ? "Recapturer" : "Capturer ma position"}
                </button>
                {f.latitude && (
                  <button style={styles.btnEffacer} onClick={() => effacer(f)} disabled={enCours === f.id} title="Effacer">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const styles = {
  card: { background: "#fff", borderRadius: 16, border: `1px solid ${BORD}`, padding: 18, marginTop: 16 },
  entete: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  titre: { fontSize: 17, fontWeight: 700, margin: 0, color: INK },
  sousTitre: { fontSize: 14, color: TEXTE_GRIS, margin: "4px 0 0", lineHeight: 1.4 },
  explication: { fontSize: 14, color: TEXTE_GRIS, lineHeight: 1.5, margin: "0 0 12px" },
  avertissement: {
    background: ALERTE_FOND, color: ALERTE, fontSize: 14, fontWeight: 500,
    padding: "9px 14px", borderRadius: 10, marginBottom: 12,
  },
  succes: {
    display: "flex", alignItems: "center", gap: 6, background: VERT_FOND, color: GREEN_DARK,
    fontSize: 14, fontWeight: 600, padding: "9px 14px", borderRadius: 10, marginBottom: 12,
  },
  erreur: {
    background: ALERTE_FOND, color: ALERTE, fontSize: 14, padding: "9px 14px",
    borderRadius: 10, marginBottom: 12, lineHeight: 1.4,
  },
  liste: { display: "flex", flexDirection: "column" },
  ligne: {
    display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: `1px solid ${BORD}`,
  },
  infos: { display: "flex", flexDirection: "column", minWidth: 0, gap: 2 },
  nom: { fontSize: 15, fontWeight: 700, color: INK },
  coords: { fontSize: 14, color: TEXTE_GRIS, fontVariantNumeric: "tabular-nums" },
  absent: { fontSize: 14, color: CLAY, fontWeight: 500 },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rayonLabel: { display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: TEXTE_DOUX },
  rayonInput: {
    width: 74, minHeight: 44, padding: "0 8px", borderRadius: 8, border: `1.5px solid ${BORD_FORT}`,
    fontFamily: "inherit", fontSize: 14, color: INK, textAlign: "right",
  },
  btnCapture: {
    display: "flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px",
    borderRadius: 10, border: "none", background: GREEN, color: "#fff",
    fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  btnEffacer: {
    display: "flex", alignItems: "center", minHeight: 44, padding: "0 12px", borderRadius: 10,
    border: `1.5px solid ${BORD_FORT}`, background: "#fff", color: CLAY,
    fontFamily: "inherit", cursor: "pointer",
  },
  vide: { fontSize: 14, color: TEXTE_DOUX, textAlign: "center", padding: "16px 0" },
};
