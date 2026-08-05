import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Trash2, Syringe, AlertTriangle, List, Calendar, ChevronLeft, ChevronRight, WifiOff, Stethoscope, ShieldCheck } from "lucide-react";
import {
  getFermes, getEvenementsSante, creerEvenementSante, supprimerEvenementSante, marquerFaitEvenementSante,
  getVisitesTechniques, creerVisiteTechnique, supprimerVisiteTechnique,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";
import { ajouterEvenementFaitEnAttente, listerEvenementsFaitsEnAttente } from "../offline/queueVaccinations";
import { synchroniserEvenementsFaitsEnAttente } from "../offline/syncVaccinations";
import { estDirectionOuAdmin, estTechnicien } from "../utils/auth";

const todayISO = () => new Date().toISOString().slice(0, 10);
const FORM_VIDE = { type: "VACCIN", nom: "", date_prevue: todayISO(), notes: "" };

const LABEL_STATUT = { EN_RETARD: "En retard", A_VENIR: "À venir", FAIT: "Fait" };
const COULEUR_STATUT = { EN_RETARD: CLAY, A_VENIR: GREEN_DARK, FAIT: "#8A948D" };

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Grille de biosécurité — 12 critères fixes, chacun noté 0 (non respecté) à
// 2 (bien respecté), confirmée avec Serge le 05/08/2026. Les deux derniers
// (oiseaux sauvages, véhicules) ajoutés sur avis vétérinaire — vecteurs
// majeurs de grippe aviaire/Newcastle, souvent plus à risque que le seul
// pédiluve piéton déjà couvert par "Désinfection à l'entrée".
const CRITERES_BIOSECURITE = [
  { cle: "desinfection_entree", label: "Désinfection / pédiluve à l'entrée" },
  { cle: "cloture_acces", label: "Clôture / accès restreint au site" },
  { cle: "registre_visiteurs", label: "Registre des visiteurs tenu" },
  { cle: "equipement_dedie", label: "Tenue/équipement dédié (bottes, blouse)" },
  { cle: "lutte_nuisibles", label: "Lutte contre les nuisibles" },
  { cle: "gestion_cadavres", label: "Gestion des cadavres" },
  { cle: "qualite_eau", label: "Qualité de l'eau d'abreuvement" },
  { cle: "vide_sanitaire", label: "Vide sanitaire respecté entre bandes" },
  { cle: "stockage_aliment", label: "Stockage de l'aliment à l'abri" },
  { cle: "proprete_batiment", label: "Propreté du bâtiment/litière" },
  { cle: "protection_oiseaux_sauvages", label: "Protection contre oiseaux sauvages/animaux errants" },
  { cle: "desinfection_vehicules", label: "Désinfection des véhicules à l'entrée" },
];
const LABEL_NOTE = { 0: "Non respecté", 1: "Partiel", 2: "Bien respecté" };
const FORM_VIDE_VISITE = {
  visiteur_nom: "", date: todayISO(), observations: "", recommandations: "",
  ...Object.fromEntries(CRITERES_BIOSECURITE.map((c) => [c.cle, 0])),
};

// Date locale au format ISO (pas toISOString, qui bascule en UTC et peut
// décaler d'un jour selon le fuseau) — les cases du calendrier doivent
// correspondre exactement au jour affiché.
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Début de semaine = lundi (convention française), pour que la grille du
// mois s'aligne avec les en-têtes Lun...Dim.
function debutSemaine(d) {
  const decalage = (d.getDay() + 6) % 7;
  const r = new Date(d);
  r.setDate(d.getDate() - decalage);
  return r;
}

// Grille complète du mois affiché : du lundi de la semaine du 1er au
// dimanche de la semaine du dernier jour, pour ne jamais couper une semaine
// à moitié.
function genererGrilleMois(mois) {
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
  const debut = debutSemaine(premier);
  const fin = debutSemaine(dernier);
  fin.setDate(fin.getDate() + 6);
  const jours = [];
  const cur = new Date(debut);
  while (cur <= fin) {
    jours.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return jours;
}

export default function Vaccinations() {
  // Seuls le technicien/vétérinaire et la Direction/Admin peuvent noter une
  // visite — chef de ferme et sous-chef sont en lecture seule sur cet
  // onglet (même restriction côté backend, cf. VisiteTechniqueViewSet).
  // Conversation du 05/08/2026 avec Serge.
  const peutNoterVisite = estTechnicien() || estDirectionOuAdmin();
  const [fermes, setFermes] = useState([]);
  const [fermeId, setFermeId] = useState("");
  const [evenements, setEvenements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [vue, setVue] = useState("calendrier");
  const [mois, setMois] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [jourSelectionne, setJourSelectionne] = useState(null);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [enAttenteCount, setEnAttenteCount] = useState(0);
  const [visites, setVisites] = useState([]);
  const [chargementVisites, setChargementVisites] = useState(true);
  const [formVisiteOuvert, setFormVisiteOuvert] = useState(false);
  const [formVisite, setFormVisite] = useState(FORM_VIDE_VISITE);
  const [erreurVisite, setErreurVisite] = useState("");
  const [envoiVisite, setEnvoiVisite] = useState(false);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerEvenementsFaitsEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  useEffect(() => {
    getFermes().then((data) => {
      setFermes(data);
      setFermeId((id) => id || data.find((f) => f.bande_active)?.id || "");
    });
  }, []);

  const rafraichir = useCallback(() => {
    if (!fermeId) { setEvenements([]); setChargement(false); return () => {}; }
    setChargement(true);
    let annule = false;
    getEvenementsSante({ ferme: fermeId }).then((data) => {
      if (annule) return;
      setEvenements(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, [fermeId]);

  // Empêche une réponse obsolète (changement rapide de ferme pendant le
  // chargement) d'écraser un state plus récent — cf. audit du 30/07/2026.
  useEffect(() => rafraichir(), [rafraichir]);

  const rafraichirVisites = useCallback(() => {
    if (!fermeId) { setVisites([]); setChargementVisites(false); return () => {}; }
    setChargementVisites(true);
    let annule = false;
    getVisitesTechniques({ ferme: fermeId }).then((data) => {
      if (annule) return;
      setVisites(data);
      setChargementVisites(false);
    });
    return () => { annule = true; };
  }, [fermeId]);

  useEffect(() => rafraichirVisites(), [rafraichirVisites]);

  // Même câblage hors-ligne que Point Journalier (offline/sync.js) — dépend
  // de `rafraichir` (qui dépend lui-même de fermeId), donc réabonné à chaque
  // changement de ferme pour ne jamais rafraîchir la mauvaise sélection
  // après une synchronisation. Cf. conversation du 02/08/2026 avec Serge.
  useEffect(() => {
    rafraichirEnAttente();
    const synchroniser = () => synchroniserEvenementsFaitsEnAttente(() => { rafraichirEnAttente(); rafraichir(); });
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
  }, [rafraichirEnAttente, rafraichir]);

  const ferme = fermes.find((f) => f.id === Number(fermeId));
  const bande = ferme?.bande_active;

  const groupes = useMemo(() => ({
    enRetard: evenements.filter((e) => e.statut === "EN_RETARD"),
    aVenir: evenements.filter((e) => e.statut === "A_VENIR"),
    faits: evenements.filter((e) => e.statut === "FAIT"),
  }), [evenements]);

  const evenementsParDate = useMemo(() => {
    const m = {};
    evenements.forEach((e) => { (m[e.date_prevue] ||= []).push(e); });
    return m;
  }, [evenements]);

  async function soumettre(e) {
    e.preventDefault();
    if (!form.nom.trim() || !bande) return;
    setEnvoi(true);
    setErreur("");
    try {
      await creerEvenementSante({ bande: bande.id, type: form.type, nom: form.nom.trim(), date_prevue: form.date_prevue, notes: form.notes });
      setForm(FORM_VIDE);
      setFormOuvert(false);
      rafraichir();
    } catch {
      setErreur("Impossible d'enregistrer cet évènement.");
    } finally {
      setEnvoi(false);
    }
  }

  async function marquerFait(e) {
    if (!navigator.onLine) {
      try {
        await ajouterEvenementFaitEnAttente(e.id);
        rafraichirEnAttente();
      } catch {
        window.alert("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
      }
      return;
    }
    try {
      await marquerFaitEvenementSante(e.id);
      rafraichir();
    } catch (err) {
      if (!err.response) {
        try {
          await ajouterEvenementFaitEnAttente(e.id);
          rafraichirEnAttente();
        } catch {
          window.alert("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
        }
      } else {
        window.alert("Impossible de marquer cet évènement comme fait.");
      }
    }
  }

  async function supprimer(e) {
    if (!window.confirm(`Supprimer « ${e.nom} » du calendrier ?`)) return;
    await supprimerEvenementSante(e.id);
    rafraichir();
  }

  async function soumettreVisite(e) {
    e.preventDefault();
    if (!formVisite.visiteur_nom.trim() || !bande) return;
    setEnvoiVisite(true);
    setErreurVisite("");
    try {
      await creerVisiteTechnique({ bande: bande.id, ...formVisite, visiteur_nom: formVisite.visiteur_nom.trim() });
      setFormVisite(FORM_VIDE_VISITE);
      setFormVisiteOuvert(false);
      rafraichirVisites();
    } catch {
      setErreurVisite("Impossible d'enregistrer cette visite.");
    } finally {
      setEnvoiVisite(false);
    }
  }

  async function supprimerVisite(v) {
    if (!window.confirm(`Supprimer la visite du ${new Date(v.date).toLocaleDateString("fr-FR")} ?`)) return;
    await supprimerVisiteTechnique(v.id);
    rafraichirVisites();
  }

  const evenementsDuJour = jourSelectionne ? (evenementsParDate[jourSelectionne] || []) : [];

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Santé</div>
          <h1 style={styles.h1}>Vaccins & traitements</h1>
        </header>

        {(!enLigne || enAttenteCount > 0) && (
          <div style={styles.offlineBanner}>
            <WifiOff size={14} />
            <span>
              {!enLigne
                ? "Hors-ligne — vos validations seront synchronisées automatiquement au retour du réseau"
                : `${enAttenteCount} validation(s) en attente de synchronisation`}
            </span>
          </div>
        )}

        <div style={styles.filters}>
          <select style={styles.select} value={fermeId} onChange={(e) => { setFermeId(e.target.value); setJourSelectionne(null); }}>
            <option value="">Sélectionner une ferme...</option>
            {fermes.map((f) => <option key={f.id} value={f.id} disabled={!f.bande_active}>{f.nom}{!f.bande_active ? " (vide)" : ""}</option>)}
          </select>
          <div style={styles.vueToggle}>
            <button style={{ ...styles.vueBtn, ...(vue === "calendrier" ? styles.vueBtnOn : {}) }} onClick={() => setVue("calendrier")}>
              <Calendar size={14} /> Calendrier
            </button>
            <button style={{ ...styles.vueBtn, ...(vue === "liste" ? styles.vueBtnOn : {}) }} onClick={() => setVue("liste")}>
              <List size={14} /> Liste
            </button>
            <button style={{ ...styles.vueBtn, ...(vue === "visites" ? styles.vueBtnOn : {}) }} onClick={() => setVue("visites")}>
              <Stethoscope size={14} /> Visites
            </button>
          </div>
          {bande && vue !== "visites" && (
            <button style={styles.addBtn} onClick={() => setFormOuvert((o) => !o)}>
              <Syringe size={15} /> Ajouter un évènement
            </button>
          )}
          {bande && vue === "visites" && peutNoterVisite && (
            <button style={styles.addBtn} onClick={() => setFormVisiteOuvert((o) => !o)}>
              <Stethoscope size={15} /> Ajouter une visite
            </button>
          )}
        </div>

        {formOuvert && vue !== "visites" && (
          <form style={styles.formCard} onSubmit={soumettre}>
            <select style={styles.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="VACCIN">Vaccin</option>
              <option value="TRAITEMENT">Traitement</option>
            </select>
            <input style={styles.input} placeholder="Nom (ex: Newcastle, Déparasitage...)" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            <input style={styles.input} type="date" value={form.date_prevue} onChange={(e) => setForm({ ...form, date_prevue: e.target.value })} required />
            <input style={styles.input} placeholder="Notes (optionnel)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {erreur && <p style={styles.erreur}>{erreur}</p>}
            <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Enregistrement..." : "Ajouter"}</button>
          </form>
        )}

        {formVisiteOuvert && vue === "visites" && peutNoterVisite && (
          <form style={{ ...styles.formCard, flexDirection: "column", alignItems: "stretch" }} onSubmit={soumettreVisite}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* Sélection explicite de la ferme concernée par la visite,
                  plutôt que de dépendre implicitement du sélecteur de ferme
                  en haut de page — cf. conversation du 05/08/2026 avec
                  Serge : "la notation est par ferme, il faut qu'il
                  sélectionne la ferme concernée". */}
              <select style={styles.input} value={fermeId} onChange={(e) => { setFermeId(e.target.value); setJourSelectionne(null); }} required>
                <option value="">Ferme concernée...</option>
                {fermes.filter((f) => f.bande_active).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
              <input style={styles.input} placeholder="Nom du technicien/vétérinaire" value={formVisite.visiteur_nom} onChange={(e) => setFormVisite({ ...formVisite, visiteur_nom: e.target.value })} required />
              <input style={styles.input} type="date" value={formVisite.date} onChange={(e) => setFormVisite({ ...formVisite, date: e.target.value })} required />
            </div>
            <textarea style={{ ...styles.input, flex: "1 1 100%", minHeight: 60, resize: "vertical" }} placeholder="Observations" value={formVisite.observations} onChange={(e) => setFormVisite({ ...formVisite, observations: e.target.value })} />
            <textarea style={{ ...styles.input, flex: "1 1 100%", minHeight: 60, resize: "vertical" }} placeholder="Recommandations" value={formVisite.recommandations} onChange={(e) => setFormVisite({ ...formVisite, recommandations: e.target.value })} />
            <div style={styles.grilleCriteres}>
              {CRITERES_BIOSECURITE.map((c) => (
                <label key={c.cle} style={styles.critereLigne}>
                  <span style={styles.critereLabel}>{c.label}</span>
                  <select
                    style={styles.critereSelect}
                    value={formVisite[c.cle]}
                    onChange={(e) => setFormVisite({ ...formVisite, [c.cle]: Number(e.target.value) })}
                  >
                    <option value={0}>0 · {LABEL_NOTE[0]}</option>
                    <option value={1}>1 · {LABEL_NOTE[1]}</option>
                    <option value={2}>2 · {LABEL_NOTE[2]}</option>
                  </select>
                </label>
              ))}
            </div>
            {erreurVisite && <p style={styles.erreur}>{erreurVisite}</p>}
            <button style={{ ...styles.submitBtn, alignSelf: "flex-start" }} type="submit" disabled={envoiVisite}>{envoiVisite ? "Enregistrement..." : "Enregistrer la visite"}</button>
          </form>
        )}

        {!bande ? (
          <p style={styles.empty}>{fermeId ? "Cette ferme n'a pas de bande active." : "Sélectionne une ferme."}</p>
        ) : vue === "visites" ? (
          chargementVisites ? (
            <p style={styles.empty}>Chargement...</p>
          ) : (
            <Section titre="Historique des visites" icon={<ShieldCheck size={15} color={GREEN_DARK} />}>
              {visites.length === 0 ? <p style={styles.empty}>Aucune visite enregistrée.</p> :
                visites.map((v) => <LigneVisite key={v.id} visite={v} onSupprimer={peutNoterVisite ? supprimerVisite : undefined} />)}
            </Section>
          )
        ) : chargement ? (
          <p style={styles.empty}>Chargement...</p>
        ) : vue === "calendrier" ? (
          <>
            <CalendrierMois
              mois={mois}
              onMoisChange={(m) => { setMois(m); setJourSelectionne(null); }}
              evenementsParDate={evenementsParDate}
              jourSelectionne={jourSelectionne}
              onSelectJour={setJourSelectionne}
            />
            {jourSelectionne && (
              <Section titre={`${new Date(jourSelectionne).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`}>
                {evenementsDuJour.map((e) => (
                  <Ligne key={e.id} evenement={e} onFait={e.statut !== "FAIT" ? marquerFait : undefined} onSupprimer={supprimer} fait={e.statut === "FAIT"} />
                ))}
              </Section>
            )}
          </>
        ) : (
          <>
            {groupes.enRetard.length > 0 && (
              <Section titre="En retard" icon={<AlertTriangle size={15} color={CLAY} />}>
                {groupes.enRetard.map((e) => <Ligne key={e.id} evenement={e} onFait={marquerFait} onSupprimer={supprimer} />)}
              </Section>
            )}
            <Section titre="À venir">
              {groupes.aVenir.length === 0 ? <p style={styles.empty}>Rien de prévu.</p> :
                groupes.aVenir.map((e) => <Ligne key={e.id} evenement={e} onFait={marquerFait} onSupprimer={supprimer} />)}
            </Section>
            {groupes.faits.length > 0 && (
              <Section titre="Réalisés">
                {groupes.faits.map((e) => <Ligne key={e.id} evenement={e} onSupprimer={supprimer} fait />)}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CalendrierMois({ mois, onMoisChange, evenementsParDate, jourSelectionne, onSelectJour }) {
  const jours = useMemo(() => genererGrilleMois(mois), [mois]);
  const moisCourant = mois.getMonth();
  const aujourdhui = todayISO();

  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={styles.calNav}>
        <button style={styles.navBtn} onClick={() => onMoisChange(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}>
          <ChevronLeft size={16} />
        </button>
        <span style={styles.calMoisLabel}>
          {mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase())}
        </span>
        <button style={styles.navBtn} onClick={() => onMoisChange(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}>
          <ChevronRight size={16} />
        </button>
        <button style={styles.ajourdhuiBtn} onClick={() => { const d = new Date(); d.setDate(1); onMoisChange(d); }}>
          Aujourd'hui
        </button>
      </div>
      <div style={styles.calGrilleEntetes}>
        {JOURS_SEMAINE.map((j) => <div key={j} style={styles.calEntete}>{j}</div>)}
      </div>
      <div style={styles.calGrille}>
        {jours.map((jour) => {
          const iso = isoLocal(jour);
          const evenementsJour = evenementsParDate[iso] || [];
          const horsMois = jour.getMonth() !== moisCourant;
          const estAujourdhui = iso === aujourdhui;
          const selectionne = iso === jourSelectionne;
          return (
            <button
              key={iso}
              type="button"
              style={{
                ...styles.calJour,
                ...(horsMois ? styles.calJourHorsMois : {}),
                ...(estAujourdhui ? styles.calJourAujourdhui : {}),
                ...(selectionne ? styles.calJourSelectionne : {}),
              }}
              onClick={() => onSelectJour(evenementsJour.length ? iso : null)}
            >
              <span style={styles.calJourNum}>{jour.getDate()}</span>
              {evenementsJour.length > 0 && (
                <div style={styles.calPastilles}>
                  {evenementsJour.slice(0, 3).map((e) => (
                    <span key={e.id} style={{ ...styles.calPastille, background: COULEUR_STATUT[e.statut] }} title={e.nom} />
                  ))}
                  {evenementsJour.length > 3 && <span style={styles.calPlus}>+{evenementsJour.length - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Section({ titre, icon, children }) {
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={styles.resumeHead}>{icon}<span>{titre}</span></div>
      <div style={styles.liste}>{children}</div>
    </section>
  );
}

function Ligne({ evenement: e, onFait, onSupprimer, fait }) {
  return (
    <div style={styles.ligne}>
      <div style={styles.ligneInfo}>
        <span style={styles.ligneNom}>{e.nom}</span>
        <span style={styles.ligneMeta}>
          {e.type === "VACCIN" ? "Vaccin" : "Traitement"} · prévu le {new Date(e.date_prevue).toLocaleDateString("fr-FR")}
          {e.date_realisee && ` · fait le ${new Date(e.date_realisee).toLocaleDateString("fr-FR")}`}
          {e.notes && ` · ${e.notes}`}
        </span>
      </div>
      <span style={{ ...styles.badge, color: COULEUR_STATUT[e.statut] }}>{LABEL_STATUT[e.statut]}</span>
      {!fait && onFait && (
        <button style={{ ...styles.iconBtn, color: GREEN }} title="Marquer fait" onClick={() => onFait(e)}><Check size={14} /></button>
      )}
      <button style={{ ...styles.iconBtn, color: CLAY }} title="Supprimer" onClick={() => onSupprimer(e)}><Trash2 size={14} /></button>
    </div>
  );
}

function LigneVisite({ visite: v, onSupprimer }) {
  const couleur = v.score_biosecurite / v.score_biosecurite_max >= 0.75 ? GREEN_DARK : v.score_biosecurite / v.score_biosecurite_max >= 0.5 ? "#B08B2E" : CLAY;
  return (
    <div style={{ ...styles.ligne, alignItems: "flex-start" }}>
      <div style={styles.ligneInfo}>
        <span style={styles.ligneNom}>{v.visiteur_nom} · {new Date(v.date).toLocaleDateString("fr-FR")}</span>
        {v.observations && <span style={styles.ligneMeta}>Observations : {v.observations}</span>}
        {v.recommandations && <span style={styles.ligneMeta}>Recommandations : {v.recommandations}</span>}
      </div>
      <span style={{ ...styles.badge, color: couleur }}>{v.score_biosecurite}/{v.score_biosecurite_max}</span>
      {onSupprimer && (
        <button style={{ ...styles.iconBtn, color: CLAY }} title="Supprimer" onClick={() => onSupprimer(v)}><Trash2 size={14} /></button>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 800, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12.5, fontWeight: 500, padding: "9px 16px", marginBottom: 14, borderRadius: 10 },
  filters: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: INK },
  vueToggle: { display: "flex", gap: 4, background: "#ECE9DF", borderRadius: 10, padding: 3 },
  vueBtn: { display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#8A948D", border: "none", borderRadius: 8, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  vueBtnOn: { background: "#fff", color: GREEN_DARK, boxShadow: "0 1px 3px rgba(18,61,38,.12)" },
  addBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: GREEN_DARK, border: `1.5px solid ${GREEN}`, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginLeft: "auto" },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK, flex: "1 1 160px" },
  submitBtn: { background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: 0, width: "100%" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  resumeHead: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", fontSize: 13, fontWeight: 600, color: GREEN_DARK, borderBottom: "1px solid #ECE9DF" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  liste: { display: "flex", flexDirection: "column" },
  ligne: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F2F0E8" },
  ligneInfo: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  ligneNom: { fontSize: 13.5, fontWeight: 600, color: INK },
  ligneMeta: { fontSize: 11.5, color: "#8A948D" },
  badge: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .3, whiteSpace: "nowrap" },
  iconBtn: { background: "#F4F1EA", border: "1px solid #ECE9DF", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex" },
  calNav: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #ECE9DF" },
  navBtn: { background: "#F4F1EA", border: "1px solid #ECE9DF", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex", color: INK },
  calMoisLabel: { fontSize: 14.5, fontWeight: 700, color: GREEN_DARK, minWidth: 150, textAlign: "center" },
  ajourdhuiBtn: { marginLeft: "auto", background: "transparent", border: `1px solid ${GREEN}`, color: GREEN_DARK, borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  calGrilleEntetes: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #ECE9DF" },
  calEntete: { textAlign: "center", fontSize: 11, fontWeight: 700, color: "#8A948D", padding: "8px 0", textTransform: "uppercase", letterSpacing: .3 },
  calGrille: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
  calJour: {
    aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
    background: "#fff", border: "none", borderRight: "1px solid #F2F0E8", borderBottom: "1px solid #F2F0E8",
    cursor: "pointer", fontFamily: "inherit", padding: 4, minWidth: 0,
  },
  calJourHorsMois: { background: "#FAF9F5", color: "#C7C2B4" },
  calJourAujourdhui: { background: "#EAF2EC" },
  calJourSelectionne: { boxShadow: `inset 0 0 0 2px ${GREEN}` },
  calJourNum: { fontSize: 12.5, fontWeight: 600 },
  calPastilles: { display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  calPastille: { width: 6, height: 6, borderRadius: "50%" },
  calPlus: { fontSize: 9, fontWeight: 700, color: "#8A948D" },
  grilleCriteres: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, background: "#FAF9F5", border: "1px solid #ECE9DF", borderRadius: 10, padding: 12 },
  critereLigne: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  critereLabel: { fontSize: 12, color: INK, flex: 1 },
  critereSelect: { padding: "5px 8px", borderRadius: 8, border: "1px solid #DAD5C7", fontSize: 11.5, fontFamily: "inherit", color: INK, background: "#fff" },
};
