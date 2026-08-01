import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardList, LogOut, ShoppingBasket, Shield, Menu, X, History, Users, Clock, TrendingUp, Wheat, Syringe, Search, ScrollText, Lock, Phone, ArrowRightLeft, Wrench } from "lucide-react";
// Chargées à la demande (par route) plutôt qu'au premier accès : sans ça, un
// chef de ferme qui n'ouvre que Point Journalier téléchargeait aussi
// Recharts (Dashboard), jsPDF (plusieurs pages) et tout le reste — pénalisant
// sur le réseau faible d'une zone rurale, justement le contexte visé par le
// mode hors-ligne de cette appli (cf. audit du 30/07/2026).
const Login = lazy(() => import("./pages/Login"));
const PointJournalier = lazy(() => import("./pages/PointJournalier"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Ventes = lazy(() => import("./pages/Ventes"));
const Historique = lazy(() => import("./pages/Historique"));
const PointageScan = lazy(() => import("./pages/PointageScan"));
const PointageBadgeTemporaire = lazy(() => import("./pages/PointageBadgeTemporaire"));
const PointageBadgeAbsence = lazy(() => import("./pages/PointageBadgeAbsence"));
const PointageActiverAppareil = lazy(() => import("./pages/PointageActiverAppareil"));
const PointageEmployes = lazy(() => import("./pages/PointageEmployes"));
const PointageHistorique = lazy(() => import("./pages/PointageHistorique"));
const Rentabilite = lazy(() => import("./pages/Rentabilite"));
const AchatsAliment = lazy(() => import("./pages/AchatsAliment"));
const Transferts = lazy(() => import("./pages/Transferts"));
const StockMateriel = lazy(() => import("./pages/StockMateriel"));
const Vaccinations = lazy(() => import("./pages/Vaccinations"));
const JournalAudit = lazy(() => import("./pages/JournalAudit"));
const Securite = lazy(() => import("./pages/Securite"));
import { isAuthenticated, logout, ADMIN_URL, getRechercheGlobale, getDashboard, getEvenementsSante, getAbsences, getEmployes, getFactures } from "./api/client";
import { GREEN_DARK } from "./theme";
import { calculerAlertes, signatureAlertes, joursDepuis, JOURS_CREANCE_RETARD } from "./alertes";
import { estDirectionOuAdmin } from "./utils/auth";

function RequireAuth({ children }) {
  if (!isAuthenticated()) return <Navigate to="/connexion" replace />;
  return children;
}

// Ventes reserve a Direction/Admin — chef, sous-chef et superviseur n'y ont
// pas acces, meme en tapant l'URL directement.
function RequireDirectionOuAdmin({ children }) {
  if (!estDirectionOuAdmin()) return <Navigate to="/" replace />;
  return children;
}

// Chaque type d'utilisateur arrive sur son propre écran après connexion —
// basé sur le rôle mis en cache localement, donc ça fonctionne aussi bien
// hors-ligne qu'en ligne (pas d'appel réseau nécessaire).
function AccueilSelonRole() {
  const role = localStorage.getItem("vde_role");
  const versPointJournalier = role === "CHEF_FERME" || role === "SOUS_CHEF_FERME";
  return <Navigate to={versPointJournalier ? "/point-journalier" : "/tableau-de-bord"} replace />;
}

const NAV_HEIGHT = 52;
const separeMilliers = (v) => Math.round(Number(v) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function GlobalSearch() {
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState(null);
  const [chargement, setChargement] = useState(false);
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    function surClicExterieur(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOuvert(false);
    }
    document.addEventListener("mousedown", surClicExterieur);
    return () => document.removeEventListener("mousedown", surClicExterieur);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResultats(null); setChargement(false); return; }
    setChargement(true);
    timerRef.current = setTimeout(() => {
      getRechercheGlobale(q.trim()).then((data) => { setResultats(data); setChargement(false); });
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [q]);

  function aller(chemin) {
    setOuvert(false);
    setQ("");
    setResultats(null);
    navigate(chemin);
  }

  const aucunResultat = resultats && Object.values(resultats).every((liste) => liste.length === 0);

  return (
    <div ref={wrapRef} style={searchStyles.wrap}>
      <button style={searchStyles.btn} onClick={() => setOuvert((o) => !o)} aria-label="Recherche globale">
        <Search size={18} />
      </button>
      {ouvert && (
        <div style={searchStyles.panel}>
          <input
            autoFocus type="text" style={searchStyles.input}
            placeholder="Rechercher une ferme, un client, une facture, un fournisseur..."
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          {chargement && <p style={searchStyles.info}>Recherche...</p>}
          {!chargement && resultats && aucunResultat && <p style={searchStyles.info}>Aucun résultat.</p>}
          {!chargement && resultats && !aucunResultat && (
            <div style={searchStyles.resultats}>
              {resultats.fermes.length > 0 && (
                <ResultGroup titre="Fermes">
                  {resultats.fermes.map((f) => (
                    <ResultRow key={f.id} onClick={() => aller(`/point-journalier?ferme=${f.id}`)}>
                      <span>{f.nom}</span>
                      <span style={searchStyles.meta}>{f.type === "PONTE" ? "Pondeuses" : "Chair"}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {resultats.clients.length > 0 && (
                <ResultGroup titre="Clients">
                  {resultats.clients.map((c) => (
                    <ResultRow key={c.id} onClick={() => aller("/ventes")}>
                      <span>{c.nom}</span>
                      <span style={searchStyles.meta}>
                        {Number(c.creance_totale) > 0 ? `Doit ${separeMilliers(c.creance_totale)} F` : c.telephone || ""}
                      </span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {resultats.factures.length > 0 && (
                <ResultGroup titre="Factures">
                  {resultats.factures.map((f) => (
                    <ResultRow key={f.id} onClick={() => aller("/ventes")}>
                      <span>N°{String(f.numero).padStart(7, "0")} — {f.client_nom}</span>
                      <span style={searchStyles.meta}>
                        {separeMilliers(f.montant_total)} F{Number(f.reste_du) > 0 ? ` · reste ${separeMilliers(f.reste_du)} F` : ""}
                      </span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {resultats.fournisseurs.length > 0 && (
                <ResultGroup titre="Fournisseurs">
                  {resultats.fournisseurs.map((f) => (
                    <ResultRow key={f.id} onClick={() => aller("/achats-aliment")}>
                      <span>{f.nom}</span>
                      <span style={searchStyles.meta}>{f.telephone}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {resultats.employes.length > 0 && (
                <ResultGroup titre="Employés">
                  {resultats.employes.map((e) => (
                    <ResultRow key={e.id} onClick={() => aller("/employes")}>
                      <span>{e.nom}</span>
                      <span style={searchStyles.meta}>{e.fermes_noms}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function initiales(nomComplet) {
  const mots = (nomComplet || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  return (mots[0][0] + (mots[1]?.[0] || "")).toUpperCase();
}

// Profil de l'utilisateur connecté, visible sur chaque page (rendu dans
// NavBar, partagée par tout l'appli via Layout) — lu depuis les infos
// stockées à la connexion (Login.jsx), pas un nouvel appel réseau à chaque
// page, pour rester disponible même hors-ligne (cf. conversation du
// 30/07/2026 avec Serge : "on ne voit aucune info" sur qui est connecté).
// Carte toujours affichée (pas un menu à ouvrir) — Serge veut voir qui est
// connecté d'un coup d'œil sur chaque page, sans avoir à cliquer (cf.
// conversation du 30/07/2026).
function ProfilMenu() {
  const nom = localStorage.getItem("vde_nom") || "";
  const roleAffiche = localStorage.getItem("vde_role_display") || "";
  const telephone = localStorage.getItem("vde_telephone") || "";
  const photo = localStorage.getItem("vde_photo") || "";

  if (!nom) return null;

  return (
    <div className="profil-menu profil-panel">
      {photo ? <img src={photo} alt="" className="profil-avatar" /> : <span className="profil-avatar-vide">{initiales(nom)}</span>}
      <p className="profil-nom">{nom}</p>
      {roleAffiche && <span className="profil-role">{roleAffiche}</span>}
      {telephone && <p className="profil-telephone"><Phone size={13} /> {telephone}</p>}
    </div>
  );
}

function ResultGroup({ titre, children }) {
  return (
    <div style={searchStyles.group}>
      <div style={searchStyles.groupTitre}>{titre}</div>
      {children}
    </div>
  );
}

function ResultRow({ children, onClick }) {
  return <button style={searchStyles.row} onClick={onClick}>{children}</button>;
}

const REFRESH_ALERTES_MS = 5 * 60 * 1000;

// Badge de notification sur "Tableau de bord" — recalcule les mêmes
// alertes que Dashboard.jsx (calculerAlertes) indépendamment, pour pouvoir
// l'afficher depuis n'importe quelle page. Se vide en visitant le
// Dashboard (qui écrit sa propre signature dans localStorage) et revient
// si de nouvelles alertes apparaissent ensuite — cf. conversation du
// 27/07/2026 (point 14 du backlog).
function useBadgeAlertes() {
  const location = useLocation();
  const [signatureActuelle, setSignatureActuelle] = useState("");
  const [nbAlertes, setNbAlertes] = useState(0);
  const [signatureVue, setSignatureVue] = useState(() => localStorage.getItem("vde_alertes_vues") || "");

  useEffect(() => {
    let annule = false;
    async function charger() {
      const autoriseRole = estDirectionOuAdmin();
      try {
        const [dashboard, evenementsSante, absences, employes, factures] = await Promise.all([
          getDashboard(),
          getEvenementsSante({ non_faits: "true" }),
          autoriseRole ? getAbsences({ statut: "EN_ATTENTE" }) : Promise.resolve([]),
          autoriseRole ? getEmployes() : Promise.resolve([]),
          autoriseRole ? getFactures() : Promise.resolve([]),
        ]);
        if (annule) return;
        const alertes = calculerAlertes({
          fermes: dashboard.fermes,
          absencesEnAttente: absences,
          employesSansSalaire: employes.filter((e) => e.actif && Number(e.salaire_mensuel) === 0),
          evenementsSanteEnRetard: evenementsSante.filter((e) => e.statut === "EN_RETARD"),
          creancesEnRetard: factures.filter((f) => Number(f.reste_du) > 0 && joursDepuis(f.date) > JOURS_CREANCE_RETARD),
        });
        setSignatureActuelle(signatureAlertes(alertes));
        setNbAlertes(alertes.length);
      } catch {
        // Le badge reste simplement inchangé si la requête échoue.
      }
    }
    charger();
    const interval = setInterval(charger, REFRESH_ALERTES_MS);
    return () => { annule = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    setSignatureVue(localStorage.getItem("vde_alertes_vues") || "");
  }, [location.pathname]);

  const surDashboard = location.pathname === "/tableau-de-bord";
  return surDashboard || signatureActuelle === signatureVue ? 0 : nbAlertes;
}

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const autorise = estDirectionOuAdmin();
  const [ouvert, setOuvert] = useState(false);
  const badgeAlertes = useBadgeAlertes();

  useEffect(() => { setOuvert(false); }, [location.pathname]);

  return (
    <nav className="nav-bar" style={navStyles.nav}>
      <div className="nav-top">
        <img src="/logo.png" alt="Volailles de l'Est" style={navStyles.brand} />
        <GlobalSearch />
        <button className="nav-hamburger" style={navStyles.hamburger} onClick={() => setOuvert((o) => !o)} aria-label="Menu">
          {ouvert ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <ProfilMenu />
      <div className={`nav-links${ouvert ? " open" : ""}`}>
        <Link to="/tableau-de-bord" style={navStyles.link}>
          <LayoutDashboard size={16} /> Tableau de bord
          {badgeAlertes > 0 && <span style={navStyles.badge}>{badgeAlertes}</span>}
        </Link>
        <Link to="/point-journalier" style={navStyles.link}><ClipboardList size={16} /> Point Journalier</Link>
        <Link to="/historique" style={navStyles.link}><History size={16} /> Historique</Link>
        <Link to="/vaccinations" style={navStyles.link}><Syringe size={16} /> Vaccins & traitements</Link>
        <Link to="/transferts" style={navStyles.link}><ArrowRightLeft size={16} /> Transferts</Link>
        <Link to="/materiel" style={navStyles.link}><Wrench size={16} /> Stock matériel</Link>
        {autorise && (
          <>
            <Link to="/ventes" style={navStyles.link}><ShoppingBasket size={16} /> Ventes</Link>
            <Link to="/employes" style={navStyles.link}><Users size={16} /> Employés</Link>
            <Link to="/heures-travaillees" style={navStyles.link}><Clock size={16} /> Heures travaillées</Link>
            <Link to="/rentabilite" style={navStyles.link}><TrendingUp size={16} /> Rentabilité</Link>
            <Link to="/achats-aliment" style={navStyles.link}><Wheat size={16} /> Achats d'aliment</Link>
            <Link to="/journal-audit" style={navStyles.link}><ScrollText size={16} /> Journal d'audit</Link>
            <Link to="/securite" style={navStyles.link}><Lock size={16} /> Sécurité</Link>
            <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer" style={navStyles.link}><Shield size={16} /> Admin</a>
          </>
        )}
        <button className="nav-logout" style={navStyles.logout} onClick={() => { logout(); navigate("/connexion"); }}>
          <LogOut size={15} /> Déconnexion
        </button>
      </div>
    </nav>
  );
}

function Layout({ children }) {
  return (
    <>
      <NavBar />
      <div style={{ paddingTop: NAV_HEIGHT }}>{children}</div>
    </>
  );
}

const navStyles = {
  nav: { background: GREEN_DARK, color: "#fff", fontFamily: "'Inter', sans-serif", fontSize: 14 },
  hamburger: { background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 },
  brand: { height: 36, width: 36, borderRadius: 8, objectFit: "cover" },
  link: { color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, opacity: .9 },
  logout: { marginLeft: "auto", background: "none", border: "none", color: "#fff", opacity: .8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 14 },
  badge: {
    background: "#E05A3C", color: "#fff", fontSize: 10.5, fontWeight: 700, lineHeight: 1,
    borderRadius: 999, padding: "2px 6px", minWidth: 15, textAlign: "center",
  },
};

const searchStyles = {
  wrap: { position: "relative", marginLeft: 4 },
  btn: { background: "rgba(255,255,255,.14)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: 7, display: "flex" },
  panel: {
    position: "fixed", top: NAV_HEIGHT + 8, left: 12, right: 12, maxWidth: 420, margin: "0 auto",
    background: "#fff", borderRadius: 14, boxShadow: "0 16px 44px rgba(0,0,0,.28)", padding: 10, zIndex: 200,
    maxHeight: "70vh", overflowY: "auto", fontFamily: "'Inter', sans-serif",
  },
  input: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDE2DE", fontSize: 14, fontFamily: "inherit", color: "#1A2420", boxSizing: "border-box" },
  info: { textAlign: "center", fontSize: 12.5, color: "#8A948D", margin: "12px 0 4px" },
  resultats: { marginTop: 8, display: "flex", flexDirection: "column", gap: 10 },
  group: { display: "flex", flexDirection: "column", gap: 2 },
  groupTitre: { fontSize: 10.5, fontWeight: 700, color: "#8A948D", textTransform: "uppercase", letterSpacing: .5, padding: "2px 8px" },
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%",
    background: "none", border: "none", borderRadius: 8, padding: "8px 8px", cursor: "pointer",
    fontSize: 13.5, color: "#1A2420", fontFamily: "inherit", textAlign: "left",
  },
  meta: { fontSize: 11.5, color: "#7A857F", whiteSpace: "nowrap" },
};

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}>
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route path="/pointage/:token" element={<PointageScan />} />
        <Route path="/pointage/temporaire/:token" element={<PointageBadgeTemporaire />} />
        <Route path="/pointage/absence/:token" element={<PointageBadgeAbsence />} />
        <Route path="/pointage/appareil/:token" element={<PointageActiverAppareil />} />
        <Route path="/" element={
          <RequireAuth><AccueilSelonRole /></RequireAuth>
        } />
        <Route path="/point-journalier" element={
          <RequireAuth><Layout><PointJournalier /></Layout></RequireAuth>
        } />
        <Route path="/tableau-de-bord" element={
          <RequireAuth><Layout><Dashboard /></Layout></RequireAuth>
        } />
        <Route path="/ventes" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><Ventes /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/historique" element={
          <RequireAuth><Layout><Historique /></Layout></RequireAuth>
        } />
        <Route path="/vaccinations" element={
          <RequireAuth><Layout><Vaccinations /></Layout></RequireAuth>
        } />
        <Route path="/transferts" element={
          <RequireAuth><Layout><Transferts /></Layout></RequireAuth>
        } />
        <Route path="/materiel" element={
          <RequireAuth><Layout><StockMateriel /></Layout></RequireAuth>
        } />
        <Route path="/employes" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><PointageEmployes /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/heures-travaillees" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><PointageHistorique /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/rentabilite" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><Rentabilite /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/achats-aliment" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><AchatsAliment /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/journal-audit" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><JournalAudit /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
        <Route path="/securite" element={
          <RequireAuth><RequireDirectionOuAdmin><Layout><Securite /></Layout></RequireDirectionOuAdmin></RequireAuth>
        } />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
