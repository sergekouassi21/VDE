import { marquerFaitEvenementSante } from "../api/client";
import { listerEvenementsFaitsEnAttente, marquerErreurEvenementFait, supprimerEvenementFaitEnAttente } from "./queueVaccinations";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserEvenementsFaitsEnAttente = creerSynchroniseur({
  lister: listerEvenementsFaitsEnAttente,
  supprimer: supprimerEvenementFaitEnAttente,
  marquerErreur: marquerErreurEvenementFait,
  executer: (item) => marquerFaitEvenementSante(item.id),
});
