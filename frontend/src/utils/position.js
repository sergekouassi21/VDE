// Position du téléphone au moment d'un pointage.
//
// Ne rejette JAMAIS : une position introuvable (toit en tôle d'un poulailler,
// GPS lent, permission refusée) renvoie simplement null. C'est le serveur qui
// décide quoi en faire — il accepte le pointage et le signale à la Direction,
// parce que bloquer la paie sur une panne de GPS serait pire que le risque
// qu'on cherche à couvrir.

// 8 secondes : au-delà, on n'attend plus. Un employé qui badge le matin ne
// doit pas patienter devant un écran figé pendant que le GPS cherche.
const DELAI_MAX_MS = 8000;

export function obtenirPosition() {
  return new Promise((resoudre) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resoudre(null);
      return;
    }
    let repondu = false;
    const terminer = (valeur) => {
      if (repondu) return;
      repondu = true;
      resoudre(valeur);
    };

    // Garde-fou : sur certains navigateurs Android, ni le succès ni l'erreur
    // ne se déclenchent quand le GPS est coupé — la promesse resterait en
    // attente et le bouton « Valider » tournerait indéfiniment.
    setTimeout(() => terminer(null), DELAI_MAX_MS + 500);

    navigator.geolocation.getCurrentPosition(
      (pos) => terminer({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        precision: pos.coords.accuracy,
      }),
      () => terminer(null),
      { enableHighAccuracy: true, timeout: DELAI_MAX_MS, maximumAge: 30000 },
    );
  });
}

// Ajoute la position à un FormData de pointage, si elle a pu être obtenue.
export function ajouterPosition(donnees, position) {
  if (!position) return donnees;
  donnees.append("latitude", String(position.latitude));
  donnees.append("longitude", String(position.longitude));
  return donnees;
}
