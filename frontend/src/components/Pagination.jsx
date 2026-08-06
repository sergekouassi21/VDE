import { ChevronLeft, ChevronRight } from "lucide-react";
import { INK, BORD_FORT, TEXTE_GRIS, GREEN_DARK } from "../theme";

// Navigation entre pages pour les écrans d'historique.
//
// Ces listes grossissent chaque jour et ne décroissent jamais. Sans
// pagination, le serveur les bornait silencieusement aux N plus récents :
// l'utilisateur croyait tout voir alors qu'il manquait des lignes, sans
// aucun indice. Ici, le nombre total est toujours affiché — c'est justement
// ce que la troncature muette ne permettait pas de savoir.
//
// Boutons volontairement larges (48 px) : ils sont manipulés au pouce, en
// extérieur, sur des téléphones d'entrée de gamme.

const styles = {
  barre: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap", marginTop: 14,
  },
  compteur: { fontSize: 14, color: TEXTE_GRIS, fontVariantNumeric: "tabular-nums" },
  boutons: { display: "flex", alignItems: "center", gap: 8 },
  btn: {
    display: "flex", alignItems: "center", gap: 4, minHeight: 48, padding: "0 16px",
    borderRadius: 10, border: `1.5px solid ${BORD_FORT}`, background: "#fff",
    color: INK, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  btnInactif: { opacity: .4, cursor: "default" },
  position: {
    fontSize: 14, fontWeight: 700, color: GREEN_DARK, minWidth: 92,
    textAlign: "center", fontVariantNumeric: "tabular-nums",
  },
};

export default function Pagination({ page, total, taillePage, onChange, libelle = "lignes" }) {
  const nbPages = Math.max(1, Math.ceil((total || 0) / taillePage));
  if (nbPages <= 1) return null;

  const precedentPossible = page > 1;
  const suivantPossible = page < nbPages;

  return (
    <div style={styles.barre}>
      <span style={styles.compteur}>
        {total.toLocaleString("fr-FR")} {libelle} au total
      </span>
      <div style={styles.boutons}>
        <button
          style={{ ...styles.btn, ...(precedentPossible ? {} : styles.btnInactif) }}
          onClick={() => precedentPossible && onChange(page - 1)}
          disabled={!precedentPossible}
          aria-label="Page précédente"
        >
          <ChevronLeft size={17} /> Préc.
        </button>
        <span style={styles.position} aria-live="polite">{page} / {nbPages}</span>
        <button
          style={{ ...styles.btn, ...(suivantPossible ? {} : styles.btnInactif) }}
          onClick={() => suivantPossible && onChange(page + 1)}
          disabled={!suivantPossible}
          aria-label="Page suivante"
        >
          Suiv. <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
