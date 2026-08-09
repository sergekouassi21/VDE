import { useState, useEffect, useMemo, useCallback } from "react";
import { Trash2, Wheat } from "lucide-react";
import { getFermes, getFournisseurs, getCommandesAliment, creerCommandeAliment, supprimerCommandeAliment } from "../api/client";
import { GREEN, GREEN_DARK, INK, CLAY, TEXTE_DOUX, TEXTE_GRIS, FOND_PAGE, FOND_PAGE_ALT, ALERTE } from "../theme";
import ChampNombre from "../components/ChampNombre";
import MagasinsStock from "../components/MagasinsStock";

const todayISO = () => new Date().toISOString().slice(0, 10);
const separeMilliers = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (v) => `${separeMilliers(Number(v) || 0)} F`;

const FORM_VIDE = { magasin: "", fournisseur_nom: "", fournisseur_telephone: "", date: todayISO(), quantite_sacs: "", prix_unitaire_sac: "" };

export default function AchatsAliment() {
  const [fermes, setFermes] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [magasinFiltre, setMagasinFiltre] = useState("");
  const [form, setForm] = useState(FORM_VIDE);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const magasins = useMemo(() => {
    const parId = new Map();
    fermes.forEach((f) => { if (f.magasin) parId.set(f.magasin.id, f.magasin); });
    return [...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [fermes]);

  useEffect(() => {
    getFermes().then((data) => {
      setFermes(data);
      setForm((f) => (f.magasin ? f : { ...f, magasin: data[0]?.magasin?.id ?? "" }));
    });
    getFournisseurs().then(setFournisseurs);
  }, []);

  const rafraichir = useCallback(() => {
    setChargement(true);
    let annule = false;
    getCommandesAliment(magasinFiltre ? { magasin: magasinFiltre } : {}).then((data) => {
      if (annule) return;
      setCommandes(data);
      setChargement(false);
    });
    return () => { annule = true; };
  }, [magasinFiltre]);

  // Empêche une réponse obsolète (changement rapide de filtre pendant le
  // chargement) d'écraser un state plus récent — cf. audit du 30/07/2026.
  useEffect(() => rafraichir(), [rafraichir]);

  const montantForm = (Number(form.quantite_sacs) || 0) * (Number(form.prix_unitaire_sac) || 0);

  const totaux = useMemo(() => ({
    sacs: commandes.reduce((s, c) => s + Number(c.quantite_sacs), 0),
    montant: commandes.reduce((s, c) => s + Number(c.montant_total), 0),
  }), [commandes]);

  async function soumettre(e) {
    e.preventDefault();
    if (!form.magasin || !form.fournisseur_nom.trim() || !form.quantite_sacs || !form.prix_unitaire_sac) return;
    setEnvoi(true);
    setErreur("");
    try {
      await creerCommandeAliment({
        magasin: form.magasin,
        fournisseur_nom: form.fournisseur_nom.trim(),
        fournisseur_telephone: form.fournisseur_telephone.trim(),
        date: form.date,
        quantite_sacs: form.quantite_sacs,
        prix_unitaire_sac: form.prix_unitaire_sac,
      });
      setForm((f) => ({ ...FORM_VIDE, magasin: f.magasin, date: f.date }));
      getFournisseurs().then(setFournisseurs);
      rafraichir();
    } catch {
      setErreur("Impossible d'enregistrer cette commande.");
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(c) {
    if (!window.confirm(`Supprimer la commande de ${c.quantite_sacs} sacs auprès de ${c.fournisseur_nom} du ${new Date(c.date).toLocaleDateString("fr-FR")} ?`)) return;
    await supprimerCommandeAliment(c.id);
    rafraichir();
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.head}>
          <div style={styles.eyebrow}>Volailles de l'Est · Direction</div>
          <h1 style={styles.h1}>Achats d'aliment</h1>
        </header>

        {/* Le stock d'abord : c'est ce qu'on vient verifier avant de commander,
            et c'est la qu'on corrige un ecart constate. */}
        <MagasinsStock />

        <form style={styles.formCard} onSubmit={soumettre}>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Magasin</span>
              <select style={styles.input} value={form.magasin} onChange={(e) => setForm({ ...form, magasin: e.target.value })} required>
                <option value="">Sélectionner...</option>
                {magasins.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Fournisseur</span>
              <input style={styles.input} list="fournisseurs-list" placeholder="Nom du fournisseur" value={form.fournisseur_nom}
                onChange={(e) => setForm({ ...form, fournisseur_nom: e.target.value })} required />
              <datalist id="fournisseurs-list">{fournisseurs.map((f) => <option key={f.id} value={f.nom} />)}</datalist>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Téléphone (optionnel)</span>
              <input style={styles.input} value={form.fournisseur_telephone} onChange={(e) => setForm({ ...form, fournisseur_telephone: e.target.value })} />
            </label>
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date</span>
              <input style={styles.input} type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Quantité (sacs)</span>
              <ChampNombre decimal style={styles.input} value={form.quantite_sacs} onChange={(v) => setForm({ ...form, quantite_sacs: v })} required />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Prix unitaire (F/sac)</span>
              <input style={styles.input} type="number" min="0" step="1" value={form.prix_unitaire_sac} onChange={(e) => setForm({ ...form, prix_unitaire_sac: e.target.value })} required />
            </label>
            <div style={styles.field}>
              <span style={styles.fieldLabel}>Montant total</span>
              <div style={styles.montantPreview}>{fcfa(montantForm)}</div>
            </div>
          </div>
          {erreur && <p style={styles.erreur}>{erreur}</p>}
          <button style={styles.submitBtn} type="submit" disabled={envoi}>{envoi ? "Enregistrement..." : "Enregistrer la commande"}</button>
        </form>

        <div style={styles.filters}>
          <select style={styles.select} value={magasinFiltre} onChange={(e) => setMagasinFiltre(e.target.value)}>
            <option value="">Tous les magasins</option>
            {magasins.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </div>

        {commandes.length > 0 && (
          <div style={styles.totaux}>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total sacs</span><span style={styles.totalValeur}>{totaux.sacs.toFixed(2)}</span></div>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Total dépensé</span><span style={styles.totalValeur}>{fcfa(totaux.montant)}</span></div>
            <div style={styles.totalItem}><span style={styles.totalLabel}>Prix moyen</span><span style={styles.totalValeur}>{fcfa(totaux.montant / totaux.sacs)}/sac</span></div>
          </div>
        )}

        <section style={styles.card}>
          {chargement ? (
            <p style={styles.empty}>Chargement...</p>
          ) : commandes.length === 0 ? (
            <p style={styles.empty}>Aucune commande enregistrée.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Magasin</th>
                    <th style={styles.th}>Fournisseur</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Quantité</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Prix unitaire</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Montant</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((c) => (
                    <tr key={c.id}>
                      <td style={styles.td}>{new Date(c.date).toLocaleDateString("fr-FR")}</td>
                      <td style={styles.td}>{c.magasin_nom}</td>
                      <td style={styles.td}>{c.fournisseur_nom}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{Number(c.quantite_sacs).toFixed(2)} sacs</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{fcfa(c.prix_unitaire_sac)}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: GREEN_DARK }}>{fcfa(c.montant_total)}</td>
                      <td style={{ ...styles.td, width: 1 }}>
                        <button style={styles.iconBtn} onClick={() => supprimer(c)} title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={styles.note}>
          <Wheat size={13} style={{ verticalAlign: -2 }} /> Ces commandes servent au suivi des achats et au calcul du prix réel du sac dans la vue Rentabilité.
          Elles n'affectent pas le stock — le stock est mis à jour séparément via le champ « Aliment reçu » du Point Journalier.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: FOND_PAGE_ALT, fontFamily: "inherit", color: INK, padding: "0 0 30px" },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px" },
  head: { marginBottom: 20 },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -.5 },
  formCard: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: TEXTE_GRIS, flex: "1 1 160px" },
  fieldLabel: { fontSize: 12 },
  input: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", fontSize: 14, fontFamily: "inherit", color: INK },
  montantPreview: { padding: "9px 12px", borderRadius: 10, background: FOND_PAGE, fontSize: 14, fontWeight: 700, color: GREEN_DARK },
  submitBtn: { alignSelf: "flex-start", background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  erreur: { color: ALERTE, fontSize: 12.5, margin: 0 },
  filters: { display: "flex", gap: 10, marginBottom: 16 },
  select: { padding: "9px 12px", borderRadius: 10, border: "1px solid #DAD5C7", background: "#fff", fontSize: 14, fontFamily: "inherit", color: INK },
  totaux: { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  totalItem: { background: "#fff", borderRadius: 14, border: "1px solid #ECE9DF", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 2 },
  totalLabel: { fontSize: 12, color: TEXTE_DOUX, textTransform: "uppercase", letterSpacing: .5 },
  totalValeur: { fontSize: 18, fontWeight: 700, color: GREEN_DARK },
  card: { background: "#fff", borderRadius: 16, border: "1px solid #ECE9DF", overflow: "hidden" },
  empty: { padding: 24, textAlign: "center", color: TEXTE_DOUX, fontSize: 14, margin: 0 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: .5, color: TEXTE_DOUX, borderBottom: "1px solid #ECE9DF", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F2F0E8", color: INK, whiteSpace: "nowrap" },
  iconBtn: { background: FOND_PAGE, border: "1px solid #ECE9DF", borderRadius: 8, padding: 6, cursor: "pointer", color: CLAY, display: "flex" },
  note: { fontSize: 12, color: TEXTE_DOUX, marginTop: 14, lineHeight: 1.5 },
};
