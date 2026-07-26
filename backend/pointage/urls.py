from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenceViewSet,
    EmployeViewSet,
    LignePaieViewSet,
    PointageViewSet,
    badge_temporaire_employes,
    badge_temporaire_qr,
    badge_temporaire_valider,
    scan_info,
    scan_valider,
    utilisateurs_disponibles,
)

router = DefaultRouter()
router.register("employes", EmployeViewSet, basename="employe")
router.register("historique", PointageViewSet, basename="pointage-historique")
router.register("absences", AbsenceViewSet, basename="absence")
router.register("lignes-paie", LignePaieViewSet, basename="ligne-paie")

urlpatterns = [
    path("scan/<uuid:token>/", scan_info, name="pointage-scan-info"),
    path("scan/<uuid:token>/valider/", scan_valider, name="pointage-scan-valider"),
    path("utilisateurs-disponibles/", utilisateurs_disponibles, name="pointage-utilisateurs-disponibles"),
    path("badge-temporaire/qr/", badge_temporaire_qr, name="pointage-badge-temporaire-qr"),
    path("badge-temporaire/<uuid:token>/employes/", badge_temporaire_employes, name="pointage-badge-temporaire-employes"),
    path("badge-temporaire/<uuid:token>/employes/<int:employe_id>/valider/", badge_temporaire_valider, name="pointage-badge-temporaire-valider"),
] + router.urls
