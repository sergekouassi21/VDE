// File d'attente IndexedDB pour les points journaliers saisis hors-ligne.
// Chaque entrée = { fermeId, payload, ferme_nom, date, createdAt }. Rejouée
// telle quelle vers l'API à la reconnexion (cf. sync.js) — sans risque de
// doublon puisque le backend fait un update_or_create sur (bande, date).

import { ouvrirDB, STORE_QUEUE as STORE } from "./db";

export async function ajouterSoumissionEnAttente(fermeId, fermeNom, payload) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ fermeId, fermeNom, date: payload.date, payload, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listerSoumissionsEnAttente() {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function supprimerSoumissionEnAttente(id) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Marque une soumission comme rejetée par le serveur (validation, conflit,
// mois clôturé...) — distinct d'un simple échec réseau, qui lui reste
// silencieusement en attente du retour de connexion. Sans ça, une fiche
// invalide restait bloquée indéfiniment dans la file sans que personne ne
// sache pourquoi (point 5 du backlog, cf. conversation du 27/07/2026).
export async function marquerErreurSoumission(id, message) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (item) store.put({ ...item, erreur: message });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
