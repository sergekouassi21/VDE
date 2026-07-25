import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, ClipboardList, LogOut, ShoppingBasket } from "lucide-react";
import Login from "./pages/Login";
import PointJournalier from "./pages/PointJournalier";
import Dashboard from "./pages/Dashboard";
import Ventes from "./pages/Ventes";
import { isAuthenticated, logout } from "./api/client";
import { GREEN_DARK } from "./theme";

function RequireAuth({ children }) {
  if (!isAuthenticated()) return <Navigate to="/connexion" replace />;
  return children;
}

const NAV_HEIGHT = 52;

function NavBar() {
  const navigate = useNavigate();
  return (
    <nav style={navStyles.nav}>
      <span style={navStyles.brand}>VDE</span>
      <Link to="/tableau-de-bord" style={navStyles.link}><LayoutDashboard size={16} /> Tableau de bord</Link>
      <Link to="/" style={navStyles.link}><ClipboardList size={16} /> Point Journalier</Link>
      <Link to="/ventes" style={navStyles.link}><ShoppingBasket size={16} /> Ventes</Link>
      <button style={navStyles.logout} onClick={() => { logout(); navigate("/connexion"); }}>
        <LogOut size={15} /> Déconnexion
      </button>
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
  nav: { display: "flex", alignItems: "center", gap: 18, height: NAV_HEIGHT, boxSizing: "border-box", padding: "0 20px", background: GREEN_DARK, color: "#fff", fontFamily: "'Inter', sans-serif", fontSize: 14, position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 },
  brand: { fontWeight: 700, letterSpacing: 1, marginRight: 8 },
  link: { color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, opacity: .9 },
  logout: { marginLeft: "auto", background: "none", border: "none", color: "#fff", opacity: .8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 14 },
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route path="/" element={
          <RequireAuth><Layout><PointJournalier /></Layout></RequireAuth>
        } />
        <Route path="/tableau-de-bord" element={
          <RequireAuth><Layout><Dashboard /></Layout></RequireAuth>
        } />
        <Route path="/ventes" element={
          <RequireAuth><Layout><Ventes /></Layout></RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}
