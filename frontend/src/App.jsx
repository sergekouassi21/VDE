import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardList, LogOut, ShoppingBasket, Shield, Menu, X, History } from "lucide-react";
import Login from "./pages/Login";
import PointJournalier from "./pages/PointJournalier";
import Dashboard from "./pages/Dashboard";
import Ventes from "./pages/Ventes";
import Historique from "./pages/Historique";
import { isAuthenticated, logout, ADMIN_URL } from "./api/client";
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
        <button className="nav-hamburger" style={navStyles.hamburger} onClick={() => setOuvert((o) => !o)} aria-label="Menu">
          {ouvert ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <div className={`nav-links${ouvert ? " open" : ""}`}>
        <Link to="/tableau-de-bord" style={navStyles.link}><LayoutDashboard size={16} /> Tableau de bord</Link>
        <Link to="/point-journalier" style={navStyles.link}><ClipboardList size={16} /> Point Journalier</Link>
        <Link to="/historique" style={navStyles.link}><History size={16} /> Historique</Link>
        {autorise && (
          <>
            <Link to="/ventes" style={navStyles.link}><ShoppingBasket size={16} /> Ventes</Link>
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connexion" element={<Login />} />
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
      </Routes>
    </BrowserRouter>
  );
}
