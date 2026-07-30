import tempfile
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from exploitation.models import Ferme, Magasin, ProfilUtilisateur, RoleUtilisateur, TypeFerme

from .models import Absence, AppareilPointage, BadgeTemporaire, Employe, LignePaie, Pointage, StatutAbsence
from .views import (
    EmployeViewSet,
    _calculer_rentabilite_bruts,
    appareil_pointage_desactiver,
    appareil_pointage_qr,
    appareil_pointage_regenerer,
    appareil_pointage_statut,
    appareil_pointage_verifier,
    badge_temporaire_valider,
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
