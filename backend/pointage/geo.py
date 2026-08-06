"""Vérification qu'un pointage a bien été validé sur le lieu de travail.

Le téléphone de pointage transmet sa position à chaque validation. On refuse
le pointage si cette position est connue ET manifestement hors du périmètre
d'une ferme où travaille la personne scannée.

Trois principes, tous choisis pour ne jamais bloquer la paie à tort :

1. Sans position, on accepte et on signale. Sous le toit en tôle d'un
   poulailler, le GPS échoue souvent ; refuser bloquerait l'équipe entière un
   matin de mauvaise réception. La Direction voit ces cas en alerte.
2. Sans périmètre saisi pour la ferme, on accepte sans rien signaler : la
   protection s'active ferme par ferme, à mesure que les positions sont
   capturées sur le terrain.
3. On compare à TOUTES les fermes de l'employé et on retient la plus proche —
   un superviseur qui couvre plusieurs fermes doit pouvoir pointer sur
   chacune d'elles.

Limite à connaître : une position GPS peut être falsifiée sur Android avec
une application dédiée. C'est un garde-fou de bonne foi, pas une preuve
opposable — au même titre que le selfie.
"""

from math import asin, cos, radians, sin, sqrt

RAYON_TERRE_METRES = 6_371_000


def distance_metres(lat1, lon1, lat2, lon2):
    """Distance orthodromique entre deux points (formule de haversine).

    Précision très largement suffisante ici : on compare des distances de
    quelques centaines de mètres, là où l'écart entre haversine et un calcul
    ellipsoïdal se compte en centimètres.
    """
    lat1, lon1, lat2, lon2 = map(lambda v: radians(float(v)), (lat1, lon1, lat2, lon2))
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    return 2 * RAYON_TERRE_METRES * asin(sqrt(a))


def verifier_position(employe, latitude, longitude):
    """Retourne (accepte, hors_perimetre, distance_metres, ferme_la_plus_proche).

    - accepte : False uniquement si la position est connue et hors de TOUS les
      périmètres définis pour les fermes de cet employé.
    - hors_perimetre : mémorisé sur le pointage pour l'alerte de la Direction.
    - distance_metres/ferme : None quand aucune vérification n'a pu être faite.
    """
    if latitude is None or longitude is None:
        return True, False, None, None

    fermes = [f for f in employe.fermes.all() if f.a_un_perimetre]
    if not fermes:
        # Aucune ferme de cet employé n'a encore de périmètre : rien à vérifier.
        return True, False, None, None

    distances = [(distance_metres(latitude, longitude, f.latitude, f.longitude), f) for f in fermes]
    distance, ferme = min(distances, key=lambda couple: couple[0])

    dans_le_perimetre = distance <= ferme.rayon_metres
    return dans_le_perimetre, not dans_le_perimetre, distance, ferme


def lire_position(request):
    """Extrait latitude/longitude du corps de la requête, en tolérant tout.

    Une valeur absente, vide ou illisible est traitée comme « position
    inconnue » plutôt que comme une erreur : côté téléphone, un GPS qui
    n'aboutit pas est un cas courant, pas une anomalie.
    """
    def _lire(nom):
        brut = request.data.get(nom)
        if brut in (None, "", "null", "undefined"):
            return None
        try:
            valeur = float(brut)
        except (TypeError, ValueError):
            return None
        return valeur

    latitude, longitude = _lire("latitude"), _lire("longitude")
    if latitude is None or longitude is None:
        return None, None
    # Coordonnées hors du domaine physique : on préfère ignorer plutôt que de
    # refuser un pointage sur une valeur aberrante envoyée par un navigateur.
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return None, None
    return latitude, longitude
