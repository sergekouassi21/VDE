import { useState, useEffect, useCallback } from "react";
import { Trash2, Pencil, Check, X, ArrowRightLeft, Package, Wrench, WifiOff } from "lucide-react";
import {
  getFermes,
  getTransfertsStock, creerTransfertStock, modifierTransfertStock, supprimerTransfertStock,
  getTransfertsEquipement, creerTransfertEquipement, modifierTransfertEquipement, supprimerTransfertEquipement,
  getInventaireEquipement,
} from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, UNITES_PAR_COLIS, TEXTE_DOUX, TEXTE_META, TEXTE_GRIS, FOND_PAGE, FOND_PAGE_ALT, ALERTE, ALERTE_FOND } from "../theme";
import { estDirectionOuAdmin } from "../utils/auth";
import { ajouterTransfertEnAttente, listerTransfertsEnAttente } from "../offline/queueTransferts";
import { synchroniserTransfertsEnAttente } from "../offline/syncTransferts";
import ChampNombre from "../components/ChampNombre";

const todayISO = () => new Date().toISOString().slice(0, 10);
const nf = (v) => (Number(v) || 0).toLocaleString("fr-FR");
// Les alvéoles se saisissent en colis (1 colis = 100 unités, même
// convention que le Point Journalier) — le stock/le transfert restent
// stockés en unités côté serveur, la conversion n'a lieu qu'à l'affichage
// et à la saisie. Cf. conversation du 02/08/2026 avec Serge.
const colisVersUnites = (colis) => Math.round((Number(colis) || 0) * UNITES_PAR_COLIS);
const unitesVersColis = (unites) => (Number(unites) || 0) / UNITES_PAR_COLIS;

const LABEL_TYPE = { ALIMENT: "Aliment", ALVEOLES: "Alvéoles", OEUFS: "Œufs" };
const UNITE_TYPE = { ALIMENT: "sacs", ALVEOLES: "colis", OEUFS: "œufs" };
const STEP_TYPE = { ALIMENT: "0.01", ALVEOLES: "0.1", OEUFS: "1" };

const LABEL_EQUIPEMENT = { MANGEOIRES: "Mangeoires", ABREUVOIRS: "Abreuvoirs" };

const FORM_VIDE = { date: todayISO(), type_transfert: "ALIMENT", ferme_source: "", ferme_destination: "", quantite: "", observation: "" };
const FORM_VIDE_EQUIPEMENT = { date: todayISO(), type_equipement: "MANGEOIRES", ferme_source: "", ferme_destination: "", quantite: "", observation: "" };

// Un chef peut librement modifier/supprimer un transfert du jour même
// (rattrapage) ; au-delà, c'est réservé à Direction/Admin — même règle que
// la correction d'un Point Journalier (cf. conversation du 31/07/2026).
function peutModifier(t) {
  return estDirectionOuAdmin() || t.date === todayISO();
}

export default function Transferts() {
  const [onglet, setOnglet] = useState("stock");
  const [fermes, setFermes] = useState([]);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [enAttenteCount, setEnAttenteCount] = useState(0);

  useEffect(() => {
    getFermes().then(setFermes);
  }, []);

  const rafraichirEnAttente = useCallback(async () => {
    const items = await listerTransfertsEnAttente();
    setEnAttenteCount(items.length);
  }, []);

  // Même câblage hors-ligne que Point Journalier (offline/sync.js) : file
  // d'attente locale rejouée au retour du réseau, cf. conversation du
  // 02/08/2026 avec Serge.
  useEffect(() => {
    rafraichirEnAttente();
    const synchroniser = () => synchroniserTransfertsEnAttente(() => rafraichirEnAttente());
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

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Stock</div>
          <h1 style={styles.h1}>Transferts entre fermes</h1>
        </header>

        {(!enLigne || enAttenteCount > 0) && (
          <div style={styles.offlineBanner}>
            <WifiOff size={14} />
            <span>
              {!enLigne
                ? "Hors-ligne — vos transferts seront synchronisés automatiquement au retour du réseau"
                : `${enAttenteCount} transfert(s) en attente de synchronisation`}
            </span>
          </div>
        )}

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(onglet === "stock" ? styles.tabOn : {}) }} onClick={() => setOnglet("stock")}>
            <Package size={15} /> Stock
          </button>
          <button style={{ ...styles.tab, ...(onglet === "equipement" ? styles.tabOn : {}) }} onClick={() => setOnglet("equipement")}>
            <Wrench size={15} /> Équipement
          </button>
        </div>

        {onglet === "stock" ? (
          <TransfertsStock fermes={fermes} onMiseEnAttente={rafraichirEnAttente} />
        ) : (
          <TransfertsEquipement fermes={fermes} onMiseEnAttente={rafraichirEnAttente} />
        )}
      </div>
    </div>
  );
}

function TransfertsStock({ fermes, onMiseEnAttente }) {
  const [transferts, setTransferts] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({ quantite: "", observation: "" });
  const [envoiEdition, setEnvoiEdition] = useState(false);

  useEffect(() => {
    setForm((f) => (f.ferme_source ? f : { ...f, ferme_source: fermes[0]?.id ?? "" }));
  }, [fermes]);

  const rafraichir = useCallback(() => {
    setChargement(true);
    let annule = false;
    getTransfertsStock().then((data) => {
      if (annule) return;
      setTransferts(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, []);

  // Empêche une réponse obsolète d'écraser un state plus récent — cf. audit du 30/07/2026.
  useEffect(() => rafraichir(), [rafraichir]);

  const fermesDestination = fermes.filter((f) => String(f.id) !== String(form.ferme_source));

  async function soumettre(e) {
    e.preventDefault();
    if (!form.ferme_source || !form.ferme_destination || !form.quantite) return;
    setEnvoi(true);
    setErreur("");
    const payload = {
      date: form.date, type_transfert: form.type_transfert,
      ferme_source: form.ferme_source, ferme_destination: form.ferme_destination,
      quantite: form.type_transfert === "ALVEOLES" ? colisVersUnites(form.quantite) : form.quantite,
      observation: form.observation,
    };
    if (!navigator.onLine) {
      try {
        await ajouterTransfertEnAttente("stock", payload);
        onMiseEnAttente?.();
        setForm((f) => ({ ...FORM_VIDE, ferme_source: f.ferme_source, date: f.date }));
      } catch {
        setErreur("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
      } finally {
        setEnvoi(false);
      }
      return;
    }
    try {
      await creerTransfertStock(payload);
      setForm((f) => ({ ...FORM_VIDE, ferme_source: f.ferme_source, date: f.date }));
      rafraichir();
    } catch (err) {
      if (!err.response) {
        // Pas de réponse serveur = coupure réseau pendant l'envoi : on met
        // en file plutôt que d'afficher une erreur (cf. Point Journalier).
        try {
          await ajouterTransfertEnAttente("stock", payload);
          onMiseEnAttente?.();
          setForm((f) => ({ ...FORM_VIDE, ferme_source: f.ferme_source, date: f.date }));
        } catch {
          setErreur("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
        }
      } else {
        setErreur(err.response?.data?.detail || "Impossible d'enregistrer ce transfert.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  function commencerEdition(t) {
    setEdition(t.id);
    const quantiteAffichee = t.type_transfert === "ALVEOLES" ? unitesVersColis(t.quantite) : t.quantite;
    setBrouillon({ quantite: String(quantiteAffichee), observation: t.observation });
    setErreur("");
  }

  async function enregistrerEdition(id, typeTransfert) {
    setEnvoiEdition(true);
    try {
      const quantite = Number(brouillon.quantite) || 0;
      await modifierTransfertStock(id, {
        quantite: typeTransfert === "ALVEOLES" ? colisVersUnites(quantite) : quantite,
        observation: brouillon.observation,
      });
      setEdition(null);
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de modifier ce transfert.");
    } finally {
      setEnvoiEdition(false);
    }
  }

  async function supprimer(t) {
    const quantiteAffichee = t.type_transfert === "ALVEOLES" ? unitesVersColis(t.quantite) : t.quantite;
    if (!window.confirm(
      `Supprimer ce transfert de ${nf(quantiteAffichee)} ${UNITE_TYPE[t.type_transfert]} (${t.ferme_source_nom} → ${t.ferme_destination_nom}) ?`
    )) return;
    try {
      await supprimerTransfertStock(t.id);
      rafraichir();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de supprimer ce transfert.");
    }
  }

  return (
    <>
      <form style={styles.formCard} onSubmit={soumettre}>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Type</span>
            <select style={styles.input} value={form.type_transfert} onChange={(e) => setForm({ ...form, type_transfert: e.target.value, quantite: "" })}>
              {Object.entries(LABEL_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Date</span>
            <input style={styles.input} type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Ferme source (d'où part le stock)</span>
            <select style={styles.input} value={form.ferme_source} onChange={(e) => setForm({ ...form, ferme_source: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Ferme destination</span>
            <select style={styles.input} value={form.ferme_destination} onChange={(e) => setForm({ ...form, ferme_destination: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {fermesDestination.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </label>
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Quantité ({UNITE_TYPE[form.type_transfert]})</span>
            <ChampNombre
              decimal={STEP_TYPE[form.type_transfert].includes(".")}
              style={styles.input}
              value={form.quantite} onChange={(v) => setForm({ ...form, quantite: v })} required
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Observation (optionnel)</span>
            <input style={styles.input} placeholder="Ex: dépannage stock bas" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} />
          </label>
        </div>
        {erreur && <p style={styles.erreur}>{erreur}</p>}
        <button style={styles.submitBtn} type="submit" disabled={envoi}>
          <ArrowRightLeft size={15} /> {envoi ? "Enregistrement..." : "Enregistrer le transfert"}
        </button>
      </form>

      <section style={styles.card}>
        {chargement ? (
          <p style={styles.empty}>Chargement...</p>
        ) : transferts.length === 0 ? (
          <p style={styles.empty}>Aucun transfert enregistré.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>De</th>
                  <th style={styles.th}>Vers</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                  <th style={styles.th}>Observation</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {transferts.map((t) => {
                  const enEdition = edition === t.id;
                  return (
                    <tr key={t.id}>
                      <td style={styles.td}>{new Date(t.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{LABEL_TYPE[t.type_transfert]}</td>
                      <td style={styles.td}>{t.ferme_source_nom}</td>
                      <td style={styles.td}>{t.ferme_destination_nom}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>
                        {enEdition ? (
                          <input type="number" style={styles.tableInput} value={brouillon.quantite}
                            onChange={(e) => setBrouillon((b) => ({ ...b, quantite: e.target.value }))} />
                        ) : `${nf(t.type_transfert === "ALVEOLES" ? unitesVersColis(t.quantite) : t.quantite)} ${UNITE_TYPE[t.type_transfert]}`}
                      </td>
                      <td style={{ ...styles.td, color: TEXTE_GRIS }}>
                        {enEdition ? (
                          <input style={styles.tableInput} value={brouillon.observation}
                            onChange={(e) => setBrouillon((b) => ({ ...b, observation: e.target.value }))} />
                        ) : (t.observation || "—")}
                      </td>
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        {enEdition ? (
                          <div style={styles.actionsRow}>
                            <button style={styles.actionBtn} disabled={envoiEdition} onClick={() => enregistrerEdition(t.id, t.type_transfert)}><Check size={14} /></button>
                            <button style={styles.actionBtn} disabled={envoiEdition} onClick={() => setEdition(null)}><X size={14} /></button>
                          </div>
                        ) : peutModifier(t) ? (
                          <div style={styles.actionsRow}>
                            <button style={styles.actionBtn} onClick={() => commencerEdition(t)}><Pencil size={14} /></button>
                            <button style={{ ...styles.actionBtn, color: CLAY }} onClick={() => supprimer(t)}><Trash2 size={14} /></button>
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
        <ArrowRightLeft size={13} style={{ verticalAlign: -2 }} /> Un transfert déplace immédiatement le stock de la ferme source vers la ferme destination.
        Corriger ou supprimer un jour déjà passé est réservé à la Direction.
      </p>
    </>
  );
}

function TransfertsEquipement({ fermes, onMiseEnAttente }) {
  const [transferts, setTransferts] = useState([]);
  const [inventaire, setInventaire] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [form, setForm] = useState(FORM_VIDE_EQUIPEMENT);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState(null);
  const [brouillon, setBrouillon] = useState({ quantite: "", observation: "" });
  const [envoiEdition, setEnvoiEdition] = useState(false);

  useEffect(() => {
    setForm((f) => (f.ferme_source ? f : { ...f, ferme_source: fermes[0]?.id ?? "" }));
  }, [fermes]);

  const rafraichir = useCallback(() => {
    setChargement(true);
    let annule = false;
    getTransfertsEquipement().then((data) => {
      if (annule) return;
      setTransferts(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, []);

  const rafraichirInventaire = useCallback(() => {
    getInventaireEquipement().then(setInventaire);
  }, []);

  useEffect(() => rafraichir(), [rafraichir]);
  useEffect(() => rafraichirInventaire(), [rafraichirInventaire]);

  const fermesDestination = fermes.filter((f) => String(f.id) !== String(form.ferme_source));
  const ligneSource = inventaire.find(
    (i) => String(i.ferme) === String(form.ferme_source) && i.type_equipement === form.type_equipement
  );
  const disponible = ligneSource ? ligneSource.bon_etat : null;

  async function soumettre(e) {
    e.preventDefault();
    if (!form.ferme_source || !form.ferme_destination || !form.quantite) return;
    setEnvoi(true);
    setErreur("");
    const payload = {
      date: form.date, type_equipement: form.type_equipement,
      ferme_source: form.ferme_source, ferme_destination: form.ferme_destination,
      quantite: form.quantite, observation: form.observation,
    };
    if (!navigator.onLine) {
      try {
        await ajouterTransfertEnAttente("equipement", payload);
        onMiseEnAttente?.();
        setForm((f) => ({ ...FORM_VIDE_EQUIPEMENT, ferme_source: f.ferme_source, date: f.date }));
      } catch {
        setErreur("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
      } finally {
        setEnvoi(false);
      }
      return;
    }
    try {
      await creerTransfertEquipement(payload);
      setForm((f) => ({ ...FORM_VIDE_EQUIPEMENT, ferme_source: f.ferme_source, date: f.date }));
      rafraichir();
      rafraichirInventaire();
    } catch (err) {
      if (!err.response) {
        try {
          await ajouterTransfertEnAttente("equipement", payload);
          onMiseEnAttente?.();
          setForm((f) => ({ ...FORM_VIDE_EQUIPEMENT, ferme_source: f.ferme_source, date: f.date }));
        } catch {
          setErreur("Impossible d'enregistrer hors-ligne sur cet appareil (stockage plein ou navigation privée).");
        }
      } else {
        setErreur(err.response?.data?.detail || "Impossible d'enregistrer ce transfert.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  function commencerEdition(t) {
    setEdition(t.id);
    setBrouillon({ quantite: String(t.quantite), observation: t.observation });
    setErreur("");
  }

  async function enregistrerEdition(id) {
    setEnvoiEdition(true);
    try {
      await modifierTransfertEquipement(id, { quantite: Number(brouillon.quantite) || 0, observation: brouillon.observation });
      setEdition(null);
      rafraichir();
      rafraichirInventaire();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de modifier ce transfert.");
    } finally {
      setEnvoiEdition(false);
    }
  }

  async function supprimer(t) {
    if (!window.confirm(
      `Supprimer ce transfert de ${nf(t.quantite)} ${LABEL_EQUIPEMENT[t.type_equipement].toLowerCase()} (${t.ferme_source_nom} → ${t.ferme_destination_nom}) ?`
    )) return;
    try {
      await supprimerTransfertEquipement(t.id);
      rafraichir();
      rafraichirInventaire();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Impossible de supprimer ce transfert.");
    }
  }

  return (
    <>
      <form style={styles.formCard} onSubmit={soumettre}>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Type</span>
            <select style={styles.input} value={form.type_equipement} onChange={(e) => setForm({ ...form, type_equipement: e.target.value, quantite: "" })}>
              {Object.entries(LABEL_EQUIPEMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Date</span>
            <input style={styles.input} type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Ferme source (d'où part l'équipement)</span>
            <select style={styles.input} value={form.ferme_source} onChange={(e) => setForm({ ...form, ferme_source: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {fermes.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Ferme destination</span>
            <select style={styles.input} value={form.ferme_destination} onChange={(e) => setForm({ ...form, ferme_destination: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {fermesDestination.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </label>
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Quantité (unités)</span>
            <input
              style={styles.input} type="number" min="1" step="1"
              value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} required
            />
            {disponible !== null && (
              <span style={styles.hint}>Disponible : {nf(disponible)} unités</span>
            )}
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Observation (optionnel)</span>
            <input style={styles.input} placeholder="Ex: équipement neuf ferme B" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} />
          </label>
        </div>
        {erreur && <p style={styles.erreur}>{erreur}</p>}
        <button style={styles.submitBtn} type="submit" disabled={envoi}>
          <ArrowRightLeft size={15} /> {envoi ? "Enregistrement..." : "Enregistrer le transfert"}
        </button>
      </form>

      <section style={styles.card}>
        {chargement ? (
          <p style={styles.empty}>Chargement...</p>
        ) : transferts.length === 0 ? (
          <p style={styles.empty}>Aucun transfert enregistré.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>De</th>
                  <th style={styles.th}>Vers</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                  <th style={styles.th}>Observation</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {transferts.map((t) => {
                  const enEdition = edition === t.id;
                  return (
                    <tr key={t.id}>
                      <td style={styles.td}>{new Date(t.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{LABEL_EQUIPEMENT[t.type_equipement]}</td>
                      <td style={styles.td}>{t.ferme_source_nom}</td>
                      <td style={styles.td}>{t.ferme_destination_nom}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>
                        {enEdition ? (
                          <input type="number" style={styles.tableInput} value={brouillon.quantite}
                            onChange={(e) => setBrouillon((b) => ({ ...b, quantite: e.target.value }))} />
                        ) : `${nf(t.quantite)} unités`}
                      </td>
                      <td style={{ ...styles.td, color: TEXTE_GRIS }}>
                        {enEdition ? (
                          <input style={styles.tableInput} value={brouillon.observation}
                            onChange={(e) => setBrouillon((b) => ({ ...b, observation: e.target.value }))} />
                        ) : (t.observation || "—")}
                      </td>
                      <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                        {enEdition ? (
                          <div style={styles.actionsRow}>
                            <button style={styles.actionBtn} disabled={envoiEdition} onClick={() => enregistrerEdition(t.id)}><Check size={14} /></button>
                            <button style={styles.actionBtn} disabled={envoiEdition} onClick={() => setEdition(null)}><X size={14} /></button>
                          </div>
                        ) : peutModifier(t) ? (
                          <div style={styles.actionsRow}>
                            <button style={styles.actionBtn} onClick={() => commencerEdition(t)}><Pencil size={14} /></button>
                            <button style={{ ...styles.actionBtn, color: CLAY }} onClick={() => supprimer(t)}><Trash2 size={14} /></button>
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
        <Wrench size={13} style={{ verticalAlign: -2 }} /> Un transfert déplace immédiatement l'équipement de la ferme source vers la ferme destination.
        Corriger ou supprimer un jour déjà passé est réservé à la Direction.
      </p>
    </>
  );
}

const styles = {
  page: { minHeight: "100vh", background: FOND_PAGE_ALT, fontFamily: "inherit", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  offlineBanner: { display: "flex", alignItems: "center", gap: 8, background: ALERTE_FOND, color: ALERTE, fontSize: 12.5, fontWeight: 500, padding: "9px 16px", marginBottom: 14, borderRadius: 10 },
  tabs: { display: "flex", gap: 6, marginBottom: 16 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: "1px solid #ECE9DF", color: TEXTE_META, padding: "10px 8px", borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" },
  tabOn: { background: GREEN, borderColor: GREEN, color: "#fff", fontWeight: 600 },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: TEXTE_GRIS, flex: "1 1 160px" },
  fieldLabel: { fontSize: 12 },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 13.5, fontFamily: "inherit", color: INK },
  hint: { fontSize: 12, color: TEXTE_DOUX },
  submitBtn: { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: ALERTE, fontSize: 12.5, margin: 0 },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: TEXTE_DOUX, fontSize: 13.5, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: .5, color: TEXTE_DOUX, borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  tableInput: { width: "100%", maxWidth: 140, border: "1px solid #DDE2DE", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: INK },
  actionsRow: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actionBtn: { background: FOND_PAGE, border: "none", color: GREEN_DARK, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  note: { fontSize: 12, color: TEXTE_DOUX, marginTop: 14, lineHeight: 1.5 },
};
