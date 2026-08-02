import { creerMouvementEquipement, creerReceptionEquipement } from "../api/client";
import { listerMaterielEnAttente, marquerErreurMateriel, supprimerMaterielEnAttente } from "./queueMateriel";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserMaterielEnAttente = creerSynchroniseur({
  lister: listerMaterielEnAttente,
  supprimer: supprimerMaterielEnAttente,
  marquerErreur: marquerErreurMateriel,
  executer: (item) => (item.type === "reception" ? creerReceptionEquipement(item.payload) : creerMouvementEquipement(item.payload)),
});
