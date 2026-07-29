// Les selfies pris directement par l'appareil photo du téléphone peuvent
// peser plusieurs Mo (voire dizaines de Mo) en pleine résolution — les
// envoyer tels quels a fait planter la validation du pointage sur certains
// téléphones ("Mémoire insuffisante", cf. conversation du 29/07/2026 avec
// Serge). On les recompresse en petit JPEG côté client avant l'envoi : la
// photo ne sert qu'à identifier visuellement la personne, pas besoin de la
// pleine résolution.
export function comprimerImage(fichier, { maxDimension = 900, qualite = 0.7 } = {}) {
  return new Promise((resolve) => {
    if (!fichier || !fichier.type?.startsWith("image/")) {
      resolve(fichier);
      return;
    }
    const nettoyer = (bitmap) => { try { bitmap.close?.(); } catch { /* ignore */ } };

    createImageBitmap(fichier)
      .then((bitmap) => {
        const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const largeur = Math.max(1, Math.round(bitmap.width * ratio));
        const hauteur = Math.max(1, Math.round(bitmap.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = largeur;
        canvas.height = hauteur;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
        nettoyer(bitmap);
        canvas.toBlob(
          (blob) => resolve(blob || fichier),
          "image/jpeg",
          qualite,
        );
      })
      .catch(() => resolve(fichier));
  });
}
