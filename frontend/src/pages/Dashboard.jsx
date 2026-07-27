import { useState, useEffect, useMemo, Fragment } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Egg, TrendingUp, AlertTriangle, Skull, Package, ChevronRight, Activity, Wheat, Droplet } from "lucide-react";
import { getDashboard, getEmployes, getAbsences, getEvenementsSante, getFactures } from "../api/client";
import { GREEN, GREEN_DARK, INK, formatSacs, formatColis, AGE_REFORME_SEMAINES, KG_PAR_SAC } from "../theme";

const nf = (v) => (v ?? 0).toLocaleString("fr-FR");
const JOURS_CREANCE_RETARD = 15; // cf. conversation du 27/07/2026 avec Serge
const joursDepuis = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// Courbe de ponte de référence par âge (race Isa Brown, %), pour comparaison
const COURBE_REF = { 17: 22, 20: 78, 25: 93, 30: 94, 40: 91, 47: 89, 48: 89, 50: 87, 60: 83, 70: 78, 77: 75, 80: 72, 93: 64 };

export default function Dashboard() {
  const [fermes, setFermes] = useState([]);
  const [evolutionMois, setEvolutionMois] = useState([]);
  const [absencesEnAttente, setAbsencesEnAttente] = useState([]);
  const [employesSansSalaire, setEmployesSansSalaire] = useState([]);
  const [evenementsSanteEnRetard, setEvenementsSanteEnRetard] = useState([]);
  const [creancesEnRetard, setCreancesEnRetard] = useState([]);
  const [sel, setSel] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Le pointage/la paie sont confidentiels à Direction/Admin (mêmes règles
  // que partout ailleurs dans l'appli) — le tableau de bord, lui, est
  // ouvert à tous les rôles, donc on ne tente ces appels que si autorisé.
  const role = localStorage.getItem("vde_role");
  const estDirectionOuAdmin = !role || role === "DIRECTION" || role === "ADMIN";

  useEffect(() => {
    getDashboard().then((data) => { setFermes(data.fermes); setEvolutionMois(data.evolution_mois); setChargement(false); });
    getEvenementsSante({ non_faits: "true" }).then((evts) => setEvenementsSanteEnRetard(evts.filter((e) => e.statut === "EN_RETARD")));
    if (estDirectionOuAdmin) {
      getAbsences({ statut: "EN_ATTENTE" }).then(setAbsencesEnAttente);
      getEmployes().then((emps) => setEmployesSansSalaire(emps.filter((e) => e.actif && Number(e.salaire_mensuel) === 0)));
      getFactures().then((factures) => setCreancesEnRetard(
        factures.filter((f) => Number(f.reste_du) > 0 && joursDepuis(f.date) > JOURS_CREANCE_RETARD)
      ));
    }
  }, []);

  const actives = fermes.filter((f) => !f.est_vide);
  const pondeuses = actives.filter((f) => f.type === "PONTE");

  const tauxPonte = (f) => (f.dernier_point ? Number(f.dernier_point.taux_ponte) : 0);
  const effectifActuel = (f) => (f.bande_active ? f.bande_active.effectif_actuel : 0);

  // Ratios avicoles standards (par sujet, pas en valeur brute) — le "mois"
  // est une moyenne journalière sur les jours effectivement saisis ce
  // mois-ci, pas un cumul (sinon pas comparable au jour).
  const alimentGrammesJour = (f) => Number(f.dernier_point?.conso_aliment_sacs || 0) * KG_PAR_SAC * 1000;
  const eauLitresJour = (f) => Number(f.dernier_point?.eau_consommee_litres || 0);
  const ratioAlimentJour = (f) => { const e = effectifActuel(f); return e > 0 ? alimentGrammesJour(f) / e : 0; };
  const ratioEauJour = (f) => { const e = effectifActuel(f); return e > 0 ? eauLitresJour(f) / e : 0; };
  const ratioAlimentMois = (f) => {
    const e = effectifActuel(f), j = f.mois?.jours || 0;
    return e > 0 && j > 0 ? (Number(f.mois?.conso_aliment_sacs || 0) * KG_PAR_SAC * 1000) / j / e : 0;
  };
  const ratioEauMois = (f) => {
    const e = effectifActuel(f), j = f.mois?.jours || 0;
    return e > 0 && j > 0 ? Number(f.mois?.eau_consommee_litres || 0) / j / e : 0;
  };

  // Indice de consommation (IC) : g d'aliment pour produire un œuf — le
  // ratio de rentabilité standard en aviculture (avec le taux de ponte).
  // Pas de seuil d'alerte : on n'a pas de valeur de référence validée pour
  // cet élevage, contrairement à la courbe de ponte par race/âge.
  const icJour = (f) => {
    const p = f.dernier_point?.production_oeufs || 0;
    return p > 0 ? alimentGrammesJour(f) / p : 0;
  };
  const icMois = (f) => {
    const p = f.mois?.production_oeufs || 0;
    return p > 0 ? (Number(f.mois?.conso_aliment_sacs || 0) * KG_PAR_SAC * 1000) / p : 0;
  };
  // Taux de casse/brisure — signal de qualité de manipulation ou de stress
  // du troupeau, déjà saisi au point journalier mais jamais affiché.
  const tauxCasseJour = (f) => {
    const p = f.dernier_point?.production_oeufs || 0;
    if (!p) return 0;
    return ((f.dernier_point?.casse || 0) + (f.dernier_point?.brise || 0)) / p * 100;
  };

  const kpi = useMemo(() => {
    const effectif = pondeuses.reduce((s, f) => s + effectifActuel(f), 0);
    const prod = pondeuses.reduce((s, f) => s + (f.dernier_point?.production_oeufs || 0), 0);
    const prodMois = pondeuses.reduce((s, f) => s + (f.mois?.production_oeufs || 0), 0);
    const morts = actives.reduce((s, f) => s + (f.dernier_point?.morts || 0), 0);
    const mortsMois = actives.reduce((s, f) => s + (f.mois?.morts || 0), 0);
    const stockOeuf = pondeuses.reduce((s, f) => s + (f.bande_active?.stock_oeuf_actuel || 0), 0);
    const tauxMoyen = effectif > 0 ? (prod / effectif) * 100 : 0;

    const effectifTous = actives.reduce((s, f) => s + effectifActuel(f), 0);
    const rAlimentJour = effectifTous > 0 ? actives.reduce((s, f) => s + alimentGrammesJour(f), 0) / effectifTous : 0;
    const rEauJour = effectifTous > 0 ? actives.reduce((s, f) => s + eauLitresJour(f), 0) / effectifTous : 0;

    // Moyenne pondérée par "poule-jours" cumulés (chaque ferme peut avoir
    // un nombre de jours saisis différent ce mois-ci).
    let pouleJours = 0, alimentMois = 0, eauMois = 0;
    actives.forEach((f) => {
      const e = effectifActuel(f), j = f.mois?.jours || 0;
      if (!e || !j) return;
      pouleJours += e * j;
      alimentMois += Number(f.mois?.conso_aliment_sacs || 0) * KG_PAR_SAC * 1000;
      eauMois += Number(f.mois?.eau_consommee_litres || 0);
    });
    const rAlimentMois = pouleJours > 0 ? alimentMois / pouleJours : 0;
    const rEauMois = pouleJours > 0 ? eauMois / pouleJours : 0;

    // IC global = aliment total (g) / œufs totaux, sur les pondeuses uniquement
    const alimentGrammesJourPondeuses = pondeuses.reduce((s, f) => s + alimentGrammesJour(f), 0);
    const alimentGrammesMoisPondeuses = pondeuses.reduce((s, f) => s + Number(f.mois?.conso_aliment_sacs || 0) * KG_PAR_SAC * 1000, 0);
    const icJourGlobal = prod > 0 ? alimentGrammesJourPondeuses / prod : 0;
    const icMoisGlobal = prodMois > 0 ? alimentGrammesMoisPondeuses / prodMois : 0;

    return { effectif, prod, prodMois, morts, mortsMois, stockOeuf, tauxMoyen, rAlimentJour, rAlimentMois, rEauJour, rEauMois, icJourGlobal, icMoisGlobal };
  }, [actives, pondeuses]);

  const alertes = useMemo(() => {
    const a = [];
    actives.forEach((f) => {
      const age = f.bande_active?.age;
      if (f.type === "PONTE" && f.dernier_point && tauxPonte(f) < 60) {
        a.push({ ferme: f.nom, txt: `Taux de ponte ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
      }
      if (f.type === "PONTE" && f.dernier_point && f.taux_ponte_veille != null && tauxPonte(f) - Number(f.taux_ponte_veille) < -10) {
        a.push({ ferme: f.nom, txt: `Chute brutale du taux de ponte : ${Number(f.taux_ponte_veille).toFixed(0)} % → ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
      }
      if (Number(f.magasin.stock_aliment_sacs) <= Number(f.magasin.seuil_alerte_aliment_sacs)) {
        a.push({ ferme: f.nom, txt: `Aliment bas : ${formatSacs(Number(f.magasin.stock_aliment_sacs))}`, grav: "haut" });
      }
      if (f.type === "PONTE" && f.magasin.stock_alveoles_unites <= f.magasin.seuil_alerte_alveoles_unites) {
        a.push({ ferme: f.nom, txt: `Alvéoles basses : ${formatColis(f.magasin.stock_alveoles_unites)}`, grav: "moy" });
      }
      if (f.dernier_point && f.dernier_point.morts > 5) {
        a.push({ ferme: f.nom, txt: `Mortalité ${f.dernier_point.morts} sujets`, grav: "moy" });
      }
      if (f.type === "PONTE" && age && age.valeur >= AGE_REFORME_SEMAINES) {
        a.push({ ferme: f.nom, txt: `Bande en âge de réforme (${age.label})`, grav: "moy" });
      }
      if (f.type === "PONTE" && f.dernier_point?.production_oeufs > 0 && tauxCasseJour(f) > 5) {
        a.push({ ferme: f.nom, txt: `Taux de casse/brisure élevé (${tauxCasseJour(f).toFixed(1)} %)`, grav: "moy" });
      }
      if (
        f.type === "CHAIR" && f.dernier_point?.poids_moyen_grammes != null && f.dernier_point.poids_cible_grammes != null
        && Number(f.dernier_point.poids_moyen_grammes) < f.dernier_point.poids_cible_grammes * 0.9
      ) {
        a.push({ ferme: f.nom, txt: `Retard de croissance : ${nf(Math.round(f.dernier_point.poids_moyen_grammes))} g pour ${nf(f.dernier_point.poids_cible_grammes)} g attendus`, grav: "moy" });
      }
    });
    if (absencesEnAttente.length > 0) {
      a.unshift({ ferme: "Pointage", txt: `${absencesEnAttente.length} absence${absencesEnAttente.length > 1 ? "s" : ""} en attente de validation`, grav: "haut" });
    }
    employesSansSalaire.forEach((e) => {
      a.push({ ferme: "Paie", txt: `${e.nom} n'a pas de salaire mensuel renseigné`, grav: "moy" });
    });
    evenementsSanteEnRetard.forEach((e) => {
      a.push({ ferme: e.ferme_nom, txt: `${e.type === "VACCIN" ? "Vaccin" : "Traitement"} en retard : ${e.nom} (prévu le ${new Date(e.date_prevue).toLocaleDateString("fr-FR")})`, grav: "haut" });
    });
    creancesEnRetard.forEach((f) => {
      a.push({ ferme: "Créances", txt: `${f.client.nom} doit ${nf(Math.round(f.reste_du))} F depuis ${joursDepuis(f.date)} jours (facture n°${String(f.numero).padStart(7, "0")})`, grav: "moy" });
    });
    return a.sort((x, y) => (x.grav === "haut" ? -1 : 1));
  }, [actives, absencesEnAttente, employesSansSalaire, evenementsSanteEnRetard, creancesEnRetard]);

  const dataPonte = pondeuses.map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), taux: +tauxPonte(f).toFixed(1) }));
  const dataAge = pondeuses
    .filter((f) => f.bande_active)
    .map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), age: f.bande_active.age.valeur, ref: COURBE_REF[f.bande_active.age.valeur] || null, reel: +tauxPonte(f).toFixed(1) }))
    .sort((a, b) => a.age - b.age);
  const dataAliment = actives.map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), valeur: +ratioAlimentJour(f).toFixed(0) }));
  const dataEau = actives.map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), valeur: +ratioEauJour(f).toFixed(2) }));
  const dataMortalite = evolutionMois.map((e) => ({
    date: new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    morts: e.morts,
  }));

  if (chargement) return <div style={styles.page}><p style={{ padding: 20 }}>Chargement...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div>
            <div style={styles.eyebrow}>Volailles de l'Est · Tableau de bord</div>
            <h1 style={styles.h1}>Vue consolidée</h1>
          </div>
          <div style={styles.date}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
        </header>

        <div style={styles.kpiRow}>
          <Kpi icon={<Activity size={16} />} label="Taux de ponte moyen" value={`${kpi.tauxMoyen.toFixed(1)} %`} accent />
          <Kpi icon={<Egg size={16} />} label="Production" value={nf(kpi.prod)} sub="œufs/jour" mois={`${nf(kpi.prodMois)} œufs ce mois`} />
          <Kpi icon={<TrendingUp size={16} />} label="Effectif pondeuses" value={nf(kpi.effectif)} sub="sujets" />
          <Kpi icon={<Skull size={16} />} label="Mortalité" value={nf(kpi.morts)} sub="sujets/jour" mois={`${nf(kpi.mortsMois)} sujets ce mois`} />
          <Kpi icon={<Package size={16} />} label="Stock œufs total" value={nf(kpi.stockOeuf)} sub="œufs" />
          <Kpi icon={<Wheat size={16} />} label="Aliment / poule" value={`${nf(Math.round(kpi.rAlimentJour))} g/j`} mois={`${nf(Math.round(kpi.rAlimentMois))} g/j moy. ce mois`} />
          <Kpi icon={<Droplet size={16} />} label="Eau / poule" value={`${kpi.rEauJour.toFixed(2)} L/j`} mois={`${kpi.rEauMois.toFixed(2)} L/j moy. ce mois`} />
          <Kpi icon={<Wheat size={16} />} label="Indice de consommation" value={`${nf(Math.round(kpi.icJourGlobal))} g/œuf`} mois={`${nf(Math.round(kpi.icMoisGlobal))} g/œuf ce mois`} />
        </div>

        <div style={styles.kpiFermeGrid}>
          {actives.map((f) => {
            const t = tauxPonte(f);
            return (
              <div key={f.id} style={styles.kpiFermeCard}>
                <div style={styles.kpiFermeNom}>{f.nom}</div>
                <div style={styles.kpiFermeStats}>
                  {f.type === "PONTE" && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>Ponte</span>
                      <span style={{ ...styles.kpiFermeValeur, color: t < 60 ? "#9E4527" : GREEN_DARK }}>{t.toFixed(0)} %</span>
                    </div>
                  )}
                  {f.type === "PONTE" && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>Production</span>
                      <span style={styles.kpiFermeValeur}>{nf(f.dernier_point?.production_oeufs || 0)}</span>
                      <span style={styles.kpiFermeMois}>{nf(f.mois?.production_oeufs || 0)} ce mois</span>
                    </div>
                  )}
                  <div style={styles.kpiFermeStat}>
                    <span style={styles.kpiFermeLabel}>Effectif</span>
                    <span style={styles.kpiFermeValeur}>{nf(effectifActuel(f))}</span>
                  </div>
                  <div style={styles.kpiFermeStat}>
                    <span style={styles.kpiFermeLabel}>Mortalité</span>
                    <span style={{ ...styles.kpiFermeValeur, color: (f.dernier_point?.morts || 0) > 5 ? "#9E4527" : INK }}>{nf(f.dernier_point?.morts || 0)}</span>
                    <span style={styles.kpiFermeMois}>{nf(f.mois?.morts || 0)} ce mois</span>
                  </div>
                  {f.type === "PONTE" && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>Stock œuf</span>
                      <span style={styles.kpiFermeValeur}>{nf(f.bande_active?.stock_oeuf_actuel || 0)}</span>
                    </div>
                  )}
                  <div style={styles.kpiFermeStat}>
                    <span style={styles.kpiFermeLabel}>Aliment/poule</span>
                    <span style={styles.kpiFermeValeur}>{nf(Math.round(ratioAlimentJour(f)))} g/j</span>
                    <span style={styles.kpiFermeMois}>{nf(Math.round(ratioAlimentMois(f)))} g/j moy. mois</span>
                  </div>
                  <div style={styles.kpiFermeStat}>
                    <span style={styles.kpiFermeLabel}>Eau/poule</span>
                    <span style={styles.kpiFermeValeur}>{ratioEauJour(f).toFixed(2)} L/j</span>
                    <span style={styles.kpiFermeMois}>{ratioEauMois(f).toFixed(2)} L/j moy. mois</span>
                  </div>
                  {f.type === "PONTE" && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>IC (aliment/œuf)</span>
                      <span style={styles.kpiFermeValeur}>{nf(Math.round(icJour(f)))} g</span>
                      <span style={styles.kpiFermeMois}>{nf(Math.round(icMois(f)))} g ce mois</span>
                    </div>
                  )}
                  {f.type === "PONTE" && (f.dernier_point?.production_oeufs || 0) > 0 && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>Taux de casse</span>
                      <span style={{ ...styles.kpiFermeValeur, color: tauxCasseJour(f) > 5 ? "#9E4527" : INK }}>{tauxCasseJour(f).toFixed(1)} %</span>
                    </div>
                  )}
                  {f.type === "CHAIR" && f.dernier_point?.poids_moyen_grammes != null && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>Poids vif</span>
                      <span
                        style={{
                          ...styles.kpiFermeValeur,
                          color: f.dernier_point.poids_cible_grammes != null && Number(f.dernier_point.poids_moyen_grammes) < f.dernier_point.poids_cible_grammes ? "#9E4527" : GREEN_DARK,
                        }}
                      >
                        {nf(Math.round(f.dernier_point.poids_moyen_grammes))} g
                      </span>
                      {f.dernier_point.poids_cible_grammes != null && (
                        <span style={styles.kpiFermeMois}>cible {nf(f.dernier_point.poids_cible_grammes)} g</span>
                      )}
                    </div>
                  )}
                  {f.type === "CHAIR" && f.dernier_point?.gmq_grammes != null && (
                    <div style={styles.kpiFermeStat}>
                      <span style={styles.kpiFermeLabel}>GMQ</span>
                      <span style={styles.kpiFermeValeur}>{nf(f.dernier_point.gmq_grammes)} g/j</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.grid}>
          <div style={styles.col}>
            <Card titre="Taux de ponte par ferme">
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={dataPonte} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEEBE2" vertical={false} />
                  <XAxis dataKey="nom" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#F4F1EA" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} %`, "Taux"]} />
                  <ReferenceLine y={60} stroke="#C6603A" strokeDasharray="4 4" label={{ value: "seuil 60%", fontSize: 10, fill: "#C6603A", position: "right" }} />
                  <Bar dataKey="taux" radius={[6, 6, 0, 0]} fill={GREEN} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card titre="Ponte réelle vs référence, par âge (semaines)">
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={dataAge} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEEBE2" vertical={false} />
                  <XAxis dataKey="age" tickLine={false} axisLine={false} unit=" sem" />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="ref" name="Référence" stroke="#C6A15B" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="reel" name="Réel VDE" stroke={GREEN} strokeWidth={2.5} dot={{ r: 4, fill: GREEN }} />
                </LineChart>
              </ResponsiveContainer>
              <p style={styles.legend}><span style={{ color: GREEN, fontWeight: 600 }}>● Réel VDE</span> &nbsp; <span style={{ color: "#C6A15B", fontWeight: 600 }}>● Référence race</span></p>
            </Card>

            <Card titre="Mortalité — évolution du mois">
              {dataMortalite.length === 0 ? (
                <p style={styles.noAlert}>Pas encore de données ce mois-ci</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={dataMortalite} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEEBE2" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} sujets`, "Mortalité"]} />
                    <Line type="monotone" dataKey="morts" stroke="#C6603A" strokeWidth={2.5} dot={{ r: 3, fill: "#C6603A" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card titre="Aliment par ferme (g / poule / jour)">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dataAliment} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEEBE2" vertical={false} />
                  <XAxis dataKey="nom" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#F4F1EA" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} g`, "Aliment"]} />
                  <Bar dataKey="valeur" radius={[6, 6, 0, 0]} fill="#C6A15B" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card titre="Eau par ferme (L / poule / jour)">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dataEau} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEEBE2" vertical={false} />
                  <XAxis dataKey="nom" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#F4F1EA" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} L`, "Eau"]} />
                  <Bar dataKey="valeur" radius={[6, 6, 0, 0]} fill="#4A90A4" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div style={styles.col}>
            <Card titre={`Alertes (${alertes.length})`} danger>
              {alertes.length === 0 ? (
                <p style={styles.noAlert}>Aucune alerte — tout est nominal ✓</p>
              ) : (
                <div style={styles.alertList}>
                  {alertes.map((a, i) => (
                    <div key={i} style={{ ...styles.alertItem, ...(a.grav === "haut" ? styles.alertHaut : {}) }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div><strong style={{ fontWeight: 600 }}>{a.ferme}</strong> — {a.txt}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card titre="Fermes">
              <div style={styles.fermeList}>
                {fermes.map((f) => {
                  if (f.est_vide) return (
                    <div key={f.id} style={{ ...styles.fermeRow, opacity: .55 }}>
                      <div><div style={styles.fermeNom}>{f.nom}</div><div style={styles.fermeMeta}>{f.type === "CHAIR" ? "Chair" : "Pondeuses"} · vide</div></div>
                      <span style={styles.badgeVide}>Aucune bande</span>
                    </div>
                  );
                  const t = tauxPonte(f);
                  const alerte = t < 60 || Number(f.magasin.stock_aliment_sacs) <= Number(f.magasin.seuil_alerte_aliment_sacs) || f.bande_active.age.valeur >= AGE_REFORME_SEMAINES;
                  const ouvert = sel === f.id;
                  return (
                    <Fragment key={f.id}>
                      <button style={styles.fermeRow} onClick={() => setSel(ouvert ? null : f.id)}>
                        <div>
                          <div style={styles.fermeNom}>{f.nom}</div>
                          <div style={styles.fermeMeta}>{f.bande_active.age.label} · {nf(effectifActuel(f))} sujets · {formatSacs(Number(f.magasin.stock_aliment_sacs))}</div>
                        </div>
                        <div style={styles.fermeRight}>
                          <span style={{ ...styles.tauxBadge, ...(alerte ? styles.tauxBadgeAlert : {}) }}>{t.toFixed(0)}%</span>
                          <ChevronRight size={16} color="#B5BBB2" style={{ transform: ouvert ? "rotate(90deg)" : "none", transition: ".2s" }} />
                        </div>
                      </button>
                      {ouvert && (
                        <div style={styles.fermeDetail}>
                          <div style={styles.fermeDetailGrid}>
                            <DetailItem label="Mise en place" value={new Date(f.bande_active.date_mise_en_place).toLocaleDateString("fr-FR")} />
                            <DetailItem label="Mortalité" value={`${nf(f.dernier_point?.morts || 0)} /j · ${nf(f.mois?.morts || 0)} ce mois`} />
                            {f.type === "PONTE" && (
                              <DetailItem label="Production" value={`${nf(f.dernier_point?.production_oeufs || 0)} /j · ${nf(f.mois?.production_oeufs || 0)} ce mois`} />
                            )}
                            {f.type === "PONTE" && (
                              <DetailItem label="Stock alvéoles" value={formatColis(f.magasin.stock_alveoles_unites)} />
                            )}
                            {f.type === "PONTE" && (
                              <DetailItem label="Stock œuf" value={`${nf(f.bande_active?.stock_oeuf_actuel || 0)} œufs`} />
                            )}
                            <DetailItem label="Aliment / poule" value={`${nf(Math.round(ratioAlimentJour(f)))} g/j`} />
                            <DetailItem label="Eau / poule" value={`${ratioEauJour(f).toFixed(2)} L/j`} />
                            {f.type === "PONTE" && (
                              <DetailItem label="Indice de consommation" value={`${nf(Math.round(icJour(f)))} g/œuf`} />
                            )}
                            {f.type === "PONTE" && (f.dernier_point?.production_oeufs || 0) > 0 && (
                              <DetailItem label="Taux de casse" value={`${tauxCasseJour(f).toFixed(1)} %`} />
                            )}
                            {f.type === "CHAIR" && f.dernier_point?.poids_moyen_grammes != null && (
                              <DetailItem
                                label="Poids vif (dernière pesée)"
                                value={`${nf(Math.round(f.dernier_point.poids_moyen_grammes))} g${f.dernier_point.poids_cible_grammes != null ? ` (cible ${nf(f.dernier_point.poids_cible_grammes)} g)` : ""}`}
                              />
                            )}
                            {f.type === "CHAIR" && f.dernier_point?.gmq_grammes != null && (
                              <DetailItem label="GMQ" value={`${nf(f.dernier_point.gmq_grammes)} g/j`} />
                            )}
                          </div>
                          {f.dernier_point?.traitement && (
                            <p style={styles.fermeObservation}>Traitement : {f.dernier_point.traitement}</p>
                          )}
                          {f.dernier_point?.observation && (
                            <p style={styles.fermeObservation}>« {f.dernier_point.observation} »</p>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        <p style={styles.foot}>Volailles de l'Est — les données proviennent des points journaliers saisis par les chefs de ferme</p>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent, mois }) {
  return (
    <div style={{ ...styles.kpi, ...(accent ? styles.kpiAccent : {}) }}>
      <div style={{ ...styles.kpiIcon, ...(accent ? { background: "rgba(255,255,255,.2)" } : {}) }}>{icon}</div>
      <div style={styles.kpiVal}>{value} {sub && <span style={styles.kpiSub}>{sub}</span>}</div>
      <div style={styles.kpiLabel}>{label}</div>
      {mois && <div style={{ ...styles.kpiMois, ...(accent ? { color: "rgba(255,255,255,.75)" } : {}) }}>{mois}</div>}
    </div>
  );
}
function Card({ titre, children, danger }) {
  return (<section style={styles.card}><div style={{ ...styles.cardHead, ...(danger ? { color: "#9E4527" } : {}) }}>{titre}</div>{children}</section>);
}
function DetailItem({ label, value }) {
  return (
    <div style={styles.fermeDetailItem}>
      <span style={styles.fermeDetailLabel}>{label}</span>
      <span style={styles.fermeDetailValeur}>{value}</span>
    </div>
  );
}

const tooltipStyle = { background: "#fff", border: "1px solid #ECE9DF", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 20px rgba(0,0,0,.1)" };
const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1080, margin: "0 auto", padding: "24px 20px" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  date: { fontSize: 13, color: "#7A857F", textTransform: "capitalize" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 },
  kpi: { background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ECE9DF" },
  kpiAccent: { background: `linear-gradient(150deg, ${GREEN}, ${GREEN_DARK})`, color: "#fff", border: "none" },
  kpiIcon: { width: 30, height: 30, borderRadius: 8, background: "#EAF3EE", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN, marginBottom: 9 },
  kpiVal: { fontSize: 22, fontWeight: 700 },
  kpiSub: { fontSize: 12, fontWeight: 400, opacity: .7 },
  kpiLabel: { fontSize: 11.5, opacity: .78, marginTop: 2 },
  kpiMois: { fontSize: 10.5, opacity: .65, marginTop: 4, borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 4 },
  kpiFermeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 18 },
  kpiFermeCard: { background: "#fff", borderRadius: 14, padding: "13px 15px", border: "1px solid #ECE9DF" },
  kpiFermeNom: { fontSize: 13.5, fontWeight: 700, color: GREEN_DARK, marginBottom: 8 },
  kpiFermeStats: { display: "flex", flexWrap: "wrap", gap: "6px 14px" },
  kpiFermeStat: { display: "flex", flexDirection: "column", gap: 1, minWidth: 60 },
  kpiFermeLabel: { fontSize: 10, color: "#8A948D", textTransform: "uppercase", letterSpacing: .3 },
  kpiFermeValeur: { fontSize: 15, fontWeight: 700, color: INK },
  kpiFermeMois: { fontSize: 9.5, color: "#8A948D" },
  grid: { display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16 },
  col: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #ECE9DF" },
  cardHead: { fontSize: 14.5, fontWeight: 600, color: GREEN_DARK, marginBottom: 12 },
  legend: { fontSize: 11, textAlign: "center", margin: "6px 0 0", color: "#7A857F" },
  noAlert: { fontSize: 13, color: GREEN, background: "#EAF3EE", borderRadius: 10, padding: "14px", textAlign: "center", margin: 0 },
  alertList: { display: "flex", flexDirection: "column", gap: 8 },
  alertItem: { display: "flex", gap: 9, alignItems: "flex-start", background: "#FBF0EB", color: "#9E4527", padding: "10px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.4 },
  alertHaut: { background: "#F7E4DC", fontWeight: 500 },
  fermeList: { display: "flex", flexDirection: "column", gap: 2 },
  fermeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px", border: "none", background: "none", borderBottom: "1px solid #F2F0E8", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" },
  fermeNom: { fontSize: 14.5, fontWeight: 600, color: INK },
  fermeMeta: { fontSize: 11.5, color: "#8A948D", marginTop: 2 },
  fermeRight: { display: "flex", alignItems: "center", gap: 8 },
  tauxBadge: { fontSize: 14, fontWeight: 700, color: GREEN_DARK, background: "#EAF3EE", padding: "3px 9px", borderRadius: 8 },
  tauxBadgeAlert: { color: "#9E4527", background: "#F7E4DC" },
  badgeVide: { fontSize: 11, color: "#95A09A", background: "#F2F0E8", padding: "3px 9px", borderRadius: 8 },
  fermeDetail: { padding: "10px 8px 14px", background: "#FBFAF6", borderRadius: 10, marginBottom: 4 },
  fermeDetailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px 12px" },
  fermeDetailItem: { display: "flex", flexDirection: "column", gap: 1 },
  fermeDetailLabel: { fontSize: 10, color: "#8A948D", textTransform: "uppercase", letterSpacing: .3 },
  fermeDetailValeur: { fontSize: 13, fontWeight: 600, color: GREEN_DARK },
  fermeObservation: { fontSize: 12, color: "#6B756E", fontStyle: "italic", margin: "10px 0 0" },
  foot: { textAlign: "center", fontSize: 11, color: "#A8AEA4", marginTop: 22, lineHeight: 1.5 },
};
