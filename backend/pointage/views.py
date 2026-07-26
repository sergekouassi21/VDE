from io import BytesIO

import qrcode
from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from exploitation.models import RoleUtilisateur

from .models import Employe, Pointage
from .serializers import EmployeSerializer, PointageSerializer, ScanEmployeSerializer


class EstDirectionOuAdmin(BasePermission):
    """Seule la direction/l'administration gère les employés, les taux
    horaires et consulte l'historique des pointages (même règle que pour
    les Ventes) — les écrans de scan, eux, sont publics (cf. scan_info/
    scan_valider), l'employé n'ayant pas de compte utilisateur."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        profil = getattr(user, "profil", None)
        return not profil or profil.role in (RoleUtilisateur.DIRECTION, RoleUtilisateur.ADMIN)


class EmployeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeSerializer
    permission_classes = [EstDirectionOuAdmin]
    queryset = Employe.objects.select_related("ferme").all()

    def get_queryset(self):
        qs = super().get_queryset()
        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(ferme_id=ferme_id)
        return qs

    @action(detail=True, methods=["get"], url_path="qr")
    def qr(self, request, pk=None):
        """Image PNG du QR à imprimer sur le badge de l'employé — encode
        l'URL publique de scan côté frontend."""
        employe = self.get_object()
        url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/{employe.qr_token}"
        image = qrcode.make(url)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return HttpResponse(buffer.getvalue(), content_type="image/png")


class PointageViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique consultable par Direction/Admin uniquement, filtrable par
    ferme/employé/période — même schéma de filtrage que l'Historique des
    points journaliers."""

    serializer_class = PointageSerializer
    permission_classes = [EstDirectionOuAdmin]

    def get_queryset(self):
        qs = Pointage.objects.select_related("employe__ferme").all()

        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(employe__ferme_id=ferme_id)

        employe_id = self.request.query_params.get("employe")
        if employe_id:
            qs = qs.filter(employe_id=employe_id)

        date_debut = self.request.query_params.get("date_debut")
        if date_debut:
            qs = qs.filter(date__gte=date_debut)

        date_fin = self.request.query_params.get("date_fin")
        if date_fin:
            qs = qs.filter(date__lte=date_fin)

        return qs.order_by("-date")


def _etat_pointage(request, employe):
    aujourdhui = timezone.localdate()
    pointage = Pointage.objects.filter(employe=employe, date=aujourdhui).first()
    if pointage is None or not pointage.heure_debut:
        etat = "NON_COMMENCE"
    elif not pointage.heure_fin:
        etat = "EN_COURS"
    else:
        etat = "TERMINE"
    return {
        "employe": ScanEmployeSerializer(employe, context={"request": request}).data,
        "etat": etat,
        "heure_debut": pointage.heure_debut if pointage else None,
        "heure_fin": pointage.heure_fin if pointage else None,
        "heures_travaillees": pointage.heures_travaillees if pointage else None,
        "montant_du_jour": pointage.montant_du_jour if pointage else None,
    }


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
def utilisateurs_disponibles(request):
    """Comptes chef/sous-chef/superviseur pas encore liés à un Employe —
    sert à pré-remplir le formulaire d'ajout plutôt que de retaper un nom
    déjà connu du système (cf. retour utilisateur)."""
    User = get_user_model()
    deja_lies = Employe.objects.exclude(user=None).values_list("user_id", flat=True)
    roles = (RoleUtilisateur.CHEF_FERME, RoleUtilisateur.SOUS_CHEF_FERME, RoleUtilisateur.SUPERVISEUR)
    qs = (
        User.objects.filter(profil__role__in=roles)
        .exclude(id__in=deja_lies)
        .select_related("profil")
        .prefetch_related("profil__fermes")
    )
    resultats = []
    for user in qs:
        nom_complet = f"{user.first_name} {user.last_name}".strip() or user.username
        resultats.append({
            "id": user.id,
            "nom": nom_complet,
            "role": user.profil.role,
            "fermes": list(user.profil.fermes.values("id", "nom")),
        })
    return Response(resultats)


@api_view(["GET"])
@permission_classes([])
def scan_info(request, token):
    """Public — l'employé n'a pas de compte. Le token du QR (non-devinable)
    joue le rôle d'identifiant/autorisation."""
    employe = get_object_or_404(Employe, qr_token=token, actif=True)
    return Response(_etat_pointage(request, employe))


@api_view(["POST"])
@permission_classes([])
def scan_valider(request, token):
    """Premier scan du jour = heure de début, second = heure de fin (avec
    calcul heures/montant). Un scan supplémentaire une fois la journée
    terminée ne fait rien (idempotent) plutôt que d'écraser les valeurs."""
    employe = get_object_or_404(Employe, qr_token=token, actif=True)
    aujourdhui = timezone.localdate()
    pointage, _ = Pointage.objects.get_or_create(employe=employe, date=aujourdhui)
    if not pointage.heure_debut:
        pointage.valider_debut()
    elif not pointage.heure_fin:
        pointage.valider_fin()
    return Response(_etat_pointage(request, employe))
