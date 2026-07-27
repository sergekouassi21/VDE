import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardList, LogOut, ShoppingBasket, Shield, Menu, X, History, Users, Clock, TrendingUp, Wheat, Syringe, Search, ScrollText } from "lucide-react";
import Login from "./pages/Login";
import PointJournalier from "./pages/PointJournalier";
import Dashboard from "./pages/Dashboard";
import Ventes from "./pages/Ventes";
import Historique from "./pages/Historique";
import PointageScan from "./pages/PointageScan";
import PointageBadgeTemporaire from "./pages/PointageBadgeTemporaire";
import PointageBadgeAbsence from "./pages/PointageBadgeAbsence";
import PointageEmployes from "./pages/PointageEmployes";
import PointageHistorique from "./pages/PointageHistorique";
import Rentabilite from "./pages/Rentabilite";
import AchatsAliment from "./pages/AchatsAliment";
import Vaccinations from "./pages/Vaccinations";
import JournalAudit from "./pages/JournalAudit";
import { isAuthenticated, logout, ADMIN_URL, getRechercheGlobale } from "./api/client";
import { GREEN_DARK } from "./theme";

function RequireAuth({ children }) {
  if (!isAuthenticated()) return <Navigate to="/connexion" replace />;
  return children;
}

function estDirectionOuAdmin() {
  const role = localStorage.getItem("vde_role");
  return !role || role === "DIRECTION" || role === "ADMIN";
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

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const autorise = estDirectionOuAdmin();
  const [ouvert, setOuvert] = useState(false);

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
      <div className={`nav-links${ouvert ? " open" : ""}`}>
        <Link to="/tableau-de-bord" style={navStyles.link}><LayoutDashboard size={16} /> Tableau de bord</Link>
        <Link to="/point-journalier" style={navStyles.link}><ClipboardList size={16} /> Point Journalier</Link>
        <Link to="/historique" style={navStyles.link}><History size={16} /> Historique</Link>
        <Link to="/vaccinations" style={navStyles.link}><Syringe size={16} /> Vaccins & traitements</Link>
        {autorise && (
          <>
            <Link to="/ventes" style={navStyles.link}><ShoppingBasket size={16} /> Ventes</Link>
            <Link to="/employes" style={navStyles.link}><Users size={16} /> Employés</Link>
            <Link to="/heures-travaillees" style={navStyles.link}><Clock size={16} /> Heures travaillées</Link>
            <Link to="/rentabilite" style={navStyles.link}><TrendingUp size={16} /> Rentabilité</Link>
            <Link to="/achats-aliment" style={navStyles.link}><Wheat size={16} /> Achats d'aliment</Link>
            <Link to="/journal-audit" style={navStyles.link}><ScrollText size={16} /> Journal d'audit</Link>
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
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route path="/pointage/:token" element={<PointageScan />} />
        <Route path="/pointage/temporaire/:token" element={<PointageBadgeTemporaire />} />
        <Route path="/pointage/absence/:token" element={<PointageBadgeAbsence />} />
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
      </Routes>
    </BrowserRouter>
  );
}
