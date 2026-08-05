import tempfile
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from exploitation.models import Ferme, Magasin, ProfilUtilisateur, RoleUtilisateur, TypeFerme
from exploitation.views import employes_ferme

from .models import Absence, AppareilPointage, BadgeTemporaire, Employe, EvaluationEmploye, LignePaie, Pointage, StatutAbsence
from .views import (
    AbsenceViewSet,
    EmployeViewSet,
    EvaluationEmployeViewSet,
    LignePaieViewSet,
    PointageViewSet,
    _calculer_rentabilite_bruts,
    appareil_pointage_desactiver,
    appareil_pointage_qr,
    appareil_pointage_regenerer,
    appareil_pointage_statut,
    appareil_pointage_verifier,
    badge_temporaire_valider,
    resume_paie,
    scan_info,
    scan_valider,
)

User = get_user_model()

# Un pixel PNG 1x1 valide — suffisant pour un ImageField, pas besoin d'une
# vraie photo pour tester que le champ est bien rempli.
PIXEL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class SelfiePointageTests(TestCase):
    """Le selfie est obligatoire à chaque validation (arrivée/départ) — un
    seul téléphone partagé scanne désormais le badge de chaque employé
    (plus celui d'un superviseur qui les reconnaît tous), cf. conversation
    du 28/07/2026 avec Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin")
        ferme = Ferme.objects.create(nom="Ferme", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Test")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()

    def _photo(self, nom="selfie.png"):
        return SimpleUploadedFile(nom, PIXEL_PNG, content_type="image/png")

    def test_scan_valider_refuse_sans_photo(self):
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/")
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Pointage.objects.filter(employe=self.employe).exists())

    def test_scan_valider_accepte_avec_photo_et_enregistre_le_selfie(self):
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)
        pointage = Pointage.objects.get(employe=self.employe)
        self.assertTrue(bool(pointage.photo_debut))
        self.assertIsNone(pointage.heure_fin)

        # Deuxième scan (départ) — même exigence de photo.
        req2 = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo("depart.png")})
        resp2 = scan_valider(req2, token=str(self.employe.qr_token))
        self.assertEqual(resp2.status_code, 200)
        pointage.refresh_from_db()
        self.assertTrue(bool(pointage.photo_fin))
        self.assertIsNotNone(pointage.heure_fin)

    def test_badge_temporaire_valider_refuse_sans_photo(self):
        badge = BadgeTemporaire.objects.create()
        req = self.factory.post(f"/api/pointage/badge-temporaire/{badge.token}/employes/{self.employe.id}/valider/")
        resp = badge_temporaire_valider(req, token=str(badge.token), employe_id=self.employe.id)
        self.assertEqual(resp.status_code, 400)

    def test_badge_temporaire_valider_accepte_avec_photo(self):
        badge = BadgeTemporaire.objects.create()
        req = self.factory.post(
            f"/api/pointage/badge-temporaire/{badge.token}/employes/{self.employe.id}/valider/", {"photo": self._photo()}
        )
        resp = badge_temporaire_valider(req, token=str(badge.token), employe_id=self.employe.id)
        self.assertEqual(resp.status_code, 200)
        pointage = Pointage.objects.get(employe=self.employe)
        self.assertTrue(bool(pointage.photo_debut))


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AppareilPointageTests(TestCase):
    """Le jeton d'appareil garantit qu'un seul téléphone désigné peut
    valider un pointage, même si le QR d'un employé a été photographié ou
    partagé — cf. conversation du 28/07/2026 avec Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin")
        ferme = Ferme.objects.create(nom="Ferme", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Test")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()
        self.direction = User.objects.create(username="direction")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)

    def _photo(self):
        return SimpleUploadedFile("selfie.png", PIXEL_PNG, content_type="image/png")

    def test_aucun_appareil_configure_ne_bloque_rien(self):
        # Transition en douceur : tant que la Direction n'a rien activé, le
        # scan continue de fonctionner sans en-tête.
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)

    def test_scan_refuse_sans_jeton_quand_appareil_configure(self):
        AppareilPointage.objects.create()
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 403)

    def test_scan_refuse_avec_mauvais_jeton(self):
        AppareilPointage.objects.create()
        req = self.factory.post(
            f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()},
            HTTP_X_APPAREIL_TOKEN="00000000-0000-0000-0000-000000000000",
        )
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 403)

    def test_scan_accepte_avec_le_bon_jeton(self):
        appareil = AppareilPointage.objects.create()
        req = self.factory.post(
            f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()},
            HTTP_X_APPAREIL_TOKEN=str(appareil.token),
        )
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)

    def test_verifier_appareil(self):
        appareil = AppareilPointage.objects.create()
        req_ok = self.factory.get(f"/api/pointage/appareil/{appareil.token}/verifier/")
        self.assertTrue(appareil_pointage_verifier(req_ok, token=str(appareil.token)).data["valide"])

        req_ko = self.factory.get("/api/pointage/appareil/00000000-0000-0000-0000-000000000000/verifier/")
        self.assertFalse(appareil_pointage_verifier(req_ko, token="00000000-0000-0000-0000-000000000000").data["valide"])

    def test_regenerer_invalide_l_ancien_jeton(self):
        ancien = AppareilPointage.objects.create()
        req_regen = self.factory.post("/api/pointage/appareil/regenerer/")
        force_authenticate(req_regen, user=self.direction)
        resp_regen = appareil_pointage_regenerer(req_regen)
        self.assertEqual(resp_regen.status_code, 200)
        self.assertEqual(AppareilPointage.objects.count(), 1)
        self.assertFalse(AppareilPointage.objects.filter(token=ancien.token).exists())

        # L'ancien jeton ne fonctionne plus.
        req = self.factory.post(
            f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()},
            HTTP_X_APPAREIL_TOKEN=str(ancien.token),
        )
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 403)

    def test_qr_appareil_reserve_direction(self):
        req = self.factory.get("/api/pointage/appareil/qr/")
        # Pas de force_authenticate -> anonyme, doit être refusé.
        resp = appareil_pointage_qr(req)
        self.assertEqual(resp.status_code, 403)

    def test_statut_reflete_l_etat_actuel(self):
        req = self.factory.get("/api/pointage/appareil/statut/")
        force_authenticate(req, user=self.direction)
        self.assertFalse(appareil_pointage_statut(req).data["actif"])

        AppareilPointage.objects.create()
        req2 = self.factory.get("/api/pointage/appareil/statut/")
        force_authenticate(req2, user=self.direction)
        self.assertTrue(appareil_pointage_statut(req2).data["actif"])

    def test_desactiver_supprime_l_appareil_et_debloque_le_scan(self):
        appareil = AppareilPointage.objects.create()
        req_off = self.factory.post("/api/pointage/appareil/desactiver/")
        force_authenticate(req_off, user=self.direction)
        resp_off = appareil_pointage_desactiver(req_off)
        self.assertEqual(resp_off.status_code, 200)
        self.assertFalse(resp_off.data["actif"])
        self.assertFalse(AppareilPointage.objects.exists())

        # Plus aucun jeton exigé : un scan sans en-tête (ni même l'ancien
        # jeton, qui n'existe plus) fonctionne de nouveau.
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class RegenererBadgeEmployeTests(TestCase):
    """Un badge employé perdu/volé doit pouvoir être invalidé individuellement
    (l'ancienne carte imprimée arrête de fonctionner) — cf. conversation du
    29/07/2026 avec Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin")
        ferme = Ferme.objects.create(nom="Ferme", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Test")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()
        self.direction = User.objects.create(username="direction")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)

    def test_regenerer_change_le_token_et_invalide_l_ancien(self):
        ancien_token = self.employe.qr_token
        view = EmployeViewSet.as_view({"post": "regenerer_qr"})
        req = self.factory.post(f"/api/pointage/employes/{self.employe.id}/regenerer-qr/")
        force_authenticate(req, user=self.direction)
        resp = view(req, pk=self.employe.id)
        self.assertEqual(resp.status_code, 200)

        self.employe.refresh_from_db()
        self.assertNotEqual(self.employe.qr_token, ancien_token)

        # L'ancien token ne retrouve plus personne.
        req_ancien = self.factory.get(f"/api/pointage/scan/{ancien_token}/")
        resp_ancien = scan_info(req_ancien, token=str(ancien_token))
        self.assertEqual(resp_ancien.status_code, 404)

        # Le nouveau token fonctionne.
        req_nouveau = self.factory.get(f"/api/pointage/scan/{self.employe.qr_token}/")
        resp_nouveau = scan_info(req_nouveau, token=str(self.employe.qr_token))
        self.assertEqual(resp_nouveau.status_code, 200)

    def test_regenerer_reserve_direction(self):
        view = EmployeViewSet.as_view({"post": "regenerer_qr"})
        req = self.factory.post(f"/api/pointage/employes/{self.employe.id}/regenerer-qr/")
        # Pas de force_authenticate -> anonyme, doit être refusé.
        resp = view(req, pk=self.employe.id)
        self.assertEqual(resp.status_code, 403)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class OrigineSecoursPointageTests(TestCase):
    """Distingue un pointage validé via le badge personnel (scan_valider) de
    celui validé via le badge de secours (badge_temporaire_valider), qui
    n'a aucun jeton personnel à vérifier — cf. conversation du 29/07/2026."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin")
        ferme = Ferme.objects.create(nom="Ferme", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Test")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()

    def _photo(self, nom="selfie.png"):
        return SimpleUploadedFile(nom, PIXEL_PNG, content_type="image/png")

    def test_scan_personnel_ne_marque_pas_via_secours(self):
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo()})
        scan_valider(req, token=str(self.employe.qr_token))
        pointage = Pointage.objects.get(employe=self.employe)
        self.assertFalse(pointage.arrivee_via_secours)

    def test_badge_temporaire_marque_arrivee_et_depart_via_secours(self):
        badge = BadgeTemporaire.objects.create()
        req1 = self.factory.post(
            f"/api/pointage/badge-temporaire/{badge.token}/employes/{self.employe.id}/valider/", {"photo": self._photo("a.png")}
        )
        badge_temporaire_valider(req1, token=str(badge.token), employe_id=self.employe.id)
        pointage = Pointage.objects.get(employe=self.employe)
        self.assertTrue(pointage.arrivee_via_secours)
        self.assertFalse(pointage.depart_via_secours)

        req2 = self.factory.post(
            f"/api/pointage/badge-temporaire/{badge.token}/employes/{self.employe.id}/valider/", {"photo": self._photo("b.png")}
        )
        badge_temporaire_valider(req2, token=str(badge.token), employe_id=self.employe.id)
        pointage.refresh_from_db()
        self.assertTrue(pointage.depart_via_secours)

    def test_arrivee_personnelle_puis_depart_via_secours_ne_marque_que_le_depart(self):
        # Un employé peut arriver avec son badge personnel puis repartir via
        # le secours (badge perdu dans la journée) — les deux se suivent
        # indépendamment, pas un simple champ "origine" global au pointage.
        req1 = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": self._photo("a.png")})
        scan_valider(req1, token=str(self.employe.qr_token))

        badge = BadgeTemporaire.objects.create()
        req2 = self.factory.post(
            f"/api/pointage/badge-temporaire/{badge.token}/employes/{self.employe.id}/valider/", {"photo": self._photo("b.png")}
        )
        badge_temporaire_valider(req2, token=str(badge.token), employe_id=self.employe.id)

        pointage = Pointage.objects.get(employe=self.employe)
        self.assertFalse(pointage.arrivee_via_secours)
        self.assertTrue(pointage.depart_via_secours)


class RentabiliteEmployeMultiFermeTests(TestCase):
    """_calculer_rentabilite_bruts répartit le coût d'un employé qui couvre
    plusieurs fermes (absences validées + ajustements LignePaie) à parts
    égales entre elles — jamais testé directement (cf. audit du 30/07/2026)."""

    def setUp(self):
        self.magasinA = Magasin.objects.create(nom="Magasin Rentab A")
        self.magasinB = Magasin.objects.create(nom="Magasin Rentab B")
        self.fermeA = Ferme.objects.create(nom="Ferme Rentab A", type=TypeFerme.PONTE, nombre_chambres=1, magasin=self.magasinA)
        self.fermeB = Ferme.objects.create(nom="Ferme Rentab B", type=TypeFerme.PONTE, nombre_chambres=1, magasin=self.magasinB)
        self.employe = Employe.objects.create(nom="Superviseur Test", salaire_mensuel=Decimal("260000"))
        self.employe.fermes.set([self.fermeA, self.fermeB])
        self.debut = date(2026, 7, 1)
        self.fin = date(2026, 7, 31)

    def test_absence_validee_et_ligne_paie_reparties_a_parts_egales(self):
        Absence.objects.create(employe=self.employe, date=date(2026, 7, 15), statut=StatutAbsence.VALIDEE)
        LignePaie.objects.create(employe=self.employe, mois=self.debut, primes=Decimal("2000"))

        resultats = _calculer_rentabilite_bruts([self.fermeA, self.fermeB], self.debut, self.fin)

        cout_attendu_par_ferme = (self.employe.salaire_journalier + Decimal("2000")) / 2
        self.assertEqual(resultats[self.fermeA.id]["cout_paie"], cout_attendu_par_ferme)
        self.assertEqual(resultats[self.fermeB.id]["cout_paie"], cout_attendu_par_ferme)

    def test_absence_en_attente_n_est_pas_comptee(self):
        Absence.objects.create(employe=self.employe, date=date(2026, 7, 15), statut=StatutAbsence.EN_ATTENTE)

        resultats = _calculer_rentabilite_bruts([self.fermeA, self.fermeB], self.debut, self.fin)

        self.assertEqual(resultats[self.fermeA.id]["cout_paie"], Decimal("0"))
        self.assertEqual(resultats[self.fermeB.id]["cout_paie"], Decimal("0"))


class AbsenceDeclarationRaceTests(TestCase):
    """AbsenceViewSet.create pose désormais un verrou consultatif Postgres
    (no-op sur SQLite, donc la course elle-même n'est pas vérifiable ici —
    cf. les mises en garde équivalentes ailleurs dans ce fichier/session)
    avant les contrôles "pas déjà déclaré", pour qu'une double déclaration
    concurrente échoue proprement (400) plutôt que de planter (500) sur la
    contrainte unique employe+date. Ce test couvre la logique métier
    inchangée : une deuxième déclaration EN SÉRIE reste rejetée avec un
    message clair. Cf. conversation du 01/08/2026 avec Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Absence Race")
        ferme = Ferme.objects.create(nom="Ferme Absence Race", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Absence Race")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()
        self.direction = User.objects.create(username="direction_absence_race")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)

    def test_seconde_declaration_pour_le_meme_employe_et_jour_est_rejetee_proprement(self):
        view = AbsenceViewSet.as_view({"post": "create"})
        payload = {"employe": self.employe.id, "date": "2026-07-20", "motif": "Maladie"}

        req1 = self.factory.post("/api/pointage/absences/", payload)
        force_authenticate(req1, user=self.direction)
        resp1 = view(req1)
        self.assertEqual(resp1.status_code, 201)

        req2 = self.factory.post("/api/pointage/absences/", payload)
        force_authenticate(req2, user=self.direction)
        resp2 = view(req2)
        self.assertEqual(resp2.status_code, 400)
        self.assertEqual(Absence.objects.filter(employe=self.employe, date="2026-07-20").count(), 1)


class LignePaieUpsertTests(TestCase):
    """LignePaieViewSet.create pose désormais un verrou consultatif avant de
    décider créer vs mettre à jour (même raison que AbsenceDeclarationRaceTests
    — non vérifiable en soi sur SQLite). Ce test couvre la logique métier
    inchangée : un deuxième appel pour le même employé/mois met à jour la
    ligne existante au lieu d'en créer une seconde."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Paie Upsert")
        ferme = Ferme.objects.create(nom="Ferme Paie Upsert", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Paie Upsert")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()
        self.direction = User.objects.create(username="direction_paie_upsert")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)

    def test_deuxieme_appel_met_a_jour_au_lieu_de_dupliquer(self):
        view = LignePaieViewSet.as_view({"post": "create"})

        req1 = self.factory.post("/api/pointage/lignes-paie/", {"employe": self.employe.id, "mois": "2026-07-01", "primes": "1000"})
        force_authenticate(req1, user=self.direction)
        resp1 = view(req1)
        self.assertEqual(resp1.status_code, 201)

        req2 = self.factory.post("/api/pointage/lignes-paie/", {"employe": self.employe.id, "mois": "2026-07-01", "primes": "2500"})
        force_authenticate(req2, user=self.direction)
        resp2 = view(req2)
        self.assertEqual(resp2.status_code, 200)

        self.assertEqual(LignePaie.objects.filter(employe=self.employe, mois="2026-07-01").count(), 1)
        self.assertEqual(LignePaie.objects.get(employe=self.employe, mois="2026-07-01").primes, Decimal("2500"))


def _photo(nom="selfie.png"):
    return SimpleUploadedFile(nom, PIXEL_PNG, content_type="image/png")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GardeDeNuitPointageTests(TestCase):
    """Une garde de nuit (arrivée un jour, départ le lendemain) doit être
    clôturée par le scan du lendemain, pas créer un nouveau pointage mal
    étiqueté comme une nouvelle arrivée. Cf. conversation du 02/08/2026 avec
    Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Garde")
        ferme = Ferme.objects.create(nom="Ferme Garde", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Gardien Test", salaire_mensuel=Decimal("100000"))
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()

    def test_le_scan_du_lendemain_cloture_la_garde_d_hier(self):
        hier = timezone.localdate() - timedelta(days=1)
        pointage_ouvert = Pointage.objects.create(
            employe=self.employe, date=hier, heure_debut=timezone.now() - timedelta(hours=10),
        )
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)
        # Pas de 2e ligne créée pour "aujourd'hui" — la garde d'hier est clôturée.
        self.assertEqual(Pointage.objects.filter(employe=self.employe).count(), 1)
        pointage_ouvert.refresh_from_db()
        self.assertEqual(pointage_ouvert.date, hier)
        self.assertIsNotNone(pointage_ouvert.heure_fin)
        self.assertGreater(pointage_ouvert.heures_travaillees, 0)
        self.assertEqual(resp.data["etat"], "TERMINE")

    def test_un_pointage_ouvert_depuis_plus_d_un_jour_n_est_pas_cloture(self):
        avant_hier = timezone.localdate() - timedelta(days=2)
        Pointage.objects.create(employe=self.employe, date=avant_hier, heure_debut=timezone.now() - timedelta(days=2))
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)
        # Un nouveau pointage "aujourd'hui" démarre à la place ; l'ancien reste ouvert (correction manuelle Direction).
        self.assertEqual(Pointage.objects.filter(employe=self.employe).count(), 2)
        nouveau = Pointage.objects.get(employe=self.employe, date=timezone.localdate())
        self.assertIsNotNone(nouveau.heure_debut)
        self.assertIsNone(nouveau.heure_fin)

    def test_un_badge_oublie_hier_soir_n_est_pas_confondu_avec_une_garde_de_nuit(self):
        # Employé de jour qui oublie de débadger hier soir (arrivée il y a
        # ~26h, bien au-delà de DUREE_MAX_GARDE_HEURES) puis rebadge ce
        # matin : le scan doit démarrer une nouvelle journée, pas fermer
        # l'ancien pointage avec une durée aberrante de ~26h.
        hier = timezone.localdate() - timedelta(days=1)
        pointage_oublie = Pointage.objects.create(
            employe=self.employe, date=hier, heure_debut=timezone.now() - timedelta(hours=26),
        )
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp = scan_valider(req, token=str(self.employe.qr_token))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Pointage.objects.filter(employe=self.employe).count(), 2)
        pointage_oublie.refresh_from_db()
        self.assertIsNone(pointage_oublie.heure_fin)  # laissé ouvert pour correction manuelle par la Direction
        nouveau = Pointage.objects.get(employe=self.employe, date=timezone.localdate())
        self.assertIsNotNone(nouveau.heure_debut)
        self.assertIsNone(nouveau.heure_fin)

    def test_scan_info_detecte_la_garde_d_hier_encore_ouverte_comme_en_cours(self):
        # Avant la clôture : scan_info doit montrer EN_COURS (pas
        # NON_COMMENCE) pour que l'écran propose "Valider le départ" et non
        # une nouvelle arrivée — c'est le bug d'origine (sans le correctif,
        # scan_info ne regardait que la date du jour et ratait la garde
        # d'hier encore ouverte).
        hier = timezone.localdate() - timedelta(days=1)
        Pointage.objects.create(employe=self.employe, date=hier, heure_debut=timezone.now() - timedelta(hours=10))
        req_info = self.factory.get(f"/api/pointage/scan/{self.employe.qr_token}/")
        resp_info = scan_info(req_info, token=str(self.employe.qr_token))
        self.assertEqual(resp_info.data["etat"], "EN_COURS")

    def test_scan_info_redevient_non_commence_une_fois_la_garde_cloturee(self):
        # Une fois clôturée, "aujourd'hui" n'a pas encore de nouveau
        # pointage — c'est le comportement attendu, pas une incohérence.
        hier = timezone.localdate() - timedelta(days=1)
        Pointage.objects.create(employe=self.employe, date=hier, heure_debut=timezone.now() - timedelta(hours=10))
        req = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        scan_valider(req, token=str(self.employe.qr_token))

        req_info = self.factory.get(f"/api/pointage/scan/{self.employe.qr_token}/")
        resp_info = scan_info(req_info, token=str(self.employe.qr_token))
        self.assertEqual(resp_info.data["etat"], "NON_COMMENCE")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PointageDejaCompletTests(TestCase):
    """Un 3e scan une fois la journée terminée ne modifie rien mais le
    signale (deja_complet) au lieu d'un no-op silencieux — décision de
    Serge (02/08/2026) de ne pas enregistrer de 2e plage."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Complet")
        ferme = Ferme.objects.create(nom="Ferme Complet", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Complet")
        self.employe.fermes.add(ferme)
        self.factory = APIRequestFactory()

    def test_3e_scan_ne_modifie_rien_et_signale_deja_complet(self):
        req1 = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp1 = scan_valider(req1, token=str(self.employe.qr_token))
        self.assertFalse(resp1.data["deja_complet"])

        req2 = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp2 = scan_valider(req2, token=str(self.employe.qr_token))
        self.assertFalse(resp2.data["deja_complet"])

        pointage = Pointage.objects.get(employe=self.employe)
        heures_avant = pointage.heures_travaillees

        req3 = self.factory.post(f"/api/pointage/scan/{self.employe.qr_token}/valider/", {"photo": _photo()})
        resp3 = scan_valider(req3, token=str(self.employe.qr_token))
        self.assertTrue(resp3.data["deja_complet"])
        pointage.refresh_from_db()
        self.assertEqual(pointage.heures_travaillees, heures_avant)
        self.assertEqual(Pointage.objects.filter(employe=self.employe).count(), 1)


class ResumePaieTests(TestCase):
    """Porte côté serveur le résumé auparavant recalculé en JS
    (PointageHistorique.jsx) — heures/montant agrégés, absences justifiées
    valorisées, absences injustifiées détectées, jours de repos exclus.
    Cf. conversation du 02/08/2026 avec Serge."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.direction = User.objects.create(username="direction_resume_paie")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)
        magasin = Magasin.objects.create(nom="Magasin Résumé")
        self.ferme = Ferme.objects.create(nom="Ferme Résumé", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.debut = date(2026, 7, 1)
        self.fin = date(2026, 7, 3)

    def _get(self, **params):
        req = self.factory.get("/api/pointage/resume-paie/", {
            "date_debut": self.debut.isoformat(), "date_fin": self.fin.isoformat(), **params,
        })
        force_authenticate(req, user=self.direction)
        return resume_paie(req)

    def test_heures_et_montant_agreges_et_absence_injustifiee_detectee(self):
        emp = Employe.objects.create(nom="Employe Résumé A", salaire_mensuel=Decimal("260000"))
        emp.fermes.add(self.ferme)
        Pointage.objects.create(
            employe=emp, date=date(2026, 7, 1),
            heure_debut=timezone.now(), heure_fin=timezone.now(),
            heures_travaillees=Decimal("8.00"), montant_du_jour=Decimal("3000.00"),
        )
        Absence.objects.create(employe=emp, date=date(2026, 7, 2), statut=StatutAbsence.VALIDEE)
        # 3 juillet : ni pointage ni absence -> absence injustifiée.

        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        ligne = next(g for g in resp.data if g["employeId"] == emp.id)
        self.assertEqual(len(ligne["lignesTravaillees"]), 1)
        self.assertEqual(ligne["totalHeures"], Decimal("8.00"))
        self.assertEqual(len(ligne["absencesJustifiees"]), 1)
        self.assertEqual(ligne["absencesJustifiees"][0]["montant"], emp.salaire_journalier)
        self.assertEqual(ligne["joursAbsenceInjustifiee"], ["2026-07-03"])
        montant_attendu = Decimal("3000.00") + emp.salaire_journalier
        self.assertEqual(ligne["totalMontant"], montant_attendu)

    def test_jour_de_repos_non_pointe_n_est_pas_une_absence_injustifiee(self):
        jour_repos = date(2026, 7, 2)
        emp = Employe.objects.create(nom="Employe Résumé B", salaire_mensuel=Decimal("260000"), jour_repos=jour_repos.weekday())
        emp.fermes.add(self.ferme)
        # 1er et 3 juillet travaillés, 2 juillet (jour de repos) non pointé.
        for jour in (date(2026, 7, 1), date(2026, 7, 3)):
            Pointage.objects.create(
                employe=emp, date=jour, heure_debut=timezone.now(), heure_fin=timezone.now(),
                heures_travaillees=Decimal("8.00"), montant_du_jour=Decimal("3000.00"),
            )

        resp = self._get()
        ligne = next(g for g in resp.data if g["employeId"] == emp.id)
        self.assertEqual(ligne["joursAbsenceInjustifiee"], [])
        self.assertEqual(ligne["joursReposDus"], 1)
        self.assertEqual(ligne["joursReposTravailles"], [])

    def test_jour_de_repos_travaille_est_signale(self):
        jour_repos = date(2026, 7, 2)
        emp = Employe.objects.create(nom="Employe Résumé C", salaire_mensuel=Decimal("260000"), jour_repos=jour_repos.weekday())
        emp.fermes.add(self.ferme)
        Pointage.objects.create(
            employe=emp, date=jour_repos, heure_debut=timezone.now(), heure_fin=timezone.now(),
            heures_travaillees=Decimal("8.00"), montant_du_jour=Decimal("3000.00"),
        )

        resp = self._get()
        ligne = next(g for g in resp.data if g["employeId"] == emp.id)
        self.assertEqual(ligne["joursReposTravailles"], ["2026-07-02"])

    def test_employe_sans_aucune_donnee_est_omis_hors_periode(self):
        # Sans date_debut/date_fin, la détection d'absence injustifiée ne
        # tourne pas (comme le JS remplacé, qui ne le faisait qu'avec une
        # période complète) — un employé sans aucune donnée est bien omis.
        # Avec une période complète, chaque jour ouvré sans pointage/absence
        # devient une absence injustifiée par définition : ce n'est donc
        # plus "aucune donnée" (comportement voulu, pas un oubli).
        emp = Employe.objects.create(nom="Employe Résumé Vide", salaire_mensuel=Decimal("260000"))
        emp.fermes.add(self.ferme)

        req = self.factory.get("/api/pointage/resume-paie/")
        force_authenticate(req, user=self.direction)
        resp = resume_paie(req)
        self.assertNotIn(emp.id, [g["employeId"] for g in resp.data])


class PointageHistoriqueLimiteTests(TestCase):
    """Même garde-fou que les 4 viewsets exploitation corrigés le 01/08/2026
    — celui-ci avait été oublié : sans limite, l'historique renverrait toute
    la table d'un coup."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Limite")
        ferme = Ferme.objects.create(nom="Ferme Limite", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Limite")
        self.employe.fermes.add(ferme)
        self.direction = User.objects.create(username="direction_limite")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)
        self.factory = APIRequestFactory()
        for i in range(3):
            Pointage.objects.create(
                employe=self.employe, date=date(2026, 7, 1 + i), heure_debut=timezone.now(), heure_fin=timezone.now(),
            )

    def test_list_respecte_la_limite(self):
        view = PointageViewSet.as_view({"get": "list"})
        req = self.factory.get("/api/pointage/historique/", {"limite": "1"})
        force_authenticate(req, user=self.direction)
        resp = view(req)
        self.assertEqual(len(resp.data), 1)

    def test_retrieve_fonctionne_malgre_la_limite_sur_list(self):
        pointage = Pointage.objects.filter(employe=self.employe).first()
        view = PointageViewSet.as_view({"get": "retrieve"})
        req = self.factory.get(f"/api/pointage/historique/{pointage.id}/", {"limite": "1"})
        force_authenticate(req, user=self.direction)
        resp = view(req, pk=pointage.id)
        self.assertEqual(resp.status_code, 200)


class PointageCorrectionVerrouTests(TestCase):
    """Vérifie que la correction fonctionne toujours normalement avec le
    verrou consultatif en place (l'ordre de verrouillage lui-même n'est pas
    vérifiable sur SQLite, même mise en garde qu'ailleurs dans ce fichier/
    cette session). Cf. conversation du 02/08/2026 avec Serge."""

    def setUp(self):
        magasin = Magasin.objects.create(nom="Magasin Correction")
        ferme = Ferme.objects.create(nom="Ferme Correction", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Correction", salaire_mensuel=Decimal("100000"))
        self.employe.fermes.add(ferme)
        self.direction = User.objects.create(username="direction_correction")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)
        self.factory = APIRequestFactory()
        self.pointage = Pointage.objects.create(employe=self.employe, date=date(2026, 7, 20))

    def test_corriger_heure_debut_et_fin_recalcule_les_heures(self):
        view = PointageViewSet.as_view({"patch": "partial_update"})
        req = self.factory.patch(f"/api/pointage/historique/{self.pointage.id}/", {
            "heure_debut": "2026-07-20T08:00:00Z", "heure_fin": "2026-07-20T17:00:00Z",
        })
        force_authenticate(req, user=self.direction)
        resp = view(req, pk=self.pointage.id)
        self.assertEqual(resp.status_code, 200)
        self.pointage.refresh_from_db()
        self.assertEqual(self.pointage.heures_travaillees, Decimal("9.00"))


class EvaluationEmployeTests(TestCase):
    """Notation du travail d'un employé (ponctualité, qualité du travail,
    comportement + commentaire) par un technicien/vétérinaire ou la
    Direction — tous les employés sont concernés, quel que soit leur
    niveau. Cf. conversation du 05/08/2026 avec Serge."""

    def setUp(self):
        self.factory = APIRequestFactory()
        magasin = Magasin.objects.create(nom="Magasin Evaluation")
        self.ferme = Ferme.objects.create(nom="Ferme Evaluation", type=TypeFerme.PONTE, nombre_chambres=1, magasin=magasin)
        self.employe = Employe.objects.create(nom="Employe Evaluation")
        self.employe.fermes.add(self.ferme)
        self.direction = User.objects.create(username="test_evaluation_direction")
        ProfilUtilisateur.objects.create(user=self.direction, role=RoleUtilisateur.DIRECTION)
        self.technicien = User.objects.create(username="test_evaluation_technicien")
        profil_technicien = ProfilUtilisateur.objects.create(user=self.technicien, role=RoleUtilisateur.TECHNICIEN)
        profil_technicien.fermes.add(self.ferme)
        self.chef = User.objects.create(username="test_evaluation_chef")
        profil_chef = ProfilUtilisateur.objects.create(user=self.chef, role=RoleUtilisateur.CHEF_FERME)
        profil_chef.fermes.add(self.ferme)

    def test_score_est_la_somme_des_3_criteres(self):
        evaluation = EvaluationEmploye.objects.create(
            employe=self.employe, date=date(2026, 7, 29), created_by=self.direction,
            ponctualite=2, qualite_travail=1, comportement=2,
        )
        self.assertEqual(evaluation.score, 5)
        self.assertEqual(evaluation.score_max, 6)

    def test_technicien_peut_noter_un_employe_de_sa_ferme(self):
        view = EvaluationEmployeViewSet.as_view({"post": "create"})
        req = self.factory.post("/api/pointage/evaluations-employes/", {
            "employe": self.employe.id, "date": "2026-07-29", "ponctualite": 2, "qualite_travail": 2, "comportement": 1,
            "commentaire": "Bon travail dans l'ensemble",
        })
        force_authenticate(req, user=self.technicien)
        resp = view(req)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(EvaluationEmploye.objects.get(pk=resp.data["id"]).created_by, self.technicien)

    def test_technicien_ne_peut_pas_noter_un_employe_hors_de_ses_fermes(self):
        autre_magasin = Magasin.objects.create(nom="Magasin Evaluation Autre")
        autre_ferme = Ferme.objects.create(nom="Ferme Evaluation Autre", type=TypeFerme.PONTE, nombre_chambres=1, magasin=autre_magasin)
        autre_employe = Employe.objects.create(nom="Employe Autre Ferme")
        autre_employe.fermes.add(autre_ferme)

        view = EvaluationEmployeViewSet.as_view({"post": "create"})
        req = self.factory.post("/api/pointage/evaluations-employes/", {
            "employe": autre_employe.id, "date": "2026-07-29",
        })
        force_authenticate(req, user=self.technicien)
        resp = view(req)
        self.assertEqual(resp.status_code, 403)

    def test_direction_peut_noter(self):
        view = EvaluationEmployeViewSet.as_view({"post": "create"})
        req = self.factory.post("/api/pointage/evaluations-employes/", {
            "employe": self.employe.id, "date": "2026-07-29",
        })
        force_authenticate(req, user=self.direction)
        resp = view(req)
        self.assertEqual(resp.status_code, 201)

    def test_chef_de_ferme_peut_consulter_mais_pas_noter(self):
        EvaluationEmploye.objects.create(employe=self.employe, date=date(2026, 7, 29), created_by=self.direction)

        liste = EvaluationEmployeViewSet.as_view({"get": "list"})
        req = self.factory.get("/api/pointage/evaluations-employes/")
        force_authenticate(req, user=self.chef)
        resp = liste(req)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

        creation = EvaluationEmployeViewSet.as_view({"post": "create"})
        req = self.factory.post("/api/pointage/evaluations-employes/", {
            "employe": self.employe.id, "date": "2026-07-30",
        })
        force_authenticate(req, user=self.chef)
        resp = creation(req)
        self.assertEqual(resp.status_code, 403)

    def test_employes_ferme_autorise_le_technicien(self):
        # Régression : employes_ferme était IsFermeAccessible (refusait le
        # technicien) avant ce changement — nécessaire pour le sélecteur
        # d'employé du formulaire de notation.
        req = self.factory.get("/api/employes-ferme/", {"ferme": self.ferme.id})
        force_authenticate(req, user=self.technicien)
        resp = employes_ferme(req)
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.employe.id, [e["id"] for e in resp.data])

    def test_technicien_refuse_sur_evaluation_employe_viewset_scope_liste(self):
        # Contrôle négatif : un technicien ne voit que les évaluations des
        # employés de ses propres fermes (même filtre que get_queryset
        # ailleurs dans l'appli).
        autre_magasin = Magasin.objects.create(nom="Magasin Evaluation Scope")
        autre_ferme = Ferme.objects.create(nom="Ferme Evaluation Scope", type=TypeFerme.PONTE, nombre_chambres=1, magasin=autre_magasin)
        autre_employe = Employe.objects.create(nom="Employe Scope Autre")
        autre_employe.fermes.add(autre_ferme)
        EvaluationEmploye.objects.create(employe=autre_employe, date=date(2026, 7, 29), created_by=self.direction)
        EvaluationEmploye.objects.create(employe=self.employe, date=date(2026, 7, 29), created_by=self.direction)

        view = EvaluationEmployeViewSet.as_view({"get": "list"})
        req = self.factory.get("/api/pointage/evaluations-employes/")
        force_authenticate(req, user=self.technicien)
        resp = view(req)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
