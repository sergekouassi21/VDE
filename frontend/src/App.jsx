import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { LayoutDashboard, ClipboardList, LogOut, ShoppingBasket, Shield, Menu, X, History, Users, Clock, TrendingUp, Wheat, Syringe, Search, ScrollText, Lock, Phone, ArrowRightLeft, Wrench, RefreshCw, MoreHorizontal } from "lucide-react";
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
import { isAuthenticated, logout, ADMIN_URL, getRechercheGlobale, getDashboard, getEvenementsSante, getAbsences, getEmployes, getFactures, getPointages } from "./api/client";
import { GREEN_DARK } from "./theme";
import { calculerAlertes, signatureAlertes, joursDepuis, JOURS_CREANCE_RETARD, estPointageOublie } from "./alertes";
import { estDirectionOuAdmin, estTechnicien } from "./utils/auth";

function RequireAuth({ children }) {
  if (!isAuthenticated()) return <Navigate to="/connexion" replace />;
  return children;
}

// Ventes, paie, rentabilite... reserves a Direction/Admin — chef, sous-chef
// et superviseur n'y ont pas acces, meme en tapant l'URL directement.
// Utilise comme route parente : rend ses routes filles via <Outlet />.
function RequireDirectionOuAdmin() {
  if (!estDirectionOuAdmin()) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Chaque type d'utilisateur arrive sur son propre écran après connexion —
// basé sur le rôle mis en cache localement, donc ça fonctionne aussi bien
// hors-ligne qu'en ligne (pas d'appel réseau nécessaire).
function AccueilSelonRole() {
  const role = localStorage.getItem("vde_role");
  const versPointJournalier = role === "CHEF_FERME" || role === "SOUS_CHEF_FERME";
  if (role === "TECHNICIEN") return <Navigate to="/vaccinations" replace />;
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

  const description = [nom, roleAffiche, telephone].filter(Boolean).join(" — ");

  return (
    <div className="profil-inline" title={description}>
      {photo
        ? <img src={photo} alt="" className="profil-avatar" />
        : <span className="profil-avatar-vide">{initiales(nom)}</span>}
      <span className="profil-textes">
        <span className="profil-nom">{nom}</span>
        <span className="profil-meta">
          {roleAffiche}
          {telephone && <span className="profil-telephone"><Phone size={11} /> {telephone}</span>}
        </span>
      </span>
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
        const depuisPointages = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
        const [dashboard, evenementsSante, absences, employes, factures, pointages] = await Promise.all([
          getDashboard(),
          getEvenementsSante({ non_faits: "true" }),
          autoriseRole ? getAbsences({ statut: "EN_ATTENTE" }) : Promise.resolve([]),
          autoriseRole ? getEmployes() : Promise.resolve([]),
          autoriseRole ? getFactures() : Promise.resolve([]),
          autoriseRole ? getPointages({ date_debut: depuisPointages }) : Promise.resolve([]),
        ]);
        if (annule) return;
        const alertes = calculerAlertes({
          fermes: dashboard.fermes,
          absencesEnAttente: absences,
          employesSansSalaire: employes.filter((e) => e.actif && Number(e.salaire_mensuel) === 0),
          evenementsSanteEnRetard: evenementsSante.filter((e) => e.statut === "EN_RETARD"),
          creancesEnRetard: factures.filter((f) => Number(f.reste_du) > 0 && joursDepuis(f.date) > JOURS_CREANCE_RETARD),
          pointagesOublies: pointages.filter(estPointageOublie),
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
  // Technicien/vétérinaire : accès restreint à Tableau de bord, Historique
  // (lecture seule) et Vaccins & traitements — Point Journalier, Transferts
  // et Stock matériel restent masqués (le backend refuse déjà tout le
  // reste, ceci évite juste d'afficher des liens qui mèneraient à des
  // pages vides/403). Cf. conversations du 05/08/2026 avec Serge.
  const technicien = estTechnicien();
  const [ouvert, setOuvert] = useState(false);
  const badgeAlertes = useBadgeAlertes();

  useEffect(() => { setOuvert(false); }, [location.pathname]);

  // Barre d'onglets basse (mobile uniquement, cf. .bottom-tab-bar dans
  // index.css) — 3-4 pages les plus utilisées par rôle, accessibles au
  // pouce sans ouvrir le menu hamburger ; tout le reste passe par le
  // bouton "Plus", qui réutilise le même panneau/état que le hamburger.
  // Composition confirmée avec Serge le 05/08/2026 ("qu'est-ce que tu
  // aurais voulu pour une meilleure navigation").
  const barreOnglets = technicien
    ? [
        { to: "/tableau-de-bord", icon: LayoutDashboard, label: "Bord" },
        { to: "/historique", icon: History, label: "Historique" },
        { to: "/vaccinations", icon: Syringe, label: "Vaccins" },
      ]
    : autorise
    ? [
        { to: "/tableau-de-bord", icon: LayoutDashboard, label: "Bord" },
        { to: "/ventes", icon: ShoppingBasket, label: "Ventes" },
        { to: "/rentabilite", icon: TrendingUp, label: "Rentabilité" },
        { to: "/employes", icon: Users, label: "Employés" },
        { plus: true },
      ]
    : [
        { to: "/point-journalier", icon: ClipboardList, label: "Point J." },
        { to: "/tableau-de-bord", icon: LayoutDashboard, label: "Bord" },
        { to: "/historique", icon: History, label: "Historique" },
        { to: "/vaccinations", icon: Syringe, label: "Vaccins" },
        { plus: true },
      ];

  return (
    <nav className="nav-bar" style={navStyles.nav}>
      <div className="nav-top">
        <img src="/logo.png" alt="Volailles de l'Est" style={navStyles.brand} />
        <GlobalSearch />
      </div>
      <ProfilMenu />
      {/* Sorti de .nav-top pour pouvoir le placer APRÈS la carte de profil
          dans la rangée du haut sur mobile (cf. index.css). */}
      <button className="nav-hamburger" style={navStyles.hamburger} onClick={() => setOuvert((o) => !o)} aria-label="Menu">
        {ouvert ? <X size={22} /> : <Menu size={22} />}
      </button>
      <div className={`nav-links${ouvert ? " open" : ""}`}>
        <Link to="/tableau-de-bord" style={navStyles.link}>
          <LayoutDashboard size={16} /> Tableau de bord
          {badgeAlertes > 0 && <span style={navStyles.badge}>{badgeAlertes}</span>}
        </Link>
        {!technicien && (
          <Link to="/point-journalier" style={navStyles.link}><ClipboardList size={16} /> Point Journalier</Link>
        )}
        <Link to="/historique" style={navStyles.link}><History size={16} /> Historique</Link>
        <Link to="/vaccinations" style={navStyles.link}><Syringe size={16} /> Vaccins & traitements</Link>
        {!technicien && (
          <>
            <Link to="/transferts" style={navStyles.link}><ArrowRightLeft size={16} /> Transferts</Link>
            <Link to="/materiel" style={navStyles.link}><Wrench size={16} /> Stock matériel</Link>
          </>
        )}
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
      <div className="bottom-tab-bar">
        {barreOnglets.map((item) => {
          if (item.plus) {
            return (
              <button key="plus" className={`bottom-tab-item${ouvert ? " active" : ""}`} onClick={() => setOuvert((o) => !o)}>
                <MoreHorizontal size={20} />
                <span>Plus</span>
              </button>
            );
          }
          const Icone = item.icon;
          const actif = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to} className={`bottom-tab-item${actif ? " active" : ""}`}>
              <span style={{ position: "relative" }}>
                <Icone size={20} />
                {item.to === "/tableau-de-bord" && badgeAlertes > 0 && <span className="bottom-tab-badge">{badgeAlertes}</span>}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Route parente de toutes les pages authentifiées. Monté une seule fois pour
// toute la session : c'est ce qui empêche la NavBar — et donc les 6 requêtes
// de useBadgeAlertes — de se relancer à chaque changement de page.
//
// Auparavant, chaque route portait son propre <Layout>. React Router ne pose
// pas de `key` sur les routes rendues, donc React réconcilie par type et
// position : tant que deux routes avaient la MÊME forme d'emballage, le
// Layout était réutilisé, mais dès qu'on passait d'une route simple à une
// route protégée par RequireDirectionOuAdmin (typiquement Tableau de bord ->
// Ventes, deux onglets voisins de la barre du bas), les types ne
// correspondaient plus, tout le sous-arbre était démonté et les 6 requêtes
// repartaient. Cf. analyse du 05/08/2026.
//
// Le <Suspense> est ici, autour de l'Outlet, et non au-dessus : la barre de
// navigation et la carte de profil restent affichées pendant qu'une page
// chargée à la demande arrive, au lieu que tout l'écran soit remplacé par
// « Chargement... ».
function Layout() {
  return (
    <>
      <NavBar />
      <div className="page-content-mobile-pad" style={{ paddingTop: NAV_HEIGHT }}>
        <Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}>
          <Outlet />
        </Suspense>
      </div>
    </>
  );
}

const navStyles = {
  nav: { background: GREEN_DARK, color: "#fff", fontFamily: "inherit", fontSize: 14 },
  hamburger: { background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 },
  brand: { height: 36, width: 36, borderRadius: 8, objectFit: "cover" },
  link: { color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, opacity: .9 },
  logout: { marginLeft: "auto", background: "none", border: "none", color: "#fff", opacity: .8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 14 },
  badge: {
    background: "#E05A3C", color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1,
    borderRadius: 999, padding: "2px 6px", minWidth: 15, textAlign: "center",
  },
};

const searchStyles = {
  wrap: { position: "relative", marginLeft: 4 },
  btn: { background: "rgba(255,255,255,.14)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: 7, display: "flex" },
  panel: {
    position: "fixed", top: NAV_HEIGHT + 8, left: 12, right: 12, maxWidth: 420, margin: "0 auto",
    background: "#fff", borderRadius: 14, boxShadow: "0 16px 44px rgba(0,0,0,.28)", padding: 10, zIndex: 200,
    maxHeight: "70vh", overflowY: "auto", fontFamily: "inherit",
  },
  input: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDE2DE", fontSize: 14, fontFamily: "inherit", color: "#1A2420", boxSizing: "border-box" },
  info: { textAlign: "center", fontSize: 12.5, color: "#8A948D", margin: "12px 0 4px" },
  resultats: { marginTop: 8, display: "flex", flexDirection: "column", gap: 10 },
  group: { display: "flex", flexDirection: "column", gap: 2 },
  groupTitre: { fontSize: 12, fontWeight: 700, color: "#8A948D", textTransform: "uppercase", letterSpacing: .5, padding: "2px 8px" },
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%",
    background: "none", border: "none", borderRadius: 8, padding: "8px 8px", cursor: "pointer",
    fontSize: 14, color: "#1A2420", fontFamily: "inherit", textAlign: "left",
  },
  meta: { fontSize: 12, color: "#7A857F", whiteSpace: "nowrap" },
};

const INTERVALLE_VERIF_MAJ_MS = 30 * 60 * 1000;

// Une PWA ouverte en continu sur le terrain ne revérifie une mise à jour
// qu'au prochain enregistrement du service worker (donc seulement si
// l'app est complètement fermée puis rouverte) — sans ce sondage
// périodique, un déploiement pouvait rester invisible pendant des jours
// pour quelqu'un qui ne ferme jamais l'app (cf. incident de connexion de
// Jeannot, conversation du 05/08/2026 avec Serge : son téléphone gardait
// une version obsolète du code de connexion en cache). Pas de rechargement
// automatique et silencieux (registerType 'prompt', pas 'autoUpdate') :
// ça pourrait couper une saisie hors-ligne en cours — c'est l'utilisateur
// qui choisit le moment via ce bandeau.
function MiseAJourDisponible() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => { registration.update(); }, INTERVALLE_VERIF_MAJ_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-banner" style={majStyles.bandeau}>
      <span>Une nouvelle version de l'application est disponible.</span>
      <button style={majStyles.bouton} onClick={() => updateServiceWorker(true)}>
        <RefreshCw size={13} /> Mettre à jour
      </button>
    </div>
  );
}

const majStyles = {
  bandeau: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap",
    background: GREEN_DARK, color: "#fff", fontFamily: "inherit", fontSize: 14,
    padding: "10px 16px",
  },
  bouton: {
    display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK,
    border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600,
    fontFamily: "inherit", cursor: "pointer",
  },
};

export default function App() {
  return (
    <BrowserRouter>
      <MiseAJourDisponible />
      <Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}>
      <Routes>
        {/* Écrans publics — pas de session, pas de barre de navigation. */}
        <Route path="/connexion" element={<Login />} />
        <Route path="/pointage/:token" element={<PointageScan />} />
        <Route path="/pointage/temporaire/:token" element={<PointageBadgeTemporaire />} />
        <Route path="/pointage/absence/:token" element={<PointageBadgeAbsence />} />
        <Route path="/pointage/appareil/:token" element={<PointageActiverAppareil />} />

        {/* Simple redirection vers l'accueil du rôle : inutile d'afficher la
            barre de navigation pour ça, donc hors du Layout. */}
        <Route path="/" element={<RequireAuth><AccueilSelonRole /></RequireAuth>} />

        {/* Toutes les pages authentifiées partagent UN SEUL Layout, monté une
            fois pour la session. */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/point-journalier" element={<PointJournalier />} />
          <Route path="/tableau-de-bord" element={<Dashboard />} />
          <Route path="/historique" element={<Historique />} />
          <Route path="/vaccinations" element={<Vaccinations />} />
          <Route path="/transferts" element={<Transferts />} />
          <Route path="/materiel" element={<StockMateriel />} />

          {/* Réservé à Direction/Admin, y compris en tapant l'URL. */}
          <Route element={<RequireDirectionOuAdmin />}>
            <Route path="/ventes" element={<Ventes />} />
            <Route path="/employes" element={<PointageEmployes />} />
            <Route path="/heures-travaillees" element={<PointageHistorique />} />
            <Route path="/rentabilite" element={<Rentabilite />} />
            <Route path="/achats-aliment" element={<AchatsAliment />} />
            <Route path="/journal-audit" element={<JournalAudit />} />
            <Route path="/securite" element={<Securite />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
