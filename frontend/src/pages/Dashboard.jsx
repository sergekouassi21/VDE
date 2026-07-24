import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Egg, TrendingUp, AlertTriangle, Skull, Package, ChevronRight, Activity } from "lucide-react";
import { getDashboard } from "../api/client";
import { GREEN, GREEN_DARK, INK, formatSacs, formatColis, AGE_REFORME_SEMAINES } from "../theme";

const nf = (v) => (v ?? 0).toLocaleString("fr-FR");

// Courbe de ponte de référence par âge (race Isa Brown, %), pour comparaison
const COURBE_REF = { 17: 22, 20: 78, 25: 93, 30: 94, 40: 91, 47: 89, 48: 89, 50: 87, 60: 83, 70: 78, 77: 75, 80: 72, 93: 64 };

export default function Dashboard() {
  const [fermes, setFermes] = useState([]);
  const [sel, setSel] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    getDashboard().then((data) => { setFermes(data); setChargement(false); });
  }, []);

  const actives = fermes.filter((f) => !f.est_vide);
  const pondeuses = actives.filter((f) => f.type === "PONTE");

  const tauxPonte = (f) => (f.dernier_point ? Number(f.dernier_point.taux_ponte) : 0);
  const effectifActuel = (f) => (f.bande_active ? f.bande_active.effectif_actuel : 0);

  const kpi = useMemo(() => {
    const effectif = pondeuses.reduce((s, f) => s + effectifActuel(f), 0);
    const prod = pondeuses.reduce((s, f) => s + (f.dernier_point?.production_oeufs || 0), 0);
    const morts = actives.reduce((s, f) => s + (f.dernier_point?.morts || 0), 0);
    const stockOeuf = pondeuses.reduce((s, f) => s + (f.dernier_point?.stock_oeuf_total || 0), 0);
    const tauxMoyen = effectif > 0 ? (prod / effectif) * 100 : 0;
    return { effectif, prod, morts, stockOeuf, tauxMoyen };
  }, [actives, pondeuses]);

  const alertes = useMemo(() => {
    const a = [];
    actives.forEach((f) => {
      const age = f.bande_active?.age;
      if (f.type === "PONTE" && f.dernier_point && tauxPonte(f) < 60) {
        a.push({ ferme: f.nom, txt: `Taux de ponte ${tauxPonte(f).toFixed(0)} %`, grav: "haut" });
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
    });
    return a.sort((x, y) => (x.grav === "haut" ? -1 : 1));
  }, [actives]);

  const dataPonte = pondeuses.map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), taux: +tauxPonte(f).toFixed(1) }));
  const dataAge = pondeuses
    .filter((f) => f.bande_active)
    .map((f) => ({ nom: f.nom.replace("Ayénou", "Ay."), age: f.bande_active.age.valeur, ref: COURBE_REF[f.bande_active.age.valeur] || null, reel: +tauxPonte(f).toFixed(1) }))
    .sort((a, b) => a.age - b.age);

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
          <Kpi icon={<Egg size={16} />} label="Production du jour" value={nf(kpi.prod)} sub="œufs" />
          <Kpi icon={<TrendingUp size={16} />} label="Effectif pondeuses" value={nf(kpi.effectif)} sub="sujets" />
          <Kpi icon={<Skull size={16} />} label="Mortalité du jour" value={nf(kpi.morts)} sub="sujets" />
          <Kpi icon={<Package size={16} />} label="Stock œufs total" value={nf(kpi.stockOeuf)} sub="œufs" />
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
                  return (
                    <button key={f.id} style={styles.fermeRow} onClick={() => setSel(sel === f.id ? null : f.id)}>
                      <div>
                        <div style={styles.fermeNom}>{f.nom}</div>
                        <div style={styles.fermeMeta}>{f.bande_active.age.label} · {nf(effectifActuel(f))} sujets · {formatSacs(Number(f.magasin.stock_aliment_sacs))}</div>
                      </div>
                      <div style={styles.fermeRight}>
                        <span style={{ ...styles.tauxBadge, ...(alerte ? styles.tauxBadgeAlert : {}) }}>{t.toFixed(0)}%</span>
                        <ChevronRight size={16} color="#B5BBB2" style={{ transform: sel === f.id ? "rotate(90deg)" : "none", transition: ".2s" }} />
                      </div>
                    </button>
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

function Kpi({ icon, label, value, sub, accent }) {
  return (
    <div style={{ ...styles.kpi, ...(accent ? styles.kpiAccent : {}) }}>
      <div style={{ ...styles.kpiIcon, ...(accent ? { background: "rgba(255,255,255,.2)" } : {}) }}>{icon}</div>
      <div style={styles.kpiVal}>{value} {sub && <span style={styles.kpiSub}>{sub}</span>}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}
function Card({ titre, children, danger }) {
  return (<section style={styles.card}><div style={{ ...styles.cardHead, ...(danger ? { color: "#9E4527" } : {}) }}>{titre}</div>{children}</section>);
}

const tooltipStyle = { background: "#fff", border: "1px solid #ECE9DF", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 20px rgba(0,0,0,.1)" };
const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1080, margin: "0 auto", padding: "24px 20px" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  date: { fontSize: 13, color: "#7A857F", textTransform: "capitalize" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 },
  kpi: { background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ECE9DF" },
  kpiAccent: { background: `linear-gradient(150deg, ${GREEN}, ${GREEN_DARK})`, color: "#fff", border: "none" },
  kpiIcon: { width: 30, height: 30, borderRadius: 8, background: "#EAF3EE", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN, marginBottom: 9 },
  kpiVal: { fontSize: 22, fontWeight: 700 },
  kpiSub: { fontSize: 12, fontWeight: 400, opacity: .7 },
  kpiLabel: { fontSize: 11.5, opacity: .78, marginTop: 2 },
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
  foot: { textAlign: "center", fontSize: 11, color: "#A8AEA4", marginTop: 22, lineHeight: 1.5 },
};
