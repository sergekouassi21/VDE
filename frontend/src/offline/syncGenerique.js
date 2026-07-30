// Boucle de synchronisation générique — factorise ce qui était dupliqué mot
// pour mot entre sync.js (Point Journalier) et syncPointage.js (pointage
// QR), cf. audit du 30/07/2026.
//
// Une coupure réseau (pas de réponse serveur) arrête la boucle — les
// suivantes seront retentées au prochain appel. Un rejet du serveur
// (validation, conflit, mois clôturé...) ne bloque en revanche PAS les
// suivantes : la fiche en tort reste en attente avec son message d'erreur
// affiché (point 5 du backlog, cf. conversation du 27/07/2026) plutôt que de
// geler silencieusement toute la file derrière elle.
export function creerSynchroniseur({ lister, supprimer, marquerErreur, executer }) {
  let enCours = false;

  return async function synchroniser(onSynchronise) {
    if (enCours || !navigator.onLine) return;
    enCours = true;
    try {
      const enAttente = await lister();
      for (const item of enAttente) {
        try {
          await executer(item);
          await supprimer(item.id);
          onSynchronise?.(item);
        } catch (err) {
          if (!err.response) break;
          await marquerErreur(item.id, err.response?.data?.detail || "Rejetée par le serveur.");
          onSynchronise?.(item);
        }
      }
    } finally {
      enCours = false;
    }
  };
}
