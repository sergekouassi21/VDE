import { useState, useEffect, useCallback, useMemo } from "react";
import { Pencil, Check, X, Wrench, Plus, Trash2, ArrowLeftRight, WifiOff } from "lucide-react";
import {
  getInventaireEquipement, modifierInventaireEquipement,
  getReceptionsEquipement, creerReceptionEquipement, modifierReceptionEquipement, supprimerReceptionEquipement,
  getMouvementsEquipement, creerMouvementEquipement, modifierMouvementEquipement, supprimerMouvementEquipement,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY } from "../theme";
import { estDirectionOuAdmin } from "../utils/auth";
import { ajouterMaterielEnAttente, listerMaterielEnAttente } from "../offline/queueMateriel";
import { synchroniserMaterielEnAttente } from "../offline/syncMateriel";

const todayISO = () => new Date().toISOString().slice(0, 10);
const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");

const LABEL_EQUIPEMENT = { MANGEOIRES: "Mangeoires", ABREUVOIRS: "Abreuvoirs" };

const CHAMPS = ["bon_etat", "gate", "reserve", "jete"];
const LABEL_CHAMP = { bon_etat: "Bon état", gate: "Gâté", reserve: "Réserve", jete: "Jeté" };
const LABEL_ETAT = { BON_ETAT: "Bon état", GATE: "Gâté", RESERVE: "Réserve", JETE: "Jeté" };

// Les boutons Gâté/Réserve/Jeté retirent toujours du Bon état ; seul le
// bouton Bon état (retour) permet de choisir la provenance (Gâté ou
// Réserve, jamais Jeté — irréversible). Cf. conversation du 02/08/2026.
const TYPES_MOUVEMENT = [
  { valeur: "GATE", label: "Gâté" },
  { valeur: "RESERVE", label: "Réserve" },
  { valeur: "JETE", label: "Jeté" },
  { valeur: "RETOUR", label: "Bon état" },
];
const LABEL_ACTION_MOUVEMENT = {
  GATE: "Marquer comme gâté", RESERVE: "Mettre en réserve", JETE: "Jeter", RETOUR: "Remettre en bon état",
};

const FORM_VIDE_RECEPTION = { date: todayISO(), ferme: "", type_equipement: "MANGEOIRES", quantite: "", observation: "" };
const FORM_VIDE_MOUVEMENT = { date: todayISO(), ferme: "", type_equipement: "MANGEOIRES", provenance: "GATE", quantite: "", observation: "" };

// Même règle que les transferts : un chef corrige librement le jour même,
// au-delà c'est réservé à la Direction (cf. conversation du 31/07/2026).
function peutModifier(r) {
  return estDirectionOuAdmin() || r.date === todayISO();
}

export default function StockMateriel() {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({});
  const [envoi, setEnvoi] = useState(false);

  const [receptions, setReceptions] = useState([]);
  const [chargementReceptions, setChargementReceptions] = useState(true);
  const [formReception, setFormReception] = useState(FORM_VIDE_RECEPTION);
  const [erreurReception, setErreurReception] = useState("");
  const [envoiReception, setEnvoiReception] = useState(false);
  const [editionReception, setEditionReception] = useState(null);
  const [brouillonReception, setBrouillonReception] = useState({ quantite: "", observation: "" });
  const [envoiEditionReception, setEnvoiEditionReception] = useState(false);

  const [typeMouvement, setTypeMouvement] = useState("GATE");
  const [formMouvement, setFormMouvement] = useState(FORM_VIDE_MOUVEMENT);
  const [mouvements, setMouvements] = useState([]);
  const [chargementMouvements, setChargementMouvements] = useState(true);
  const [erreurMouvement, setErreurMouvement] = useState("");
  const [envoiMouvement, setEnvoiMouvement] = useState(false);
  const [editionMouvement, setEditionMouvement] = useState(null);
  const [brouillonMouvement, setBrouillonMouvement] = useState({ quantite: "", observation: "" });
  const [envoiEditionMouvement, setEnvoiEditionMouvement] = useState(false);

  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [enAttenteCount, setEnAttenteCount] = useState(0);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerMaterielEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  // Même câblage hors-ligne que Point Journalier (offline/sync.js), cf.
  // conversation du 02/08/2026 avec Serge.
  useEffect(() => {
    rafraichirEnAttente();
    const synchroniser = () => synchroniserMaterielEnAttente(() => rafraichirEnAttente());
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
  }, [rafraichirEnAttente]);

  const rafraichir = useCallback(() => {
    setChargement(true);
    let annule = false;
    getInventaireEquipement().then((data) => {
      if (annule) return;
      setLignes(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, []);

  const rafraichirReceptions = useCallback(() => {
    setChargementReceptions(true);
    let annule = false;
    getReceptionsEquipement().then((data) => {
      if (annule) return;
      setReceptions(data);
      setChargementReceptions(false);
    });
    return () => { annule = true; };
  }, []);

  const rafraichirMouvements = useCallback(() => {
    setChargementMouvements(true);
    let annule = false;
    getMouvementsEquipement().then((data) => {
      if (annule) return;
      setMouvements(data);
      setChargementMouvements(false);
    });
    return () => { annule = true; };
  }, []);

  useEffect(() => rafraichir(), [rafraichir]);
  useEffect(() => rafraichirReceptions(), [rafraichirReceptions]);
  useEffect(() => rafraichirMouvements(), [rafraichirMouvements]);

  const fermes = useMemo(() => {
    const vues = new Map();
    lignes.forEach((l) => vues.set(l.ferme, l.ferme_nom));
    return Array.from(vues, ([id, nom]) => ({ id, nom }));
  }, [lignes]);

  useEffect(() => {
    setFormReception((f) => (f.ferme ? f : { ...f, ferme: fermes[0]?.id ?? "" }));
    setFormMouvement((f) => (f.ferme ? f : { ...f, ferme: fermes[0]?.id ?? "" }));
  }, [fermes]);

  function commencerEdition(ligne) {
    setEdition(ligne.id);
    setBrouillon({
      bon_etat: String(ligne.bon_etat), gate: String(ligne.gate),
      reserve: String(ligne.reserve), jete: String(ligne.jete),
    });
    setErreur("");
  }

  async function enregistrerEdition(id) {
    setEnvoi(true);
    setErreur("");
    try {
      await modifierInventaireEquipement(id, {
        bon_etat: Number(brouillon.bon_etat) || 0, gate: Number(brouillon.gate) || 0,
        reserve: Number(brouillon.reserve) || 0, jete: Number(brouillon.jete) || 0,
      });
      setEdition(null);
      rafraichir();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible d'enregistrer ces valeurs.");
    } finally {
      setEnvoi(false);
    }
  }

  async function soumettreReception(e) {
    e.preventDefault();
    if (!formReception.ferme || !formReception.quantite) return;
    setEnvoiReception(true);
    setErreurReception("");
    const payload = {
      date: formReception.date, ferme: formReception.ferme, type_equipement: formReception.type_equipement,
      quantite: formReception.quantite, observation: formReception.observation,
    };
    if (!navigator.onLine) {
      try {
        await ajouterMaterielEnAttente("reception", payload);
        rafraichirEnAttente();
        setFormReception((f) => ({ ...FORM_VIDE_RECEPTION, ferme: f.ferme, date: f.date }));
      } catch {
        setErreurReception("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
      } finally {
        setEnvoiReception(false);
      }
      return;
    }
    try {
      await creerReceptionEquipement(payload);
      setFormReception((f) => ({ ...FORM_VIDE_RECEPTION, ferme: f.ferme, date: f.date }));
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      if (!err.response) {
        try {
          await ajouterMaterielEnAttente("reception", payload);
          rafraichirEnAttente();
          setFormReception((f) => ({ ...FORM_VIDE_RECEPTION, ferme: f.ferme, date: f.date }));
        } catch {
          setErreurReception("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
        }
      } else {
        setErreurReception(err.response?.data?.detail || "Impossible d'enregistrer cette réception.");
      }
    } finally {
      setEnvoiReception(false);
    }
  }

  function commencerEditionReception(r) {
    setEditionReception(r.id);
    setBrouillonReception({ quantite: String(r.quantite), observation: r.observation });
  }

  async function enregistrerEditionReception(id) {
    setEnvoiEditionReception(true);
    try {
      await modifierReceptionEquipement(id, {
        quantite: Number(brouillonReception.quantite) || 0, observation: brouillonReception.observation,
      });
      setEditionReception(null);
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de modifier cette réception.");
    } finally {
      setEnvoiEditionReception(false);
    }
  }

  async function supprimerReception(r) {
    if (!window.confirm(`Supprimer cette réception de ${nf(r.quantite)} ${LABEL_EQUIPEMENT[r.type_equipement].toLowerCase()} (${r.ferme_nom}) ?`)) return;
    try {
      await supprimerReceptionEquipement(r.id);
      rafraichirReceptions();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de supprimer cette réception.");
    }
  }

  async function soumettreMouvement(e) {
    e.preventDefault();
    if (!formMouvement.ferme || !formMouvement.quantite) return;
    setEnvoiMouvement(true);
    setErreurMouvement("");
    const etatSource = typeMouvement === "RETOUR" ? formMouvement.provenance : "BON_ETAT";
    const etatDestination = typeMouvement === "RETOUR" ? "BON_ETAT" : typeMouvement;
    const payload = {
      date: formMouvement.date, ferme: formMouvement.ferme, type_equipement: formMouvement.type_equipement,
      etat_source: etatSource, etat_destination: etatDestination,
      quantite: formMouvement.quantite, observation: formMouvement.observation,
    };
    if (!navigator.onLine) {
      try {
        await ajouterMaterielEnAttente("mouvement", payload);
        rafraichirEnAttente();
        setFormMouvement((f) => ({ ...FORM_VIDE_MOUVEMENT, ferme: f.ferme, date: f.date }));
      } catch {
        setErreurMouvement("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
      } finally {
        setEnvoiMouvement(false);
      }
      return;
    }
    try {
      await creerMouvementEquipement(payload);
      setFormMouvement((f) => ({ ...FORM_VIDE_MOUVEMENT, ferme: f.ferme, date: f.date }));
      rafraichirMouvements();
      rafraichir();
    } catch (err) {
      if (!err.response) {
        try {
          await ajouterMaterielEnAttente("mouvement", payload);
          rafraichirEnAttente();
          setFormMouvement((f) => ({ ...FORM_VIDE_MOUVEMENT, ferme: f.ferme, date: f.date }));
        } catch {
          setErreurMouvement("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
        }
      } else {
        setErreurMouvement(err.response?.data?.detail || "Impossible d'enregistrer ce mouvement.");
      }
    } finally {
      setEnvoiMouvement(false);
    }
  }

  function commencerEditionMouvement(m) {
    setEditionMouvement(m.id);
    setBrouillonMouvement({ quantite: String(m.quantite), observation: m.observation });
  }

  async function enregistrerEditionMouvement(id) {
    setEnvoiEditionMouvement(true);
    try {
      await modifierMouvementEquipement(id, {
        quantite: Number(brouillonMouvement.quantite) || 0, observation: brouillonMouvement.observation,
      });
      setEditionMouvement(null);
      rafraichirMouvements();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de modifier ce mouvement.");
    } finally {
      setEnvoiEditionMouvement(false);
    }
  }

  async function supprimerMouvement(m) {
    if (!window.confirm(`Supprimer ce mouvement de ${nf(m.quantite)} (${LABEL_ETAT[m.etat_source]} → ${LABEL_ETAT[m.etat_destination]}, ${m.ferme_nom}) ?`)) return;
    try {
      await supprimerMouvementEquipement(m.id);
      rafraichirMouvements();
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de supprimer ce mouvement.");
    }
  }

  const stockBrouillon = CHAMPS.reduce((acc, c, i) => (i < 3 ? acc + (Number(brouillon[c]) || 0) : acc - (Number(brouillon[c]) || 0)), 0);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Stock</div>
          <h1 style={styles.h1}>Stock de matériel</h1>
          <p style={styles.sous}>Mangeoires et abreuvoirs, par état — stock = bon état + gâté + réserve - jeté.</p>
        </header>

        {(!enLigne || enAttenteCount > 0) && (
          <div style={styles.offlineBanner}>
            <WifiOff size={14} />
            <span>
              {!enLigne
                ? "Hors-ligne — vos réceptions/mouvements seront synchronisés automatiquement au retour du réseau"
                : `${enAttenteCount} enregistrement(s) en attente de synchronisation`}
            </span>
          </div>
        )}

        <form style={styles.formCard} onSubmit={soumettreReception}>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ferme</span>
              <select style={styles.input} value={formReception.ferme} onChange={(e) => setFormReception({ ...formReception, ferme: e.target.value })} required>
                <option value="">Sélectionner...</option>
                {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Type</span>
              <select style={styles.input} value={formReception.type_equipement} onChange={(e) => setFormReception({ ...formReception, type_equipement: e.target.value })}>
                {Object.entries(LABEL_EQUIPEMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date</span>
              <input style={styles.input} type="date" max={todayISO()} value={formReception.date} onChange={(e) => setFormReception({ ...formReception, date: e.target.value })} required />
            </label>
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Quantité reçue</span>
              <input
                style={styles.input} type="number" min="1" step="1"
                value={formReception.quantite} onChange={(e) => setFormReception({ ...formReception, quantite: e.target.value })} required
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Observation (optionnel)</span>
              <input style={styles.input} placeholder="Ex: achat fournisseur X" value={formReception.observation} onChange={(e) => setFormReception({ ...formReception, observation: e.target.value })} />
            </label>
          </div>
          {erreurReception && <p style={styles.erreur}>{erreurReception}</p>}
          <button style={styles.submitBtn} type="submit" disabled={envoiReception}>
            <Plus size={15} /> {envoiReception ? "Enregistrement..." : "Ajouter du matériel reçu"}
          </button>
        </form>

        <form style={styles.formCard} onSubmit={soumettreMouvement}>
          <div style={styles.tabs}>
            {TYPES_MOUVEMENT.map((t) => (
              <button
                key={t.valeur} type="button"
                style={{ ...styles.tab, ...(typeMouvement === t.valeur ? styles.tabOn : {}) }}
                onClick={() => setTypeMouvement(t.valeur)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ferme</span>
              <select style={styles.input} value={formMouvement.ferme} onChange={(e) => setFormMouvement({ ...formMouvement, ferme: e.target.value })} required>
                <option value="">Sélectionner...</option>
                {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Type</span>
              <select style={styles.input} value={formMouvement.type_equipement} onChange={(e) => setFormMouvement({ ...formMouvement, type_equipement: e.target.value })}>
                {Object.entries(LABEL_EQUIPEMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {typeMouvement === "RETOUR" && (
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Provenance</span>
                <select style={styles.input} value={formMouvement.provenance} onChange={(e) => setFormMouvement({ ...formMouvement, provenance: e.target.value })}>
                  <option value="GATE">Gâté</option>
                  <option value="RESERVE">Réserve</option>
                </select>
              </label>
            )}
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date</span>
              <input style={styles.input} type="date" max={todayISO()} value={formMouvement.date} onChange={(e) => setFormMouvement({ ...formMouvement, date: e.target.value })} required />
            </label>
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Quantité</span>
              <input
                style={styles.input} type="number" min="1" step="1"
                value={formMouvement.quantite} onChange={(e) => setFormMouvement({ ...formMouvement, quantite: e.target.value })} required
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Observation (optionnel)</span>
              <input style={styles.input} value={formMouvement.observation} onChange={(e) => setFormMouvement({ ...formMouvement, observation: e.target.value })} />
            </label>
          </div>
          {erreurMouvement && <p style={styles.erreur}>{erreurMouvement}</p>}
          <button style={styles.submitBtn} type="submit" disabled={envoiMouvement}>
            <ArrowLeftRight size={15} /> {envoiMouvement ? "Enregistrement..." : LABEL_ACTION_MOUVEMENT[typeMouvement]}
          </button>
        </form>

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : lignes.length === 0 ? (
            <p style={styles.empty}>Aucune ferme visible.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Type</th>
                    {CHAMPS.map((c) => <th key={c} style={{ ...styles.th, textAlign: "right" }}>{LABEL_CHAMP[c]}</th>)}
                    <th style={{ ...styles.th, textAlign: "right" }}>Stock</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const enEdition = edition === l.id;
                    return (
                      <tr key={l.id}>
                        <td style={styles.td}>{l.ferme_nom}</td>
                        <td style={styles.td}>{LABEL_EQUIPEMENT[l.type_equipement]}</td>
                        {CHAMPS.map((c) => (
                          <td key={c} style={{ ...styles.td, textAlign: "right" }}>
                            {enEdition ? (
                              <input
                                type="number" min="0" style={styles.tableInputNum} value={brouillon[c]}
                                onChange={(e) => setBrouillon((b) => ({ ...b, [c]: e.target.value }))}
                              />
                            ) : nf(l[c])}
                          </td>
                        ))}
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: GREEN_DARK }}>
                          {nf(enEdition ? stockBrouillon : l.stock)}
                        </td>
                        <td style={{ ...styles.td, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {enEdition ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} disabled={envoi} onClick={() => enregistrerEdition(l.id)}><Check size={14} /></button>
                              <button style={styles.actionBtn} disabled={envoi} onClick={() => setEdition(null)}><X size={14} /></button>
                            </div>
                          ) : (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} onClick={() => commencerEdition(l)}><Pencil size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {erreur && <p style={styles.erreur}>{erreur}</p>}

        <h2 style={styles.h2}>Historique des réceptions</h2>
        <section style={styles.card}>
          {chargementReceptions ? (
            <p style={styles.empty}>Chargement...</p>
          ) : receptions.length === 0 ? (
            <p style={styles.empty}>Aucune réception enregistrée.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Type</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                    <th style={styles.th}>Observation</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {receptions.map((r) => {
                    const enEdition = editionReception === r.id;
                    return (
                      <tr key={r.id}>
                        <td style={styles.td}>{new Date(r.date).toLocaleDateString("fr-FR")}</td>
                        <td style={styles.td}>{r.ferme_nom}</td>
                        <td style={styles.td}>{LABEL_EQUIPEMENT[r.type_equipement]}</td>
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>
                          {enEdition ? (
                            <input type="number" style={styles.tableInput} value={brouillonReception.quantite}
                              onChange={(e) => setBrouillonReception((b) => ({ ...b, quantite: e.target.value }))} />
                          ) : `+${nf(r.quantite)}`}
                        </td>
                        <td style={{ ...styles.td, color: "#6B756E" }}>
                          {enEdition ? (
                            <input style={styles.tableInput} value={brouillonReception.observation}
                              onChange={(e) => setBrouillonReception((b) => ({ ...b, observation: e.target.value }))} />
                          ) : (r.observation || "—")}
                        </td>
                        <td style={{ ...styles.td, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {enEdition ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} disabled={envoiEditionReception} onClick={() => enregistrerEditionReception(r.id)}><Check size={14} /></button>
                              <button style={styles.actionBtn} disabled={envoiEditionReception} onClick={() => setEditionReception(null)}><X size={14} /></button>
                            </div>
                          ) : peutModifier(r) ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} onClick={() => commencerEditionReception(r)}><Pencil size={14} /></button>
                              <button style={{ ...styles.actionBtn, color: CLAY }} onClick={() => supprimerReception(r)}><Trash2 size={14} /></button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <h2 style={styles.h2}>Historique des mouvements</h2>
        <section style={styles.card}>
          {chargementMouvements ? (
            <p style={styles.empty}>Chargement...</p>
          ) : mouvements.length === 0 ? (
            <p style={styles.empty}>Aucun mouvement enregistré.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ferme</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Mouvement</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                    <th style={styles.th}>Observation</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map((m) => {
                    const enEdition = editionMouvement === m.id;
                    return (
                      <tr key={m.id}>
                        <td style={styles.td}>{new Date(m.date).toLocaleDateString("fr-FR")}</td>
                        <td style={styles.td}>{m.ferme_nom}</td>
                        <td style={styles.td}>{LABEL_EQUIPEMENT[m.type_equipement]}</td>
                        <td style={styles.td}>{LABEL_ETAT[m.etat_source]} → {LABEL_ETAT[m.etat_destination]}</td>
                        <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>
                          {enEdition ? (
                            <input type="number" style={styles.tableInput} value={brouillonMouvement.quantite}
                              onChange={(e) => setBrouillonMouvement((b) => ({ ...b, quantite: e.target.value }))} />
                          ) : nf(m.quantite)}
                        </td>
                        <td style={{ ...styles.td, color: "#6B756E" }}>
                          {enEdition ? (
                            <input style={styles.tableInput} value={brouillonMouvement.observation}
                              onChange={(e) => setBrouillonMouvement((b) => ({ ...b, observation: e.target.value }))} />
                          ) : (m.observation || "—")}
                        </td>
                        <td style={{ ...styles.td, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {enEdition ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} disabled={envoiEditionMouvement} onClick={() => enregistrerEditionMouvement(m.id)}><Check size={14} /></button>
                              <button style={styles.actionBtn} disabled={envoiEditionMouvement} onClick={() => setEditionMouvement(null)}><X size={14} /></button>
                            </div>
                          ) : peutModifier(m) ? (
                            <div style={styles.actionsRow}>
                              <button style={styles.actionBtn} onClick={() => commencerEditionMouvement(m)}><Pencil size={14} /></button>
                              <button style={{ ...styles.actionBtn, color: CLAY }} onClick={() => supprimerMouvement(m)}><Trash2 size={14} /></button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={styles.note}>
          <Wrench size={13} style={{ verticalAlign: -2 }} /> Une réception ajoute du matériel neuf au bon état ; un mouvement
          recatégorise du matériel déjà en stock (gâté, réserve, jeté ou retour en bon état) sans changer le total. Le tableau
          récapitulatif reste modifiable directement pour une correction ponctuelle. Le bon état est le seul déplacé par les
          transferts d'équipement entre fermes.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F1EEE6", fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  h2: { fontSize: 16, fontWeight: 700, margin: "24px 0 12px", letterSpacing: -.2 },
  sous: { fontSize: 13, color: "#6B756E", margin: "6px 0 0" },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FDEEE8", color: "#9E4527", fontSize: 12.5, fontWeight: 500, padding: "9px 16px", marginBottom: 14, borderRadius: 10 },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 },
  tabs: { display: "flex", gap: 6 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#F4F1EA", border: "1px solid #ECE9DF", color: "#7A857F", padding: "8px 8px", borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" },
  tabOn: { background: GREEN, borderColor: GREEN, color: "#fff", fontWeight: 600 },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#6B756E", flex: "1 1 160px" },
  fieldLabel: { fontSize: 11.5 },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  submitBtn: { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: "#8A948D", fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5, color: "#8A948D", borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  tableInputNum: { width: 70, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK, textAlign: "right" },
  tableInput: { width: "100%", maxWidth: 140, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK },
  actionsRow: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actionBtn: { background: "#F4F1EA", border: "none", color: GREEN_DARK, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  erreur: { color: "#9E4527", fontSize: 12.5, margin: "12px 0 0" },
  note: { fontSize: 12, color: "#8A948D", marginTop: 14, lineHeight: 1.5 },
};
