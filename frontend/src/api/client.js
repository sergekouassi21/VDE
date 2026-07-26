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

export async function login(username, password) {
  const { data } = await axios.post(`${API_BASE_URL}/auth/login/`, { username, password });
  localStorage.setItem("vde_token", data.token);
  return data.token;
}

export function logout() {
  localStorage.removeItem("vde_token");
  localStorage.removeItem("vde_role");
  localStorage.removeItem("vde_nom");
  localStorage.removeItem("vde_photo");
}

export function isAuthenticated() {
  return !!localStorage.getItem("vde_token");
}

export const getMoi = () => api.get("/moi/").then((r) => r.data);

export const getFermes = () => api.get("/fermes/").then((r) => r.data);
export const getFerme = (id) => api.get(`/fermes/${id}/`).then((r) => r.data);
export const declarerBande = (id, payload) => api.post(`/fermes/${id}/declarer-bande/`, payload).then((r) => r.data);
export const soumettrePointJournalier = (fermeId, payload) =>
  api.post(`/fermes/${fermeId}/points-journaliers/`, payload).then((r) => r.data);
export const getPointJournalier = (fermeId, date) =>
  api.get(`/fermes/${fermeId}/points-journaliers/`, { params: { date } }).then((r) => r.data);
export const corrigerPointJournalier = (id, payload) =>
  api.patch(`/points-journaliers/${id}/`, payload).then((r) => r.data);
export const getPointsJournaliers = (params) => api.get("/points-journaliers/", { params }).then((r) => r.data);
export const deletePointJournalier = (id) => api.delete(`/points-journaliers/${id}/`);
export const getDashboard = () => api.get("/dashboard/").then((r) => r.data);
export const getVentes = (params) => api.get("/ventes/", { params }).then((r) => r.data);
export const updateSortieOeuf = (id, payload) => api.patch(`/sorties-oeufs/${id}/`, payload).then((r) => r.data);
export const deleteSortieOeuf = (id) => api.delete(`/sorties-oeufs/${id}/`);
export const getClients = () => api.get("/clients/").then((r) => r.data);
export const getFactures = () => api.get("/factures/").then((r) => r.data);
export const creerFacture = (payload) => api.post("/factures/", payload).then((r) => r.data);
export const encaisserVersement = (factureId, payload) =>
  api.post(`/factures/${factureId}/encaisser/`, payload).then((r) => r.data);

// --- Pointage des employés (heures de travail) ---
export const getEmployes = (params) => api.get("/pointage/employes/", { params }).then((r) => r.data);
export const getUtilisateursDisponibles = () => api.get("/pointage/utilisateurs-disponibles/").then((r) => r.data);
export const creerEmploye = (payload) => api.post("/pointage/employes/", payload).then((r) => r.data);
export const modifierEmploye = (id, payload) => api.patch(`/pointage/employes/${id}/`, payload).then((r) => r.data);
export const supprimerEmploye = (id) => api.delete(`/pointage/employes/${id}/`);
// Le endpoint QR exige une authentification par token — un <img src=...>
// classique n'enverrait pas l'en-tête Authorization, d'où le passage par
// un blob récupéré via axios puis converti en URL locale.
export const getQrEmployeBlob = (id) =>
  api.get(`/pointage/employes/${id}/qr/`, { responseType: "blob" }).then((r) => URL.createObjectURL(r.data));
export const getPointages = (params) => api.get("/pointage/historique/", { params }).then((r) => r.data);
export const corrigerPointage = (id, payload) => api.patch(`/pointage/historique/${id}/`, payload).then((r) => r.data);
export const supprimerPointage = (id) => api.delete(`/pointage/historique/${id}/`);
export const getAbsences = (params) => api.get("/pointage/absences/", { params }).then((r) => r.data);
export const declarerAbsence = (payload) => api.post("/pointage/absences/", payload).then((r) => r.data);
export const supprimerAbsence = (id) => api.delete(`/pointage/absences/${id}/`);
export const getLignesPaie = (params) => api.get("/pointage/lignes-paie/", { params }).then((r) => r.data);
export const enregistrerLignePaie = (payload) => api.post("/pointage/lignes-paie/", payload).then((r) => r.data);

// Écran de scan public — pas de token d'authentification, le token du QR
// (dans l'URL) fait office d'identifiant.
const scanApi = axios.create({ baseURL: API_BASE_URL });
export const getInfosPointageScan = (token) => scanApi.get(`/pointage/scan/${token}/`).then((r) => r.data);
export const validerPointageScan = (token) => scanApi.post(`/pointage/scan/${token}/valider/`).then((r) => r.data);
