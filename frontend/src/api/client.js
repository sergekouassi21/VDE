import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8010/api";

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
}

export function isAuthenticated() {
  return !!localStorage.getItem("vde_token");
}

export const getFermes = () => api.get("/fermes/").then((r) => r.data);
export const getFerme = (id) => api.get(`/fermes/${id}/`).then((r) => r.data);
export const declarerBande = (id, payload) => api.post(`/fermes/${id}/declarer-bande/`, payload).then((r) => r.data);
export const soumettrePointJournalier = (fermeId, payload) =>
  api.post(`/fermes/${fermeId}/points-journaliers/`, payload).then((r) => r.data);
export const getPointJournalier = (fermeId, date) =>
  api.get(`/fermes/${fermeId}/points-journaliers/`, { params: { date } }).then((r) => r.data);
export const corrigerPointJournalier = (id, payload) =>
  api.patch(`/points-journaliers/${id}/`, payload).then((r) => r.data);
export const getDashboard = () => api.get("/dashboard/").then((r) => r.data);
export const getVentes = (params) => api.get("/ventes/", { params }).then((r) => r.data);
