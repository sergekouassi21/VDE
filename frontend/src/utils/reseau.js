import { useEffect, useState } from "react";

// Suit l'état de la connexion.
//
// navigator.onLine n'est pas une preuve qu'on est en ligne — il indique
// seulement qu'une interface réseau est active, pas qu'Internet répond. Mais
// il est fiable dans l'autre sens : quand il passe à false, on est certain
// d'être hors réseau. C'est précisément le cas qu'on veut signaler, donc
// cette asymétrie ne pose pas de problème ici.
export function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => navigator.onLine);

  useEffect(() => {
    const passerEnLigne = () => setEnLigne(true);
    const passerHorsLigne = () => setEnLigne(false);
    window.addEventListener("online", passerEnLigne);
    window.addEventListener("offline", passerHorsLigne);
    return () => {
      window.removeEventListener("online", passerEnLigne);
      window.removeEventListener("offline", passerHorsLigne);
    };
  }, []);

  return enLigne;
}
