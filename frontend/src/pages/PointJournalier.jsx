import { useState, useEffect, useMemo, useCallback } from "react";
import { Egg, Skull, Wheat, Package, TrendingUp, Check, ChevronDown, AlertTriangle, Calendar, Download, Share2, WifiOff, RefreshCw } from "lucide-react";
import { getFermes, soumettrePointJournalier, declarerBande } from "../api/client";
import { GREEN, GREEN_DARK, CREAM, INK, CLAY, formatSacs, formatColis, AGE_REFORME_SEMAINES } from "../theme";
import { genererPdfPointJournalier, telechargerPdf, partagerPdf } from "../utils/pdf";
import { ajouterSoumissionEnAttente, listerSoumissionsEnAttente } from "../offline/queue";
import { synchroniserSoumissionsEnAttente } from "../offline/sync";

const partageDisponible = typeof navigator !== "undefined" && !!navigator.share;

function peutDeclarerBande() {
  const role = localStorage.getItem("vde_role");
  return !role || role === "DIRECTION" || role === "ADMIN";
}

const n = (v) => (v === "" || v === null || v === undefined || isNaN(v) ? 0 : Number(v));
const todayISO = () => new Date().toISOString().slice(0, 10);
const FORM_VIDE = {
  morts: "", conso_aliment_sacs: "", aliment_recu_sacs: "", traitement: "", eau_consommee_litres: "",
  alveole_recu_unites: "", production_oeufs: "", casse: "", brise: "", observation: "",
};
const NOUVELLE_SORTIE_VIDE = { quantite: "", type_sortie: "VENTE", responsable: "" };

export default function PointJournalier() {
  const nomChef = localStorage.getItem("vde_nom") || "";
  const photoChef = localStorage.getItem("vde_photo") || "";
  const [fermes, setFermes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [fermeId, setFermeId] = useState(null);
  const [openFerme, setOpenFerme] = useState(false);
  const [dateJour, setDateJour] = useState(todayISO());
  const [form, setForm] = useState(FORM_VIDE);
  const [sorties, setSorties] = useState([]);
  const [nouvelleSortie, setNouvelleSortie] = useState(NOUVELLE_SORTIE_VIDE);
  const [envoye, setEnvoye] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [declaration, setDeclaration] = useState({ date_mise_en_place: todayISO(), effectif_initial: "" });
  const [horsLigneEnvoi, setHorsLigneEnvoi] = useState(false);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [enAttenteCount, setEnAttenteCount] = useState(0);

  const chargerFermes = useCallback(async () => {
    const data = await getFermes();
    setFermes(data);
    setChargement(false);
    setFermeId((id) => id ?? data[0]?.id ?? null);
  }, []);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerSoumissionsEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  useEffect(() => { chargerFermes(); }, [chargerFermes]);

  useEffect(() => {
    rafraichirEnAttente();
    const synchroniser = () => synchroniserSoumissionsEnAttente(() => { rafraichirEnAttente(); chargerFermes(); });
    function onOnline() { setEnLigne(true); synchroniser(); }
    function onOffline() { setEnLigne(false); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => { if (navigator.onLine) synchroniser(); }, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [rafraichirEnAttente, chargerFermes]);

  const ferme = fermes.find((f) => f.id === fermeId);
  const bande = ferme?.bande_active;
  const magasin = ferme?.magasin;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setEnvoye(false); setHorsLigneEnvoi(false); };
  const reset = () => { setForm(FORM_VIDE); setSorties([]); setNouvelleSortie(NOUVELLE_SORTIE_VIDE); };

  const totalSorties = sorties.reduce((s, x) => s + n(x.quantite), 0);

  function ajouterSortie() {
    if (!n(nouvelleSortie.quantite) || !nouvelleSortie.responsable.trim()) return;
    setSorties((s) => [...s, { ...nouvelleSortie, quantite: n(nouvelleSortie.quantite) }]);
    setNouvelleSortie(NOUVELLE_SORTIE_VIDE);
    setEnvoye(false); setHorsLigneEnvoi(false);
  }
  function retirerSortie(index) {
    setSorties((s) => s.filter((_, i) => i !== index));
    setEnvoye(false); setHorsLigneEnvoi(false);
  }

  const calc = useMemo(() => {
    if (!ferme || !bande || !magasin) return null;
    const effectifVeille = ferme.dernier_point ? ferme.dernier_point.effectif_reste : bande.effectif_actuel;
    const stockOeufVeille = ferme.dernier_point ? ferme.dernier_point.stock_oeuf_total : bande.stock_oeuf_actuel;
    const resteEffectif = effectifVeille - n(form.morts);
    const stockOeufJour = n(form.production_oeufs) - n(form.casse) - n(form.brise);
    const stockTotal = stockOeufVeille + stockOeufJour - totalSorties;
    const tauxPonte = resteEffectif > 0 ? (n(form.production_oeufs) / resteEffectif) * 100 : 0;
    const stockAlimentSacs = Number(magasin.stock_aliment_sacs) + n(form.aliment_recu_sacs) - n(form.conso_aliment_sacs);
    const alveoleConsoAuto = Math.floor(n(form.production_oeufs) / 30);
    const stockAlveole = magasin.stock_alveoles_unites + n(form.alveole_recu_unites) - alveoleConsoAuto;
    return { resteEffectif, stockOeufJour, stockTotal, tauxPonte, stockAlimentSacs, alveoleConsoAuto, stockAlveole };
  }, [form, ferme, bande, magasin, totalSorties]);

  const tauxAlerte = ferme?.type === "PONTE" && n(form.production_oeufs) > 0 && calc && calc.tauxPonte < 60;
  const mortsAlerte = n(form.morts) > 5;
  const alimentAlerte = calc && magasin && calc.stockAlimentSacs <= Number(magasin.seuil_alerte_aliment_sacs);
  const alveoleAlerte = calc && magasin && ferme?.type === "PONTE" && calc.stockAlveole <= magasin.seuil_alerte_alveoles_unites;
  const dateAffiche = new Date(dateJour).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  async function handleSubmit() {
    setErreur(""); setEnvoiEnCours(true);
    const payload = {
      date: dateJour,
      morts: n(form.morts), conso_aliment_sacs: n(form.conso_aliment_sacs),
      aliment_recu_sacs: n(form.aliment_recu_sacs), traitement: form.traitement,
      eau_consommee_litres: n(form.eau_consommee_litres),
      alveole_recu_unites: n(form.alveole_recu_unites), production_oeufs: n(form.production_oeufs),
      casse: n(form.casse), brise: n(form.brise), sorties,
      observation: form.observation,
    };

    if (!navigator.onLine) {
      await ajouterSoumissionEnAttente(ferme.id, ferme.nom, payload);
      await rafraichirEnAttente();
      setHorsLigneEnvoi(true);
      setEnvoye(true);
      setEnvoiEnCours(false);
      return;
    }

    try {
      await soumettrePointJournalier(ferme.id, payload);
      setHorsLigneEnvoi(false);
      setEnvoye(true);
      await chargerFermes();
    } catch (err) {
      if (!err.response) {
        // Pas de réponse serveur = coupure réseau pendant l'envoi : on met en file
        // plutôt que d'afficher une erreur, la fiche sera synchronisée plus tard.
        await ajouterSoumissionEnAttente(ferme.id, ferme.nom, payload);
        await rafraichirEnAttente();
        setHorsLigneEnvoi(true);
        setEnvoye(true);
      } else {
        setErreur(err.response?.data?.detail || "Erreur lors de l'envoi. Réessayez.");
      }
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function handleDeclarerBande() {
    if (!declaration.effectif_initial) return;
    await declarerBande(ferme.id, declaration);
    await chargerFermes();
  }

  if (chargement) return <div style={styles.page}><p style={{ padding: 20 }}>Chargement...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.headTop}>
            <img src="/logo.png" alt="Volailles de l'Est" style={styles.logo} />
            <label style={styles.datePick}>
              <Calendar size={14} />
              <input type="date" value={dateJour} max={todayISO()} onChange={(e) => { setDateJour(e.target.value); setEnvoye(false); setHorsLigneEnvoi(false); }} style={styles.dateInput} />
            </label>
          </div>
          <h1 style={styles.title}>Point Journalier</h1>
          {nomChef && (
            <div style={styles.chefRow}>
              {photoChef && <img src={photoChef} alt={nomChef} style={styles.chefPhoto} />}
              <p style={styles.chefNom}>{nomChef}</p>
            </div>
          )}
          <div style={styles.selectWrap}>
            <button style={styles.select} onClick={() => setOpenFerme((o) => !o)}>
              <span><strong style={{ fontWeight: 600 }}>{ferme?.nom}</strong>
                <span style={styles.selectSub}> · {ferme?.nombre_chambres} chambres · {ferme?.type === "PONTE" ? "Pondeuses" : "Chair"}</span></span>
              <ChevronDown size={18} style={{ transform: openFerme ? "rotate(180deg)" : "none", transition: ".2s" }} />
            </button>
            {openFerme && (
              <div style={styles.dropdown}>
                {fermes.map((f) => (
                  <button key={f.id} style={{ ...styles.option, ...(f.id === fermeId ? styles.optionActive : {}) }}
                    onClick={() => { setFermeId(f.id); setOpenFerme(false); reset(); setEnvoye(false); setHorsLigneEnvoi(false); }}>
                    <span>{f.nom}</span>
                    <span style={styles.optionMeta}>{f.est_vide ? "vide" : `${f.nombre_chambres} ch.`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {bande && (
            <div style={styles.ageRow}>
              <div style={styles.ageBox}>
                <span style={styles.ageLabel}>Âge de la bande</span>
                <span style={styles.ageVal}>{bande.age.label} <span style={styles.ageUnit}>· {bande.age.valeur} {bande.age.unite}</span></span>
              </div>
              <span style={styles.ageAuto}>auto · {dateAffiche}</span>
            </div>
          )}
        </header>

        {(!enLigne || enAttenteCount > 0) && (
          <div style={styles.offlineBanner}>
            {!enLigne ? <WifiOff size={14} /> : <RefreshCw size={14} />}
            <span>
              {!enLigne
                ? "Hors-ligne — vos saisies seront synchronisées automatiquement au retour du réseau"
                : `${enAttenteCount} fiche(s) en attente de synchronisation`}
            </span>
          </div>
        )}

        {ferme?.est_vide && (
          <div style={styles.vide}>
            <div style={styles.videIcon}>🐣</div>
            <p style={styles.videTitre}>Aucune bande en place</p>
            {peutDeclarerBande() ? (
              <>
                <p style={styles.videTxt}>{ferme.nom} est actuellement vide. Déclarez une mise en place pour activer le point journalier.</p>
                <input style={styles.input} type="date" value={declaration.date_mise_en_place}
                  onChange={(e) => setDeclaration((d) => ({ ...d, date_mise_en_place: e.target.value }))} />
                <input style={{ ...styles.input, marginTop: 8 }} type="number" placeholder="Effectif de départ"
                  value={declaration.effectif_initial}
                  onChange={(e) => setDeclaration((d) => ({ ...d, effectif_initial: e.target.value }))} />
                <button style={{ ...styles.videBtn, marginTop: 14 }} onClick={handleDeclarerBande}>+ Déclarer une bande</button>
              </>
            ) : (
              <p style={styles.videTxt}>{ferme.nom} est actuellement vide. Seule la direction peut déclarer une nouvelle bande.</p>
            )}
          </div>
        )}

        {ferme && !ferme.est_vide && calc && <>
          <Section icon={<Skull size={15} />} titre="Cheptel">
            <FieldNum label="Morts" value={form.morts} onChange={(v) => set("morts", v)} unit="sujets" />
            <FieldCalc label="Reste (effectif)" value={calc.resteEffectif.toLocaleString("fr-FR")} unit="sujets" hint="report veille − morts" />
            {mortsAlerte && <Alerte txt="Mortalité élevée — vérifier la cause" />}
          </Section>

          <Section icon={<Wheat size={15} />} titre="Aliment & traitement">
            {ferme.magasin.nom !== `Magasin ${ferme.nom}` && (
              <p style={styles.magasinNote}>📦 Stock partagé — {ferme.magasin.nom}</p>
            )}
            <FieldNum label="Conso aliment" value={form.conso_aliment_sacs} onChange={(v) => set("conso_aliment_sacs", v)} unit="sacs" step="0.1" />
            <FieldNum label="Aliment reçu" value={form.aliment_recu_sacs} onChange={(v) => set("aliment_recu_sacs", v)} unit="sacs" step="0.1" />
            <FieldText label="Traitement" value={form.traitement} onChange={(v) => set("traitement", v)} placeholder="ex. MAXI LAYER (1000L)" />
            <FieldNum label="Eau consommée" value={form.eau_consommee_litres} onChange={(v) => set("eau_consommee_litres", v)} unit="litres" step="0.1" />
            <FieldCalc label="Stock aliment restant" value={formatSacs(calc.stockAlimentSacs)}
              unit={`≈ ${Math.round(calc.stockAlimentSacs * 50).toLocaleString("fr-FR")} kg`}
              hint="report + reçu − conso" strong danger={alimentAlerte} />
            {alimentAlerte && <Alerte txt={`Stock aliment bas (seuil ${magasin.seuil_alerte_aliment_sacs} sacs) — prévoir la fabrication`} />}
          </Section>

          {ferme.type === "PONTE" && (
            <Section icon={<Package size={15} />} titre="Alvéoles">
              <FieldNum label="Alvéole reçu" value={form.alveole_recu_unites} onChange={(v) => set("alveole_recu_unites", v)} unit="unités" />
              <FieldCalc label="Conso alvéoles (auto)" value={calc.alveoleConsoAuto.toLocaleString("fr-FR")} unit="unités" hint="production ÷ 30" />
              <FieldCalc label="Stock alvéole restant" value={formatColis(calc.stockAlveole)}
                unit={`≈ ${calc.stockAlveole.toLocaleString("fr-FR")} unités`}
                hint="report + reçu − conso auto" strong danger={alveoleAlerte} />
              {alveoleAlerte && <Alerte txt={`Stock alvéole bas (seuil ${formatColis(magasin.seuil_alerte_alveoles_unites)}) — réapprovisionner`} />}
            </Section>
          )}

          {ferme.type === "PONTE" && (
            <Section icon={<Egg size={15} />} titre="Production œufs">
              <FieldNum label="Production" value={form.production_oeufs} onChange={(v) => set("production_oeufs", v)} unit="œufs" big />
              <div style={styles.row2}>
                <FieldNum label="Cassé" value={form.casse} onChange={(v) => set("casse", v)} unit="œufs" />
                <FieldNum label="Brisé" value={form.brise} onChange={(v) => set("brise", v)} unit="œufs" />
              </div>
              <FieldCalc label="Stock du jour" value={calc.stockOeufJour.toLocaleString("fr-FR")} unit="œufs" hint="prod − cassé − brisé" />
            </Section>
          )}

          {ferme.type === "PONTE" && (
            <Section icon={<Egg size={15} />} titre="Sorties d'œufs">
              {sorties.length > 0 && (
                <div style={styles.sortieList}>
                  {sorties.map((s, i) => (
                    <div key={i} style={styles.sortieRow}>
                      <span style={styles.sortieType}>{s.type_sortie === "VENTE" ? "Vente" : "Don"}</span>
                      <span style={styles.sortieDetail}>{s.quantite.toLocaleString("fr-FR")} œufs — {s.responsable}</span>
                      <button type="button" style={styles.sortieRemove} onClick={() => retirerSortie(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.sortieForm}>
                <div style={styles.row2}>
                  <input type="number" inputMode="numeric" style={styles.input} placeholder="Quantité"
                    value={nouvelleSortie.quantite}
                    onChange={(e) => setNouvelleSortie((s) => ({ ...s, quantite: e.target.value }))} />
                  <select style={styles.input} value={nouvelleSortie.type_sortie}
                    onChange={(e) => setNouvelleSortie((s) => ({ ...s, type_sortie: e.target.value }))}>
                    <option value="VENTE">Vente</option>
                    <option value="DON">Don</option>
                  </select>
                </div>
                <input type="text" style={styles.input} placeholder="Responsable de la sortie"
                  value={nouvelleSortie.responsable}
                  onChange={(e) => setNouvelleSortie((s) => ({ ...s, responsable: e.target.value }))} />
                <button type="button" style={styles.sortieAddBtn} onClick={ajouterSortie}>+ Ajouter cette sortie</button>
              </div>
              <FieldCalc label="Total sorties" value={totalSorties.toLocaleString("fr-FR")} unit="œufs" hint={`${sorties.length} sortie(s) enregistrée(s)`} />
              <FieldCalc label="Stock total œuf" value={calc.stockTotal.toLocaleString("fr-FR")} unit="œufs" hint="report + stock jour − sorties" strong />
            </Section>
          )}

          {ferme.type === "PONTE" && (
            <div style={{ ...styles.tauxCard, ...(tauxAlerte ? styles.tauxCardAlerte : {}) }}>
              <div style={styles.tauxLeft}><TrendingUp size={18} /><span>Taux de ponte</span></div>
              <div style={styles.tauxVal}>{n(form.production_oeufs) > 0 ? calc.tauxPonte.toFixed(1) : "—"}<span style={{ fontSize: 16 }}>%</span></div>
            </div>
          )}
          {tauxAlerte && <Alerte txt="Taux de ponte sous 60 % — anomalie à investiguer" />}
          {ferme.type === "PONTE" && bande.age.valeur >= AGE_REFORME_SEMAINES && (
            <Alerte txt={`Bande en âge de réforme (${bande.age.label}) — à suivre de près`} />
          )}

          <Section titre="Observation">
            <textarea style={styles.textarea} rows={2} value={form.observation} onChange={(e) => set("observation", e.target.value)} placeholder="Remarques du jour…" />
          </Section>

          {erreur && <p style={{ color: CLAY, textAlign: "center", fontSize: 13, margin: "10px 16px 0" }}>{erreur}</p>}
          <button style={{ ...styles.submit, ...(envoye ? styles.submitDone : {}) }} onClick={handleSubmit} disabled={envoiEnCours}>
            {envoye
              ? (<><Check size={18} /> {horsLigneEnvoi ? "Enregistré (hors-ligne)" : "Envoyé au serveur"}</>)
              : envoiEnCours ? "Envoi..." : "Valider et transmettre"}
          </button>
          {envoye && (
            <>
              <p style={styles.synced}>
                {horsLigneEnvoi
                  ? `Enregistré localement · ${ferme.nom} · ${dateAffiche} — sera synchronisé dès le retour du réseau`
                  : `Données ${ferme.nom} · ${dateAffiche} synchronisées avec le tableau de bord central`}
              </p>
              <button style={styles.pdfBtn} onClick={() => telechargerPdf(
                genererPdfPointJournalier({ ferme, bande, dateJour, form, calc, sorties, totalSorties }),
                `point-journalier-${ferme.nom.replace(/\s+/g, "-")}-${dateJour}.pdf`
              )}>
                <Download size={17} /> Télécharger le PDF
              </button>
              {partageDisponible && (
                <button style={styles.pdfBtn} onClick={() => partagerPdf(
                  genererPdfPointJournalier({ ferme, bande, dateJour, form, calc, sorties, totalSorties }),
                  `point-journalier-${ferme.nom.replace(/\s+/g, "-")}-${dateJour}.pdf`
                )}>
                  <Share2 size={17} /> Partager
                </button>
              )}
            </>
          )}
        </>}
        <p style={styles.foot}>Volailles de l'Est</p>
      </div>
    </div>
  );
}

function Section({ icon, titre, children }) {
  return (<section style={styles.section}><div style={styles.sectionHead}>{icon}<span>{titre}</span></div><div style={styles.sectionBody}>{children}</div></section>);
}
function FieldNum({ label, value, onChange, unit, big, step }) {
  return (<label style={styles.field}><span style={styles.fieldLabel}>{label}</span><div style={styles.inputWrap}>
    <input type="number" inputMode="decimal" step={step || "1"} style={{ ...styles.input, ...(big ? { fontSize: 22, fontWeight: 700 } : {}) }}
      value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />{unit && <span style={styles.unit}>{unit}</span>}</div></label>);
}
function FieldText({ label, value, onChange, placeholder }) {
  return (<label style={styles.field}><span style={styles.fieldLabel}>{label}</span>
    <input type="text" style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>);
}
function FieldCalc({ label, value, unit, hint, strong, danger }) {
  return (<div style={{ ...styles.field, ...styles.fieldCalc, ...(danger ? styles.fieldCalcDanger : {}) }}>
    <span style={styles.fieldLabel}>{label} <span style={{ ...styles.autoTag, ...(danger ? { background: CLAY } : {}) }}>auto</span></span>
    <div style={{ ...styles.calcVal, ...(danger ? { color: CLAY } : {}) }}>
      <span style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 20 : 17 }}>{value}</span>
      {unit && <span style={styles.unit}>{unit}</span>}</div>{hint && <span style={styles.hint}>{hint}</span>}</div>);
}
function Alerte({ txt }) { return <div style={styles.alerte}><AlertTriangle size={15} /><span>{txt}</span></div>; }

const styles = {
  page: { minHeight: "100vh", background: "#EDEAE0", fontFamily: "'Inter', sans-serif", padding: "0 0 40px", color: INK },
  shell: { maxWidth: 440, margin: "0 auto", background: CREAM, minHeight: "100vh", boxShadow: "0 0 60px rgba(0,0,0,.08)" },
  header: { background: `linear-gradient(160deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, color: "#fff", padding: "18px 20px 20px", borderRadius: "0 0 22px 22px" },
  headTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 40, width: 40, borderRadius: 9, objectFit: "cover", background: "rgba(255,255,255,.16)" },
  datePick: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.16)", padding: "6px 11px", borderRadius: 9, color: "#fff", cursor: "pointer" },
  dateInput: { background: "none", border: "none", color: "#fff", fontSize: 13, fontFamily: "inherit", colorScheme: "dark", cursor: "pointer" },
  title: { fontWeight: 700, fontSize: 27, margin: "14px 0 0", letterSpacing: -.5 },
  chefRow: { display: "flex", alignItems: "center", gap: 8, margin: "4px 0 16px" },
  chefPhoto: { width: 24, height: 24, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(255,255,255,.5)" },
  chefNom: { fontSize: 13, opacity: .85, margin: 0 },
  selectWrap: { position: "relative" },
  select: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", padding: "13px 16px", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
  selectSub: { opacity: .8, fontWeight: 400, fontSize: 13 },
  dropdown: { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.22)", zIndex: 20, overflow: "hidden", padding: 5 },
  option: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "none", background: "none", color: INK, fontSize: 15, cursor: "pointer", borderRadius: 8, fontFamily: "inherit" },
  optionActive: { background: "#EAF3EE", color: GREEN_DARK, fontWeight: 600 },
  optionMeta: { fontSize: 13, color: "#7A857F" },
  ageRow: { marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.12)", borderRadius: 11, padding: "10px 14px" },
  ageBox: { display: "flex", flexDirection: "column", gap: 2 },
  ageLabel: { fontSize: 11, opacity: .8, textTransform: "uppercase", letterSpacing: .6 },
  ageVal: { fontSize: 19, fontWeight: 700 },
  ageUnit: { fontSize: 13, fontWeight: 400, opacity: .85 },
  ageAuto: { fontSize: 11, opacity: .8, textAlign: "right" },
  section: { padding: "0 16px", marginTop: 18 },
  sectionHead: { display: "flex", alignItems: "center", gap: 7, color: GREEN_DARK, fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", letterSpacing: .7, marginBottom: 9 },
  sectionBody: { background: "#fff", borderRadius: 14, padding: "6px 14px", border: "1px solid #ECE9DF" },
  field: { display: "flex", flexDirection: "column", padding: "11px 0", borderBottom: "1px solid #F2F0E8" },
  fieldCalc: { background: "linear-gradient(90deg,#F4F9F6,transparent)", margin: "0 -14px", padding: "11px 14px" },
  fieldCalcDanger: { background: "linear-gradient(90deg,#FCEEE8,transparent)" },
  fieldLabel: { fontSize: 13.5, color: "#5A655F", fontWeight: 500, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 },
  autoTag: { fontSize: 9.5, background: GREEN, color: "#fff", padding: "1px 6px", borderRadius: 5, fontWeight: 600, letterSpacing: .5, textTransform: "uppercase" },
  inputWrap: { display: "flex", alignItems: "center", gap: 8 },
  input: { flex: 1, border: "1px solid #DDE2DE", borderRadius: 9, padding: "10px 12px", fontSize: 16, fontFamily: "inherit", width: "100%", background: "#FCFCFA", color: INK },
  unit: { fontSize: 12.5, color: "#95A09A", whiteSpace: "nowrap", fontWeight: 500 },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  calcVal: { display: "flex", alignItems: "baseline", gap: 6, color: GREEN_DARK },
  hint: { fontSize: 11, color: "#A0A89F", marginTop: 3, fontStyle: "italic" },
  textarea: { width: "100%", border: "1px solid #DDE2DE", borderRadius: 9, padding: "10px 12px", fontSize: 15, fontFamily: "inherit", resize: "vertical", background: "#FCFCFA", color: INK },
  tauxCard: { margin: "18px 16px 0", background: `linear-gradient(135deg,${GREEN} 0%,${GREEN_DARK} 100%)`, color: "#fff", borderRadius: 16, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  tauxCardAlerte: { background: `linear-gradient(135deg,${CLAY} 0%,#9E4527 100%)` },
  tauxLeft: { display: "flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 500 },
  tauxVal: { fontWeight: 700, fontSize: 34 },
  alerte: { margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", padding: "10px 13px", borderRadius: 10, fontSize: 13, fontWeight: 500 },
  submit: { margin: "22px 16px 0", width: "calc(100% - 32px)", background: GREEN, color: "#fff", border: "none", borderRadius: 13, padding: "16px", fontSize: 16, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  submitDone: { background: GREEN_DARK },
  synced: { textAlign: "center", fontSize: 12.5, color: GREEN_DARK, margin: "10px 16px 0" },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12.5, fontWeight: 500, padding: "9px 16px", margin: "14px 16px 0", borderRadius: 10 },
  pdfBtn: { margin: "10px 16px 0", width: "calc(100% - 32px)", background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 13, padding: "13px", fontSize: 14.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  foot: { textAlign: "center", fontSize: 11, color: "#B5BBB2", margin: "24px 0 0", letterSpacing: .5 },
  vide: { margin: "28px 16px 0", background: "#fff", border: "1px dashed #C9CFC8", borderRadius: 16, padding: "34px 24px", textAlign: "center" },
  videIcon: { fontSize: 40, marginBottom: 8 },
  videTitre: { fontWeight: 700, fontSize: 18, color: INK, margin: "0 0 8px" },
  videTxt: { fontSize: 13.5, color: "#6B756E", lineHeight: 1.5, margin: "0 0 20px" },
  videBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 11, padding: "12px 22px", fontSize: 14.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%" },
  magasinNote: { fontSize: 12, color: GREEN_DARK, background: "#EAF3EE", borderRadius: 8, padding: "7px 11px", margin: "6px 0 2px", fontWeight: 500 },
  sortieList: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 0 4px" },
  sortieRow: { display: "flex", alignItems: "center", gap: 8, background: "#F4F9F6", borderRadius: 9, padding: "8px 10px" },
  sortieType: { fontSize: 11, fontWeight: 700, color: GREEN_DARK, background: "#fff", borderRadius: 6, padding: "2px 7px", textTransform: "uppercase" },
  sortieDetail: { flex: 1, fontSize: 13, color: INK },
  sortieRemove: { border: "none", background: "none", color: CLAY, cursor: "pointer", fontSize: 14, padding: "0 2px" },
  sortieForm: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 0" },
  sortieAddBtn: { background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 9, padding: "10px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
};
