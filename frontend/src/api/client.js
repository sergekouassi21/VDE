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
