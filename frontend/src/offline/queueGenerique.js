// Fabrique de file d'attente IndexedDB générique — factorise ce qui était
// dupliqué mot pour mot entre queue.js (Point Journalier) et
// queuePointage.js (pointage QR), cf. audit du 30/07/2026.

import { ouvrirDB } from "./db";

export function creerFileAttente(store) {
  async function ajouter(entree) {
    const db = await ouvrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).add({ ...entree, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function lister() {
    const db = await ouvrirDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function supprimer(id) {
    const db = await ouvrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Marque une entrée comme rejetée par le serveur (validation, conflit,
  // mois clôturé...) — distinct d'un simple échec réseau, qui lui reste
  // silencieusement en attente du retour de connexion (point 5 du backlog,
  // cf. conversation du 27/07/2026).
  async function marquerErreur(id, message) {
    const db = await ouvrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      const req = objectStore.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) objectStore.put({ ...item, erreur: message });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { ajouter, lister, supprimer, marquerErreur };
}
