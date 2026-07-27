import { soumettrePointJournalier } from "../api/client";
import { listerSoumissionsEnAttente, marquerErreurSoumission, supprimerSoumissionEnAttente } from "./queue";

let enCours = false;

// Rejoue les soumissions en attente dans l'ordre, une par une. Une coupure
// réseau (pas de réponse serveur) arrête la boucle — les suivantes seront
// retentées au prochain appel. Un rejet du serveur (validation, conflit,
// mois clôturé...) ne bloque en revanche PAS les suivantes : la fiche en
// tort reste en attente avec son message d'erreur affiché (point 5 du
// backlog, cf. conversation du 27/07/2026) plutôt que de geler
// silencieusement toute la file derrière elle.
export async function synchroniserSoumissionsEnAttente(onSoumissionSynchronisee) {
  if (enCours || !navigator.onLine) return;
  enCours = true;
  try {
    const enAttente = await listerSoumissionsEnAttente();
    for (const item of enAttente) {
      try {
        await soumettrePointJournalier(item.fermeId, item.payload);
        await supprimerSoumissionEnAttente(item.id);
        onSoumissionSynchronisee?.(item);
      } catch (err) {
        if (!err.response) break;
        await marquerErreurSoumission(item.id, err.response?.data?.detail || "Rejetée par le serveur.");
        onSoumissionSynchronisee?.(item);
      }
    }
  } finally {
    enCours = false;
  }
}
