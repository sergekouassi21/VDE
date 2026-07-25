import { soumettrePointJournalier } from "../api/client";
import { listerSoumissionsEnAttente, supprimerSoumissionEnAttente } from "./queue";

let enCours = false;

// Rejoue les soumissions en attente dans l'ordre, une par une. S'arrête au
// premier échec (réseau encore instable) plutôt que d'insister en boucle —
// les suivantes seront retentées au prochain appel (reconnexion, minuterie).
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
      } catch {
        break;
      }
    }
  } finally {
    enCours = false;
  }
}
