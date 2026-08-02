// File d'attente IndexedDB pour "marquer un vaccin/traitement comme fait"
// saisi hors-ligne — un seul type d'action, même modèle simple que queue.js
// (Point Journalier).

import { STORE_QUEUE_VACCINATIONS as STORE } from "./db";
import { creerFileAttente } from "./queueGenerique";

const file = creerFileAttente(STORE);

export async function ajouterEvenementFaitEnAttente(id) {
  return file.ajouter({ id });
}

export const listerEvenementsFaitsEnAttente = file.lister;
export const supprimerEvenementFaitEnAttente = file.supprimer;
export const marquerErreurEvenementFait = file.marquerErreur;
