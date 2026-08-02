import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8010/api";
export const ADMIN_URL = `${API_BASE_URL.replace(/\/api\/?$/, "")}/admin/`;

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vde_token");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

export async function login(username, password, code) {
  const { data } = await axios.post(`${API_BASE_URL}/auth/login/`, { username, password, code });
  if (data.besoin_2fa) return { besoin2fa: true };
  localStorage.setItem("vde_token", data.token);
  return { token: data.token };
}

export function logout() {
  localStorage.removeItem("vde_token");
  localStorage.removeItem("vde_role");
  localStorage.removeItem("vde_role_display");
  localStorage.removeItem("vde_nom");
  localStorage.removeItem("vde_telephone");
  localStorage.removeItem("vde_photo");
}

export function isAuthenticated() {
  return !!localStorage.getItem("vde_token");
}

export const getMoi = () => api.get("/moi/").then((r) => r.data);
export const getStatut2FA = () => api.get("/auth/2fa/statut/").then((r) => r.data);
// Le mot de passe n'est exigé par le serveur que si une 2FA est déjà active
// (reconfiguration) — la 1ère activation n'a rien à protéger et l'accepte
// sans, cf. conversation du 01/08/2026 avec Serge.
export const getQrConfigurer2FA = (password) =>
  api.post("/auth/2fa/configurer/", { password }, { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const confirmer2FA = (code) => api.post("/auth/2fa/confirmer/", { code }).then((r) => r.data);
export const desactiver2FA = (password) => api.post("/auth/2fa/desactiver/", { password }).then((r) => r.data);

export const getRechercheGlobale = (q) => api.get("/recherche/", { params: { q } }).then((r) => r.data);
export const getJournalAudit = (params) => api.get("/journal-audit/", { params }).then((r) => r.data);
export const getFermes = () => api.get("/fermes/").then((r) => r.data);
export const getFerme = (id) => api.get(`/fermes/${id}/`).then((r) => r.data);
export const declarerBande = (id, payload) => api.post(`/fermes/${id}/declarer-bande/`, payload).then((r) => r.data);
export const terminerBande = (id, payload) => api.post(`/fermes/${id}/terminer-bande/`, payload).then((r) => r.data);
export const getBandes = (params) => api.get("/bandes/", { params }).then((r) => r.data);
export const getBilanBande = (bandeId) => api.get(`/bandes/${bandeId}/bilan/`).then((r) => r.data);
export const getComparaisonBandes = (fermeId) => api.get("/bandes/comparaison/", { params: { ferme: fermeId } }).then((r) => r.data);
export const getEvenementsSante = (params) => api.get("/evenements-sante/", { params }).then((r) => r.data);
export const creerEvenementSante = (payload) => api.post("/evenements-sante/", payload).then((r) => r.data);
export const modifierEvenementSante = (id, payload) => api.patch(`/evenements-sante/${id}/`, payload).then((r) => r.data);
export const supprimerEvenementSante = (id) => api.delete(`/evenements-sante/${id}/`);
export const marquerFaitEvenementSante = (id, payload) => api.post(`/evenements-sante/${id}/marquer-fait/`, payload || {}).then((r) => r.data);
export const soumettrePointJournalier = (fermeId, payload) =>
  api.post(`/fermes/${fermeId}/points-journaliers/`, payload).then((r) => r.data);
export const getPointJournalier = (fermeId, date) =>
  api.get(`/fermes/${fermeId}/points-journaliers/`, { params: { date } }).then((r) => r.data);
export const corrigerPointJournalier = (id, payload) =>
  api.patch(`/points-journaliers/${id}/`, payload).then((r) => r.data);
export const getPointsJournaliers = (params) => api.get("/points-journaliers/", { params }).then((r) => r.data);
export const deletePointJournalier = (id) => api.delete(`/points-journaliers/${id}/`);
export const getEmployesFerme = (fermeId) => api.get("/employes-ferme/", { params: { ferme: fermeId } }).then((r) => r.data);
export const getCloturesMensuelles = (params) => api.get("/clotures-mensuelles/", { params }).then((r) => r.data);
export const cloturerMois = (fermeId, payload) => api.post(`/fermes/${fermeId}/cloturer-mois/`, payload).then((r) => r.data);
export const rouvrirMois = (fermeId, payload) => api.post(`/fermes/${fermeId}/rouvrir-mois/`, payload).then((r) => r.data);
export const getDashboard = () => api.get("/dashboard/").then((r) => r.data);
export const getVentes = (params) => api.get("/ventes/", { params }).then((r) => r.data);
export const getVentesResume = () => api.get("/ventes/resume/").then((r) => r.data);
export const updateSortieOeuf = (id, payload) => api.patch(`/sorties-oeufs/${id}/`, payload).then((r) => r.data);
export const deleteSortieOeuf = (id) => api.delete(`/sorties-oeufs/${id}/`);
export const getClients = () => api.get("/clients/").then((r) => r.data);
export const getHistoriquePrixClient = (clientId) => api.get(`/clients/${clientId}/historique-prix/`).then((r) => r.data);
export const getFactures = () => api.get("/factures/").then((r) => r.data);
export const getFacturesCreances = () => api.get("/factures/creances/").then((r) => r.data);
export const creerFacture = (payload) => api.post("/factures/", payload).then((r) => r.data);
export const encaisserVersement = (factureId, payload) =>
  api.post(`/factures/${factureId}/encaisser/`, payload).then((r) => r.data);
export const getFournisseurs = () => api.get("/fournisseurs/").then((r) => r.data);
export const getCommandesAliment = (params) => api.get("/commandes-aliment/", { params }).then((r) => r.data);
export const creerCommandeAliment = (payload) => api.post("/commandes-aliment/", payload).then((r) => r.data);
export const supprimerCommandeAliment = (id) => api.delete(`/commandes-aliment/${id}/`);

// --- Transferts de stock entre fermes (aliment, alvéoles, œufs) ---
export const getTransfertsStock = (params) => api.get("/transferts-stock/", { params }).then((r) => r.data);
export const creerTransfertStock = (payload) => api.post("/transferts-stock/", payload).then((r) => r.data);
export const modifierTransfertStock = (id, payload) => api.patch(`/transferts-stock/${id}/`, payload).then((r) => r.data);
export const supprimerTransfertStock = (id) => api.delete(`/transferts-stock/${id}/`);

// --- Transferts d'équipement entre fermes (mangeoires, abreuvoirs) ---
export const getTransfertsEquipement = (params) => api.get("/transferts-equipement/", { params }).then((r) => r.data);
export const creerTransfertEquipement = (payload) => api.post("/transferts-equipement/", payload).then((r) => r.data);
export const modifierTransfertEquipement = (id, payload) => api.patch(`/transferts-equipement/${id}/`, payload).then((r) => r.data);
export const supprimerTransfertEquipement = (id) => api.delete(`/transferts-equipement/${id}/`);

// --- Stock de matériel par état (bon état/gâté/réserve/jeté), par ferme ---
export const getInventaireEquipement = (params) => api.get("/inventaire-equipement/", { params }).then((r) => r.data);
export const modifierInventaireEquipement = (id, payload) => api.patch(`/inventaire-equipement/${id}/`, payload).then((r) => r.data);

// --- Réceptions de matériel neuf (achat, don...) par ferme ---
export const getReceptionsEquipement = (params) => api.get("/receptions-equipement/", { params }).then((r) => r.data);
export const creerReceptionEquipement = (payload) => api.post("/receptions-equipement/", payload).then((r) => r.data);
export const modifierReceptionEquipement = (id, payload) => api.patch(`/receptions-equipement/${id}/`, payload).then((r) => r.data);
export const supprimerReceptionEquipement = (id) => api.delete(`/receptions-equipement/${id}/`);

// --- Mouvements entre états du stock de matériel (bon état/gâté/réserve/jeté) ---
export const getMouvementsEquipement = (params) => api.get("/mouvements-equipement/", { params }).then((r) => r.data);
export const creerMouvementEquipement = (payload) => api.post("/mouvements-equipement/", payload).then((r) => r.data);
export const modifierMouvementEquipement = (id, payload) => api.patch(`/mouvements-equipement/${id}/`, payload).then((r) => r.data);
export const supprimerMouvementEquipement = (id) => api.delete(`/mouvements-equipement/${id}/`);

// --- Pointage des employés (heures de travail) ---
export const getEmployes = (params) => api.get("/pointage/employes/", { params }).then((r) => r.data);
export const getUtilisateursDisponibles = () => api.get("/pointage/utilisateurs-disponibles/").then((r) => r.data);
export const creerEmploye = (payload) => api.post("/pointage/employes/", payload).then((r) => r.data);
export const modifierEmploye = (id, payload) => api.patch(`/pointage/employes/${id}/`, payload).then((r) => r.data);
export const supprimerEmploye = (id) => api.delete(`/pointage/employes/${id}/`);
export const getDocumentsEmploye = (employeId) => api.get("/pointage/documents-employe/", { params: { employe: employeId } }).then((r) => r.data);
export const uploaderDocumentEmploye = (formData) => api.post("/pointage/documents-employe/", formData).then((r) => r.data);
export const supprimerDocumentEmploye = (id) => api.delete(`/pointage/documents-employe/${id}/`);
// Le endpoint QR exige une authentification par token — un <img src=...>
// classique n'enverrait pas l'en-tête Authorization, d'où le passage par
// un blob récupéré via axios puis converti en URL locale.
export const getQrEmployeBlob = (id) =>
  api.get(`/pointage/employes/${id}/qr/`, { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const regenererQrEmployeBlob = (id) =>
  api.post(`/pointage/employes/${id}/regenerer-qr/`, {}, { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const getPointages = (params) => api.get("/pointage/historique/", { params }).then((r) => r.data);
export const corrigerPointage = (id, payload) => api.patch(`/pointage/historique/${id}/`, payload).then((r) => r.data);
export const supprimerPointage = (id) => api.delete(`/pointage/historique/${id}/`);
export const getAbsences = (params) => api.get("/pointage/absences/", { params }).then((r) => r.data);
export const declarerAbsence = (payload) => api.post("/pointage/absences/", payload).then((r) => r.data);
export const supprimerAbsence = (id) => api.delete(`/pointage/absences/${id}/`);
export const validerAbsence = (id) => api.post(`/pointage/absences/${id}/valider/`).then((r) => r.data);
export const rejeterAbsence = (id) => api.post(`/pointage/absences/${id}/rejeter/`).then((r) => r.data);
export const getQrBadgeAbsenceBlob = () =>
  api.get("/pointage/badge-absence/qr/", { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const getLignesPaie = (params) => api.get("/pointage/lignes-paie/", { params }).then((r) => r.data);
export const getRentabilite = (params) => api.get("/pointage/rentabilite/", { params }).then((r) => r.data);
export const getRapportMensuel = (params) => api.get("/pointage/rapport-mensuel/", { params }).then((r) => r.data);
export const enregistrerLignePaie = (payload) => api.post("/pointage/lignes-paie/", payload).then((r) => r.data);
export const getQrBadgeTemporaireBlob = () =>
  api.get("/pointage/badge-temporaire/qr/", { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
// Téléphone unique autorisé à valider les pointages (cf. conversation du
// 28/07/2026 avec Serge) — QR d'activation à faire scanner par ce
// téléphone, et régénération (invalide l'ancien) en cas de perte/vol.
export const getQrAppareilPointageBlob = () =>
  api.get("/pointage/appareil/qr/", { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const regenererAppareilPointageBlob = () =>
  api.post("/pointage/appareil/regenerer/", {}, { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const getStatutAppareilPointage = () => api.get("/pointage/appareil/statut/").then((r) => r.data);
export const desactiverAppareilPointage = () => api.post("/pointage/appareil/desactiver/").then((r) => r.data);

const CLE_APPAREIL_TOKEN = "vde_appareil_pointage_token";
export const getAppareilPointageToken = () => localStorage.getItem(CLE_APPAREIL_TOKEN);
export const setAppareilPointageToken = (token) => localStorage.setItem(CLE_APPAREIL_TOKEN, token);
export const verifierAppareilPointage = (token) =>
  axios.get(`${API_BASE_URL}/pointage/appareil/${token}/verifier/`).then((r) => r.data);

// Écran de scan public — pas de token d'authentification, le token du QR
// (dans l'URL) fait office d'identifiant. X-Appareil-Token identifie en
// plus le téléphone lui-même (une fois activé) — voir _appareil_autorise
// côté serveur : sans ce jeton, un autre téléphone qui aurait le QR d'un
// employé (photographié/partagé) ne peut pas valider de pointage.
const scanApi = axios.create({ baseURL: API_BASE_URL });
scanApi.interceptors.request.use((config) => {
  const token = getAppareilPointageToken();
  if (token) config.headers["X-Appareil-Token"] = token;
  return config;
});
export const getInfosPointageScan = (token) => scanApi.get(`/pointage/scan/${token}/`).then((r) => r.data);
// Le selfie (obligatoire, cf. conversation du 28/07/2026 — un seul
// téléphone partagé scanne le badge de chaque employé, plus celui d'un
// superviseur qui reconnaît chacun) est envoyé en multipart.
export const validerPointageScan = (token, photo) => {
  const donnees = new FormData();
  // Un Blob recompressé (cf. utils/image.js) n'a pas de nom de fichier —
  // on lui en donne un explicitement pour que l'upload multipart reste
  // cohérent quel que soit le navigateur.
  donnees.append("photo", photo, photo.name || "selfie.jpg");
  return scanApi.post(`/pointage/scan/${token}/valider/`, donnees).then((r) => r.data);
};

// Badge temporaire (secours) — public lui aussi, pas de compte employé.
export const getEmployesBadgeTemporaire = (token, params) =>
  scanApi.get(`/pointage/badge-temporaire/${token}/employes/`, { params }).then((r) => r.data);
export const validerBadgeTemporaire = (token, employeId, photo) => {
  const donnees = new FormData();
  donnees.append("photo", photo, photo.name || "selfie.jpg");
  return scanApi.post(`/pointage/badge-temporaire/${token}/employes/${employeId}/valider/`, donnees).then((r) => r.data);
};

// Badge absence (signalement par un superviseur) — public, pas de compte.
export const getEmployesBadgeAbsence = (token, params) =>
  scanApi.get(`/pointage/badge-absence/${token}/employes/`, { params }).then((r) => r.data);
export const declarerBadgeAbsence = (token, payload) =>
  scanApi.post(`/pointage/badge-absence/${token}/declarer/`, payload).then((r) => r.data);
