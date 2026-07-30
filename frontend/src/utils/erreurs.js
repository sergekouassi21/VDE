// Suivi d'erreurs en production sans SDK tiers (Sentry alourdirait le bundle,
// à contre-courant du code-splitting fait pour les chefs de ferme en zone à
// réseau faible) — remonte les erreurs JS non interceptées au backend, qui
// loggue via 'vde.frontend_errors' (relié à un handler mail_admins, cf.
// backend/vde_backend/settings.py et exploitation/views.signaler_erreur_frontend).
// Cf. conversation du 30/07/2026 avec Serge : "aucun suivi d'erreurs en production".
import { api } from "../api/client";

// Plafond par session pour ne pas spammer le backend/l'email si une même
// erreur se répète en boucle (ex: un rendu qui replante à chaque frame).
const MAX_RAPPORTS_PAR_SESSION = 5;
let rapportsEnvoyes = 0;

function envoyer(message, stack) {
  if (rapportsEnvoyes >= MAX_RAPPORTS_PAR_SESSION) return;
  rapportsEnvoyes += 1;
  api
    .post("/erreurs-frontend/", {
      message: String(message || "").slice(0, 500),
      stack: String(stack || "").slice(0, 2000),
      url: window.location.href,
      user_agent: navigator.userAgent,
    })
    .catch(() => {});
}

export function activerSuiviErreurs() {
  window.addEventListener("error", (e) => envoyer(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => envoyer(e.reason?.message || String(e.reason), e.reason?.stack));
}
