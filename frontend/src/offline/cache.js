// Cache de lecture IndexedDB — mémorise la dernière réponse serveur reçue
// avec succès pour une page (Historique, Ventes), afin de rester
// consultable hors-ligne. Lecture seule : contrairement à queue.js, rien
// n'est rejoué vers l'API, ces pages ne créent/modifient rien sans réseau.

import { ouvrirDB, STORE_CACHE as STORE } from "./db";

export async function mettreEnCache(cle, donnees) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ cle, donnees, sauvegardeLe: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function lireCache(cle) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(cle);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
