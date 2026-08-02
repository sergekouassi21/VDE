// File d'attente IndexedDB pour les transferts entre fermes saisis
// hors-ligne (stock ET équipement — un seul bandeau/compteur pour la page
// Transferts, `type` indique quel appel API rejouer, cf. syncTransferts.js).

import { STORE_QUEUE_TRANSFERTS as STORE } from "./db";
import { creerFileAttente } from "./queueGenerique";

const file = creerFileAttente(STORE);

export async function ajouterTransfertEnAttente(type, payload) {
  return file.ajouter({ type, payload });
}

export const listerTransfertsEnAttente = file.lister;
export const supprimerTransfertEnAttente = file.supprimer;
export const marquerErreurTransfert = file.marquerErreur;
