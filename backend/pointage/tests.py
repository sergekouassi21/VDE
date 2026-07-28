import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from exploitation.models import Ferme, Magasin, ProfilUtilisateur, RoleUtilisateur, TypeFerme

from .models import AppareilPointage, BadgeTemporaire, Employe, Pointage
from .views import appareil_pointage_qr, appareil_pointage_regenerer, appareil_pointage_verifier, badge_temporaire_valider, scan_valider

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
