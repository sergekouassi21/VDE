import os
from decimal import Decimal
from io import BytesIO

import qrcode
from PIL import Image, ImageDraw, ImageFont
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import ProtectedError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from exploitation.models import RoleUtilisateur

from .models import Absence, Employe, LignePaie, Pointage
from .serializers import (
    AbsenceSerializer,
    CorrigerPointageSerializer,
    EmployeSerializer,
    LignePaieSerializer,
    PointageSerializer,
    ScanEmployeSerializer,
)


# Police en gras avec un vrai jeu de caractères latins accentués — la police
# par défaut de Pillow (Aileron) n'a pas les glyphes é/è/à/ô/... nécessaires
# aux noms français (cf. retour utilisateur, accents illisibles sur le badge).
POLICE_BADGE = os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf")


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
    queryset = Employe.objects.prefetch_related("fermes").all()

    def get_queryset(self):
        qs = super().get_queryset()
        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(fermes=ferme_id)
        return qs.distinct()

    @action(detail=True, methods=["get"], url_path="qr")
    def qr(self, request, pk=None):
        """Image PNG du badge de l'employé : le QR encode uniquement l'URL
        (essentiel pour que la caméra du téléphone l'ouvre directement au
        scan — un QR mêlant nom + URL empêche l'ouverture automatique sur
        beaucoup d'appareils), avec le nom écrit en texte lisible sous
        l'image, comme sur une carte d'identité classique."""
        employe = self.get_object()
        url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/{employe.qr_token}"
        qr_image = qrcode.make(url).convert("RGB")

        largeur, hauteur_qr = qr_image.size
        marge, hauteur_texte = 12, 40
        badge = Image.new("RGB", (largeur, hauteur_qr + marge + hauteur_texte), "white")
        badge.paste(qr_image, (0, 0))

        dessin = ImageDraw.Draw(badge)
        police = ImageFont.truetype(POLICE_BADGE, 24)
        boite = dessin.textbbox((0, 0), employe.nom, font=police)
        x = max((largeur - (boite[2] - boite[0])) // 2, 0)
        y = hauteur_qr + marge // 2
        dessin.text((x, y), employe.nom, fill="black", font=police)

        buffer = BytesIO()
        badge.save(buffer, format="PNG")
        return HttpResponse(buffer.getvalue(), content_type="image/png")

    def destroy(self, request, *args, **kwargs):
        # Un employé qui a déjà des pointages est protégé (PROTECT) — on
        # renvoie un message clair plutôt qu'un 500 (cf. modifierEmploye
        # pour désactiver un employé au lieu de le supprimer dans ce cas).
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Impossible de supprimer : cet employé a déjà des pointages enregistrés. Désactive-le plutôt."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PointageViewSet(viewsets.ModelViewSet):
    """Historique consultable, corrigeable et supprimable par Direction/
    Admin uniquement, filtrable par ferme/employé/période — même schéma de
    filtrage que l'Historique des points journaliers."""

    serializer_class = PointageSerializer
    permission_classes = [EstDirectionOuAdmin]
    http_method_names = ["get", "patch", "delete"]

    def get_queryset(self):
        qs = Pointage.objects.select_related("employe").prefetch_related("employe__fermes").all()

        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(employe__fermes=ferme_id)

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

    def partial_update(self, request, *args, **kwargs):
        # Corrige une heure d'arrivée/de départ saisie de travers (oubli de
        # scan, erreur) — les heures travaillées et le montant sont
        # recalculés dès que les deux heures sont connues, sinon remis à 0
        # (ex: on efface l'heure de fin par erreur, ça redevient "en cours").
        pointage = self.get_object()
        serializer = CorrigerPointageSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        donnees = serializer.validated_data

        nouvelle_date = donnees.get("date")
        if nouvelle_date and nouvelle_date != pointage.date:
            if Pointage.objects.filter(employe=pointage.employe, date=nouvelle_date).exclude(id=pointage.id).exists():
                return Response(
                    {"detail": "Un pointage existe déjà à cette date pour cet employé."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pointage.date = nouvelle_date

        if "heure_debut" in donnees:
            pointage.heure_debut = donnees["heure_debut"]
        if "heure_fin" in donnees:
            pointage.heure_fin = donnees["heure_fin"]

        if pointage.heure_debut and pointage.heure_fin and pointage.heure_fin <= pointage.heure_debut:
            return Response(
                {"detail": "Le départ doit être après l'arrivée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pointage.heure_debut and pointage.heure_fin:
            duree = pointage.heure_fin - pointage.heure_debut
            pointage.heures_travaillees = (Decimal(duree.total_seconds()) / Decimal(3600)).quantize(Decimal("0.01"))
            pointage.montant_du_jour = (pointage.heures_travaillees * pointage.employe.taux_horaire).quantize(Decimal("0.01"))
        else:
            pointage.heures_travaillees = Decimal("0.00")
            pointage.montant_du_jour = Decimal("0.00")

        pointage.save()
        return Response(PointageSerializer(pointage).data)


class AbsenceViewSet(viewsets.ModelViewSet):
    """Déclaration d'absences justifiées (payées comme une journée complète)
    — réservée à Direction/Admin. Une absence injustifiée ne nécessite
    aucune déclaration ici : elle ressort automatiquement du résumé/de la
    fiche de paie comme un jour ouvré sans Pointage ni Absence."""

    serializer_class = AbsenceSerializer
    permission_classes = [EstDirectionOuAdmin]
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = Absence.objects.select_related("employe").prefetch_related("employe__fermes").all()

        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(employe__fermes=ferme_id)

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

    def create(self, request, *args, **kwargs):
        employe_id = request.data.get("employe")
        date = request.data.get("date")
        if Pointage.objects.filter(employe_id=employe_id, date=date).exists():
            return Response(
                {"detail": "Cet employé a déjà un pointage à cette date — ce n'est pas une absence."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Absence.objects.filter(employe_id=employe_id, date=date).exists():
            return Response(
                {"detail": "Une absence est déjà déclarée à cette date pour cet employé."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().create(request, *args, **kwargs)


class LignePaieViewSet(viewsets.ModelViewSet):
    """Ajustements de paie du mois (frais, primes, avances, retenues,
    carburant, appel/internet, mode et statut de paiement) — réservé à
    Direction/Admin. Une seule ligne par employé et par mois : POST fait un
    upsert (crée ou met à jour) pour que le frontend n'ait pas à suivre
    l'existence préalable d'un enregistrement."""

    serializer_class = LignePaieSerializer
    permission_classes = [EstDirectionOuAdmin]
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = LignePaie.objects.select_related("employe").prefetch_related("employe__fermes").all()

        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(employe__fermes=ferme_id)

        employe_id = self.request.query_params.get("employe")
        if employe_id:
            qs = qs.filter(employe_id=employe_id)

        mois = self.request.query_params.get("mois")
        if mois:
            qs = qs.filter(mois=mois)

        return qs.order_by("-mois")

    def create(self, request, *args, **kwargs):
        instance = LignePaie.objects.filter(
            employe_id=request.data.get("employe"), mois=request.data.get("mois")
        ).first()
        serializer = self.get_serializer(instance, data=request.data, partial=bool(instance))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        code = status.HTTP_200_OK if instance else status.HTTP_201_CREATED
        return Response(serializer.data, status=code)


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
    roles = (
        RoleUtilisateur.CHEF_FERME, RoleUtilisateur.SOUS_CHEF_FERME, RoleUtilisateur.SUPERVISEUR,
        RoleUtilisateur.OUVRIER, RoleUtilisateur.GARDIEN,
    )
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
