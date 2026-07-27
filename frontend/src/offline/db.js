// Base IndexedDB partagée par tous les modules hors-ligne — un seul point
// d'ouverture pour éviter tout conflit de version entre la file d'attente
// d'écriture (queue.js) et le cache de lecture (cache.js).

export const DB_NAME = "vde-offline";
export const DB_VERSION = 2;
export const STORE_QUEUE = "points-journaliers";
export const STORE_CACHE = "cache-lecture";

export function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "cle" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
