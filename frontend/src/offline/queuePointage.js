// File d'attente IndexedDB pour les validations de pointage (arrivée/départ)
// faites sans réseau — le selfie (déjà un petit JPEG basse résolution, cf.
// CaptureSelfie) est stocké tel quel en Blob, rejoué vers l'API à la
// reconnexion (cf. syncPointage.js). Chaque entrée = { type: "scan" |
// "temporaire", token, employeId (temporaire uniquement), photo, createdAt }.

import { STORE_QUEUE_POINTAGE as STORE } from "./db";
import { creerFileAttente } from "./queueGenerique";

const file = creerFileAttente(STORE);

export const ajouterPointageEnAttente = file.ajouter;
export const listerPointagesEnAttente = file.lister;
export const supprimerPointageEnAttente = file.supprimer;
export const marquerErreurPointage = file.marquerErreur;
