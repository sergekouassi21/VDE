from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenceViewSet,
    DocumentEmployeViewSet,
    EmployeViewSet,
    LignePaieViewSet,
    PointageViewSet,
    badge_absence_declarer,
    badge_absence_employes,
    badge_absence_qr,
    badge_temporaire_employes,
    badge_temporaire_qr,
    badge_temporaire_valider,
    rapport_mensuel,
    rentabilite,
    scan_info,
    scan_valider,
    utilisateurs_disponibles,
)

router = DefaultRouter()
router.register("employes", EmployeViewSet, basename="employe")
router.register("historique", PointageViewSet, basename="pointage-historique")
router.register("absences", AbsenceViewSet, basename="absence")
router.register("lignes-paie", LignePaieViewSet, basename="ligne-paie")
router.register("documents-employe", DocumentEmployeViewSet, basename="document-employe")

urlpatterns = [
    path("scan/<uuid:token>/", scan_info, name="pointage-scan-info"),
    path("scan/<uuid:token>/valider/", scan_valider, name="pointage-scan-valider"),
    path("utilisateurs-disponibles/", utilisateurs_disponibles, name="pointage-utilisateurs-disponibles"),
    path("rentabilite/", rentabilite, name="pointage-rentabilite"),
    path("rapport-mensuel/", rapport_mensuel, name="pointage-rapport-mensuel"),
    path("badge-temporaire/qr/", badge_temporaire_qr, name="pointage-badge-temporaire-qr"),
    path("badge-temporaire/<uuid:token>/employes/", badge_temporaire_employes, name="pointage-badge-temporaire-employes"),
    path("badge-temporaire/<uuid:token>/employes/<int:employe_id>/valider/", badge_temporaire_valider, name="pointage-badge-temporaire-valider"),
    path("badge-absence/qr/", badge_absence_qr, name="pointage-badge-absence-qr"),
    path("badge-absence/<uuid:token>/employes/", badge_absence_employes, name="pointage-badge-absence-employes"),
    path("badge-absence/<uuid:token>/declarer/", badge_absence_declarer, name="pointage-badge-absence-declarer"),
] + router.urls
