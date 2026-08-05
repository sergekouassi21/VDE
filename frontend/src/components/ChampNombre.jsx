// Champ de saisie numérique adapté à un clavier français sur téléphone.
//
// Pourquoi pas `type="number"` : sur un clavier configuré en français, le
// séparateur décimal est la VIRGULE. Or un <input type="number"> considère
// « 2,5 » comme invalide et renvoie une chaîne VIDE via e.target.value —
// sans message, sans indice. Le chef de ferme voit son champ se vider quand
// il saisit « 2,5 sacs » et n'a aucun moyen de comprendre pourquoi. C'est le
// cas sur les deux champs les plus utilisés de l'appli (conso d'aliment et
// eau consommée du Point Journalier).
//
// `type="text"` + `inputMode` conserve le clavier numérique sur téléphone,
// accepte la virgule, la convertit en point pour le serveur, et refuse
// simplement les frappes non numériques au lieu de vider le champ. Ça évite
// aussi qu'un coup de molette au-dessus du champ modifie une valeur déjà
// saisie, ce que fait `type="number"` sur ordinateur.
//
// `onChange` reçoit directement la CHAÎNE saisie (pas l'événement) — même
// contrat que FieldNum dans PointJournalier.

export default function ChampNombre({ value, onChange, decimal = false, ...props }) {
  const motif = decimal ? /^\d*[.,]?\d*$/ : /^\d*$/;

  function surSaisie(e) {
    const saisi = e.target.value;
    // Frappe invalide : on l'ignore, le champ garde sa valeur précédente.
    if (saisi !== "" && !motif.test(saisi)) return;
    onChange(decimal ? saisi.replace(",", ".") : saisi);
  }

  return (
    <input
      {...props}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={value ?? ""}
      onChange={surSaisie}
    />
  );
}
