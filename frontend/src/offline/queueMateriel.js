// File d'attente IndexedDB pour la page Stock matériel saisie hors-ligne
// (réception ET mouvement — un seul bandeau/compteur, `type` indique quel
// appel API rejouer, cf. syncMateriel.js).

import { STORE_QUEUE_MATERIEL as STORE } from "./db";
import { creerFileAttente } from "./queueGenerique";

const file = creerFileAttente(STORE);

export async function ajouterMaterielEnAttente(type, payload) {
  return file.ajouter({ type, payload });
}

export const listerMaterielEnAttente = file.lister;
export const supprimerMaterielEnAttente = file.supprimer;
export const marquerErreurMateriel = file.marquerErreur;
