import { validerBadgeTemporaire, validerPointageScan } from "../api/client";
import { listerPointagesEnAttente, marquerErreurPointage, supprimerPointageEnAttente } from "./queuePointage";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserPointagesEnAttente = creerSynchroniseur({
  lister: listerPointagesEnAttente,
  supprimer: supprimerPointageEnAttente,
  marquerErreur: marquerErreurPointage,
  // `item.position` a été capturée au moment du scan, pas au moment de la
  // synchronisation : rejouer un pointage le lendemain depuis le bureau ne
  // doit pas lui attribuer la position du bureau.
  executer: (item) =>
    item.type === "temporaire"
      ? validerBadgeTemporaire(item.token, item.employeId, item.photo, item.position)
      : validerPointageScan(item.token, item.photo, item.position),
});
