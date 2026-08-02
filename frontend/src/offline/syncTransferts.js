import { creerTransfertEquipement, creerTransfertStock } from "../api/client";
import { listerTransfertsEnAttente, marquerErreurTransfert, supprimerTransfertEnAttente } from "./queueTransferts";
import { creerSynchroniseur } from "./syncGenerique";

export const synchroniserTransfertsEnAttente = creerSynchroniseur({
  lister: listerTransfertsEnAttente,
  supprimer: supprimerTransfertEnAttente,
  marquerErreur: marquerErreurTransfert,
  executer: (item) => (item.type === "stock" ? creerTransfertStock(item.payload) : creerTransfertEquipement(item.payload)),
});
