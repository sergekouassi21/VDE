import { ALERTE, ALERTE_FOND } from "../theme";
import { WifiOff } from "lucide-react";

// Signale que les chiffres affichés ne sont plus forcément à jour.
//
// Indispensable parce que le service worker sert /api/ en NetworkFirst :
// hors réseau, les requêtes RÉUSSISSENT avec des données mises en cache. La
// page s'affiche donc parfaitement, avec des chiffres qui peuvent dater de
// plusieurs jours et rien pour le dire. C'est plus dangereux qu'une page en
// erreur : on prend une décision (commander de l'aliment, vendre un lot) sur
// des données périmées en toute confiance.
//
// `genereLe` vient du serveur (champ `genere_le` de la réponse), pas de
// l'horloge du téléphone — souvent fausse sur le terrain — et il est mis en
// cache avec la réponse, donc il date réellement les chiffres affichés.

const styles = {
  bandeau: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: ALERTE_FOND,
    color: ALERTE,
    fontSize: 14,
    fontWeight: 500,
    padding: "10px 16px",
    marginBottom: 14,
    borderRadius: 10,
    lineHeight: 1.35,
  },
  icone: { flex: "none" },
};

function formaterDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Fuseau explicite : sans lui, un téléphone réglé sur un autre fuseau
  // afficherait une heure décalée par rapport à celle des fermes.
  return d.toLocaleString("fr-FR", {
    timeZone: "Africa/Abidjan",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BandeauFraicheur({ enLigne, genereLe, complement }) {
  if (enLigne) return null;

  const date = formaterDate(genereLe);

  return (
    <div style={styles.bandeau} role="status">
      <WifiOff size={16} style={styles.icone} />
      <span>
        Hors-ligne — {date ? <>chiffres arrêtés au <b>{date}</b></> : "chiffres peut-être périmés"}.
        {complement ? ` ${complement}` : " Ils se mettront à jour au retour du réseau."}
      </span>
    </div>
  );
}
