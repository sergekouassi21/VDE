import { validerBadgeTemporaire, validerPointageScan } from "../api/client";
import { listerPointagesEnAttente, marquerErreurPointage, supprimerPointageEnAttente } from "./queuePointage";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserPointagesEnAttente = creerSynchroniseur({
  lister: listerPointagesEnAttente,
  supprimer: supprimerPointageEnAttente,
  marquerErreur: marquerErreurPointage,
  executer: (item) =>
    item.type === "temporaire"
      ? validerBadgeTemporaire(item.token, item.employeId, item.photo)
      : validerPointageScan(item.token, item.photo),
});
