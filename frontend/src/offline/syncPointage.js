import { validerPointageScan, validerBadgeTemporaire } from "../api/client";
import { listerPointagesEnAttente, supprimerPointageEnAttente, marquerErreurPointage } from "./queuePointage";

let enCours = false;

// Même logique que synchroniserSoumissionsEnAttente (Point Journalier) : une
// coupure réseau arrête la boucle (retenté plus tard), un rejet serveur ne
// bloque pas les suivants — la fiche en tort reste en attente avec son
// message d'erreur affiché (cf. conversation du 27/07/2026, point 5 du
// backlog, appliqué ici au pointage le 29/07/2026).
export async function synchroniserPointagesEnAttente(onSynchronise) {
  if (enCours || !navigator.onLine) return;
  enCours = true;
  try {
    const enAttente = await listerPointagesEnAttente();
    for (const item of enAttente) {
      try {
        if (item.type === "temporaire") {
          await validerBadgeTemporaire(item.token, item.employeId, item.photo);
        } else {
          await validerPointageScan(item.token, item.photo);
        }
        await supprimerPointageEnAttente(item.id);
        onSynchronise?.(item);
      } catch (err) {
        if (!err.response) break;
        await marquerErreurPointage(item.id, err.response?.data?.detail || "Rejetée par le serveur.");
        onSynchronise?.(item);
      }
    }
  } finally {
    enCours = false;
  }
}
