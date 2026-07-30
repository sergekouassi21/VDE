// File d'attente IndexedDB pour les points journaliers saisis hors-ligne.
// Chaque entrée = { fermeId, payload, ferme_nom, date, createdAt }. Rejouée
// telle quelle vers l'API à la reconnexion (cf. sync.js) — sans risque de
// doublon puisque le backend fait un update_or_create sur (bande, date).

import { STORE_QUEUE as STORE } from "./db";
import { creerFileAttente } from "./queueGenerique";

const file = creerFileAttente(STORE);

export async function ajouterSoumissionEnAttente(fermeId, fermeNom, payload) {
  return file.ajouter({ fermeId, fermeNom, date: payload.date, payload });
}

export const listerSoumissionsEnAttente = file.lister;
export const supprimerSoumissionEnAttente = file.supprimer;
export const marquerErreurSoumission = file.marquerErreur;
