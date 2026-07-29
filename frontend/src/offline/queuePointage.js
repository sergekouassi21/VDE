// File d'attente IndexedDB pour les validations de pointage (arrivée/départ)
// faites sans réseau — le selfie (déjà un petit JPEG basse résolution, cf.
// CaptureSelfie) est stocké tel quel en Blob, rejoué vers l'API à la
// reconnexion (cf. syncPointage.js). Chaque entrée = { type: "scan" |
// "temporaire", token, employeId (temporaire uniquement), photo, createdAt }.

import { ouvrirDB, STORE_QUEUE_POINTAGE as STORE } from "./db";

export async function ajouterPointageEnAttente(entree) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...entree, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listerPointagesEnAttente() {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function supprimerPointageEnAttente(id) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function marquerErreurPointage(id, message) {
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
