import { soumettrePointJournalier } from "../api/client";
import { listerSoumissionsEnAttente, marquerErreurSoumission, supprimerSoumissionEnAttente } from "./queue";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserSoumissionsEnAttente = creerSynchroniseur({
  lister: listerSoumissionsEnAttente,
  supprimer: supprimerSoumissionEnAttente,
  marquerErreur: marquerErreurSoumission,
  executer: (item) => soumettrePointJournalier(item.fermeId, item.payload),
});
