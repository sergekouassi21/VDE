import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from exploitation.models import Ferme, Magasin, TypeFerme

from .models import BadgeTemporaire, Employe, Pointage
from .views import badge_temporaire_valider, scan_valider

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
