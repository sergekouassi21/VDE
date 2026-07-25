// File d'attente IndexedDB pour les points journaliers saisis hors-ligne.
// Chaque entrée = { fermeId, payload, ferme_nom, date, createdAt }. Rejouée
// telle quelle vers l'API à la reconnexion (cf. sync.js) — sans risque de
// doublon puisque le backend fait un update_or_create sur (bande, date).

const DB_NAME = "vde-offline";
const STORE = "points-journaliers";
const DB_VERSION = 1;

function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
