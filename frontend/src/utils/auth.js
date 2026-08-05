// Rôle courant lu depuis localStorage (mis en cache à la connexion, cf.
// Login.jsx). Un compte sans profil (superutilisateur créé en ligne de
// commande) est traité comme Direction, même convention que côté backend
// (cf. backend/exploitation/permissions.py). Source unique : ce même
// critère était réécrit indépendamment dans App.jsx, Dashboard.jsx,
// Historique.jsx et PointJournalier.jsx — cf. audit du 30/07/2026.
export function estDirectionOuAdmin() {
  const role = localStorage.getItem("vde_role");
  return !role || role === "DIRECTION" || role === "ADMIN";
}

// Technicien/vétérinaire externe — accès restreint à "Vaccins &
// traitements" uniquement (cf. IsFermeAccessible côté backend, qui refuse
// ce rôle partout ailleurs). Cf. conversation du 05/08/2026 avec Serge.
export function estTechnicien() {
  return localStorage.getItem("vde_role") === "TECHNICIEN";
}
