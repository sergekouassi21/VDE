import calendar
import os
import uuid
from collections import defaultdict
from datetime import date as date_cls, timedelta
from decimal import Decimal
from io import BytesIO

import qrcode
from PIL import Image, ImageDraw, ImageFont
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import ProtectedError, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from exploitation.audit import AuditMixin, journaliser, journaliser_objet
from exploitation.calculs import _verrou_consultatif, _verrou_consultatif_texte, prix_moyen_sac_aliment
from exploitation.models import ActionAudit, Ferme, LigneFacture, PointJournalier, RoleUtilisateur
from exploitation.permissions import EstDirectionOuAdmin, IsFermeAccessibleTechnicienInclus
from exploitation.permissions import est_direction_ou_admin as _est_direction_ou_admin
from exploitation.permissions import est_technicien as _est_technicien
from exploitation.views import _limite_borne

# Espaces de noms pour pg_advisory_xact_lock (cf. exploitation/calculs.py,
# _LOCK_CLASSID_*) — classid 1 à 3 y sont déjà pris (numéro de facture, nom
# client, nom fournisseur), celui-ci continue la numérotation pour rester
# unique à l'échelle de toute la base (un seul espace de verrous
# consultatifs par connexion Postgres, partagé par toute l'appli). Cf.
# conversation du 01/08/2026 avec Serge.
_LOCK_CLASSID_APPAREIL_POINTAGE = 4
_LOCK_CLASSID_BADGE_TEMPORAIRE = 5
_LOCK_CLASSID_BADGE_ABSENCE = 6
_LOCK_CLASSID_ABSENCE_DECLARATION = 7
_LOCK_CLASSID_LIGNE_PAIE = 8
_LOCK_CLASSID_POINTAGE_CORRECTION = 9


class ThrottlePointagePublic(ScopedRateThrottle):
    """Applique la limite par IP aux endpoints publics du pointage (aucun
    compte à vérifier) — cf. audit du 30/07/2026 : rien n'empêchait un
    script de les marteler."""

    scope = "pointage_public"

from .models import (
    Absence, AppareilPointage, BadgeAbsence, BadgeTemporaire, DocumentEmploye, Employe, EvaluationEmploye,
    LignePaie, Pointage, StatutAbsence,
)

# Prix moyen de secours si un magasin n'a encore aucune commande d'aliment
# enregistrée (cf. exploitation.calculs.prix_moyen_sac_aliment, qui utilise
# sinon le prix réel moyen des commandes du magasin) — cf. conversation du
# 26/07/2026 avec Serge.
PRIX_ALIMENT_SAC_FCFA = Decimal("10755")
from .serializers import (
    AbsenceSerializer,
    CorrigerPointageSerializer,
    DocumentEmployeSerializer,
    EmployeSerializer,
    EvaluationEmployeSerializer,
    LignePaieSerializer,
    PointageSerializer,
    ScanEmployeSerializer,
    _noms_fermes,
    _role_employe,
    _telephone_employe,
)


# Police en gras avec un vrai jeu de caractères latins accentués — la police
# par défaut de Pillow (Aileron) n'a pas les glyphes é/è/à/ô/... nécessaires
# aux noms français (cf. retour utilisateur, accents illisibles sur le badge).
POLICE_BADGE = os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf")


def _composer_badge(url, texte):
    """QR (URL seule, pour que la caméra du téléphone l'ouvre directement)
    + texte lisible en gras sous l'image — utilisé pour le badge d'un
    employé comme pour le badge temporaire de secours."""
    qr_image = qrcode.make(url).convert("RGB")
    largeur, hauteur_qr = qr_image.size
    marge, hauteur_texte = 12, 40
    badge = Image.new("RGB", (largeur, hauteur_qr + marge + hauteur_texte), "white")
    badge.paste(qr_image, (0, 0))

    dessin = ImageDraw.Draw(badge)
    police = ImageFont.truetype(POLICE_BADGE, 24)
    boite = dessin.textbbox((0, 0), texte, font=police)
    x = max((largeur - (boite[2] - boite[0])) // 2, 0)
    dessin.text((x, hauteur_qr + marge // 2), texte, fill="black", font=police)

    buffer = BytesIO()
    badge.save(buffer, format="PNG")
    return buffer.getvalue()


class EmployeViewSet(AuditMixin, viewsets.ModelViewSet):
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
        """Image PNG du badge de l'employé — le QR encode uniquement l'URL
        (essentiel pour que la caméra du téléphone l'ouvre directement au
        scan), avec le nom écrit en texte lisible sous l'image, comme sur
        une carte d'identité classique."""
        employe = self.get_object()
        url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/{employe.qr_token}"
        return HttpResponse(_composer_badge(url, employe.nom), content_type="image/png")

    @action(detail=True, methods=["post"], url_path="regenerer-qr")
    def regenerer_qr(self, request, pk=None):
        """Invalide immédiatement l'ancien badge physique de cet employé
        (perdu, volé, ou simple rotation périodique décidée par la
        Direction) en générant un nouveau jeton — l'ancienne carte imprimée
        ne fonctionnera plus, il faut réimprimer/redistribuer le nouveau QR
        (cf. conversation du 29/07/2026 avec Serge)."""
        employe = self.get_object()
        employe.qr_token = uuid.uuid4()
        employe.save(update_fields=["qr_token"])
        journaliser_objet(request.user, ActionAudit.MODIFICATION, employe, details="Régénération du badge QR")
        url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/{employe.qr_token}"
        return HttpResponse(_composer_badge(url, employe.nom), content_type="image/png")

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


class EvaluationEmployeViewSet(viewsets.ModelViewSet):
    """Évaluation du travail d'un employé (ponctualité, qualité du travail,
    comportement + commentaire) — lecture ouverte à qui a accès à la ferme
    (chef de ferme inclus), mais seuls le technicien/vétérinaire et la
    Direction/Admin peuvent noter (créer/modifier/supprimer), même règle
    que VisiteTechniqueViewSet côté exploitation. Cf. conversation du
    05/08/2026 avec Serge."""

    serializer_class = EvaluationEmployeSerializer
    permission_classes = [IsFermeAccessibleTechnicienInclus]

    def get_queryset(self):
        fermes = Ferme.objects.filter_visibles_par(self.request.user)
        qs = EvaluationEmploye.objects.filter(employe__fermes__in=fermes).distinct().select_related("employe", "created_by")
        ferme_id = self.request.query_params.get("ferme")
        if ferme_id:
            qs = qs.filter(employe__fermes__id=ferme_id)
        employe_id = self.request.query_params.get("employe")
        if employe_id:
            qs = qs.filter(employe_id=employe_id)
        return qs

    def _verifier_peut_noter(self):
        user = self.request.user
        if not (_est_technicien(user) or _est_direction_ou_admin(user)):
            raise PermissionDenied("Seuls un technicien/vétérinaire ou la Direction peuvent noter un employé.")

    def perform_create(self, serializer):
        self._verifier_peut_noter()
        employe = serializer.validated_data["employe"]
        if not Ferme.objects.filter_visibles_par(self.request.user).filter(employes=employe).exists():
            raise PermissionDenied("Employé non accessible.")
        serializer.save(created_by=self.request.user)
        journaliser_objet(self.request.user, ActionAudit.CREATION, serializer.instance)

    def perform_update(self, serializer):
        self._verifier_peut_noter()
        employe = serializer.validated_data.get("employe")
        if employe and not Ferme.objects.filter_visibles_par(self.request.user).filter(employes=employe).exists():
            raise PermissionDenied("Employé non accessible.")
        serializer.save()
        journaliser_objet(self.request.user, ActionAudit.MODIFICATION, serializer.instance)

    def perform_destroy(self, instance):
        self._verifier_peut_noter()
        modele, objet_id, objet_repr = instance.__class__.__name__, instance.pk, str(instance)
        super().perform_destroy(instance)
        journaliser(self.request.user, ActionAudit.SUPPRESSION, modele, objet_id, objet_repr)


class DocumentEmployeViewSet(AuditMixin, viewsets.ModelViewSet):
    """Documents administratifs (CNI, contrat...) d'un employé — réservé à
    Direction/Admin, vu la sensibilité de ces pièces."""

    serializer_class = DocumentEmployeSerializer
    permission_classes = [EstDirectionOuAdmin]
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = DocumentEmploye.objects.select_related("employe")
        employe_id = self.request.query_params.get("employe")
        if employe_id:
            qs = qs.filter(employe_id=employe_id)
        return qs


class PointageViewSet(AuditMixin, viewsets.ModelViewSet):
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

        qs = qs.order_by("-date")
        # Borne la réponse de list() seulement — trancher casserait
        # get_object() pour retrieve/patch/delete (cf. exploitation/views.py,
        # même garde-fou, audit du 01/08/2026 : ce viewset avait été oublié).
        if self.action == "list":
            qs = qs[:_limite_borne(self.request, 500)]
        return qs

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        # Corrige une heure d'arrivée/de départ saisie de travers (oubli de
        # scan, erreur) — les heures travaillées et le montant sont
        # recalculés dès que les deux heures sont connues, sinon remis à 0
        # (ex: on efface l'heure de fin par erreur, ça redevient "en cours").
        # Verrou consultatif + refresh_from_db : sans eux, deux corrections
        # concurrentes du même pointage pouvaient perdre l'une des deux
        # écritures (cf. conversation du 02/08/2026 avec Serge, même
        # correctif que modifier_transfert_stock côté exploitation).
        pointage = self.get_object()
        _verrou_consultatif(_LOCK_CLASSID_POINTAGE_CORRECTION, pointage.id)
        pointage.refresh_from_db()
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
        journaliser_objet(request.user, ActionAudit.MODIFICATION, pointage, details="Correction pointage")
        return Response(PointageSerializer(pointage).data)


class AbsenceViewSet(AuditMixin, viewsets.ModelViewSet):
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

        statut = self.request.query_params.get("statut")
        if statut:
            qs = qs.filter(statut=statut)

        qs = qs.order_by("-date")
        if self.action == "list":
            qs = qs[:_limite_borne(self.request, 500)]
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        employe_id = request.data.get("employe")
        date = request.data.get("date")
        # Verrou consultatif avant les contrôles "pas déjà déclaré" : sans
        # lui, deux déclarations concurrentes pour le même employé/jour (un
        # superviseur via badge + Direction manuellement, ou deux
        # superviseurs) pouvaient toutes les deux passer ces contrôles, et
        # la seconde plantait avec une IntegrityError non gérée (500) sur la
        # contrainte unique employe+date au lieu de ce message clair (cf.
        # conversation du 01/08/2026 avec Serge).
        _verrou_consultatif_texte(_LOCK_CLASSID_ABSENCE_DECLARATION, f"{employe_id}:{date}")
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

    @action(detail=True, methods=["post"], url_path="valider")
    def valider(self, request, pk=None):
        """Approuve une absence signalée par un superviseur (badge dédié) —
        devient payée comme une journée complète."""
        absence = self.get_object()
        absence.statut = StatutAbsence.VALIDEE
        absence.save(update_fields=["statut"])
        journaliser_objet(request.user, ActionAudit.MODIFICATION, absence, details="Absence validée")
        return Response(AbsenceSerializer(absence).data)

    @action(detail=True, methods=["post"], url_path="rejeter")
    def rejeter(self, request, pk=None):
        """Rejette une absence signalée par un superviseur — reste non
        payée, mais gardée en trace (contrairement à une suppression)."""
        absence = self.get_object()
        absence.statut = StatutAbsence.REJETEE
        absence.save(update_fields=["statut"])
        journaliser_objet(request.user, ActionAudit.MODIFICATION, absence, details="Absence rejetée")
        return Response(AbsenceSerializer(absence).data)


class LignePaieViewSet(AuditMixin, viewsets.ModelViewSet):
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

        qs = qs.order_by("-mois")
        if self.action == "list":
            qs = qs[:_limite_borne(self.request, 500)]
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        # Verrou consultatif avant de décider créer vs mettre à jour : sans
        # lui, deux upserts concurrents pour le même employé/mois pouvaient
        # tous les deux se voir sans instance existante et tenter chacun une
        # création, la seconde plantant sur la contrainte unique employe+mois
        # (cf. conversation du 01/08/2026 avec Serge).
        _verrou_consultatif_texte(_LOCK_CLASSID_LIGNE_PAIE, f"{request.data.get('employe')}:{request.data.get('mois')}")
        instance = LignePaie.objects.filter(
            employe_id=request.data.get("employe"), mois=request.data.get("mois")
        ).first()
        serializer = self.get_serializer(instance, data=request.data, partial=bool(instance))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        code = status.HTTP_200_OK if instance else status.HTTP_201_CREATED
        journaliser_objet(
            request.user, ActionAudit.MODIFICATION if instance else ActionAudit.CREATION, serializer.instance,
        )
        return Response(serializer.data, status=code)


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
def resume_paie(request):
    """Porte côté serveur le résumé par employé auparavant recalculé en JS
    dans PointageHistorique.jsx (montant du jour d'absence justifiée, jours
    de repos dus/travaillés, détection des absences injustifiées) — pour
    que la fiche de paie PDF ne soit plus générée à partir de chiffres
    jamais validés côté serveur. Mêmes filtres que PointageViewSet/
    AbsenceViewSet, + mois pour joindre LignePaie. Les clés de la réponse
    restent en camelCase pour correspondre exactement à ce que
    PointageHistorique.jsx lit déjà — ce blob n'est consommé que par cette
    page et le générateur de PDF, pas une ressource REST classique. Cf.
    conversation du 02/08/2026 avec Serge."""
    ferme_id = request.query_params.get("ferme")
    employe_id = request.query_params.get("employe")
    date_debut = request.query_params.get("date_debut")
    date_fin = request.query_params.get("date_fin")
    mois = request.query_params.get("mois")

    employes = Employe.objects.prefetch_related("fermes").all()
    if ferme_id:
        employes = employes.filter(fermes=ferme_id).distinct()
    if employe_id:
        employes = employes.filter(id=employe_id)
    employes = list(employes)

    pointages_qs = Pointage.objects.filter(employe__in=employes)
    absences_qs = Absence.objects.filter(employe__in=employes)
    if date_debut:
        pointages_qs = pointages_qs.filter(date__gte=date_debut)
        absences_qs = absences_qs.filter(date__gte=date_debut)
    if date_fin:
        pointages_qs = pointages_qs.filter(date__lte=date_fin)
        absences_qs = absences_qs.filter(date__lte=date_fin)
    lignes_paie_qs = LignePaie.objects.filter(employe__in=employes, mois=mois) if mois else LignePaie.objects.none()

    pointages_par_employe = defaultdict(list)
    for p in pointages_qs.select_related("employe"):
        pointages_par_employe[p.employe_id].append(p)
    absences_par_employe = defaultdict(list)
    for a in absences_qs.select_related("employe"):
        absences_par_employe[a.employe_id].append(a)
    lignes_paie_par_employe = {lp.employe_id: lp for lp in lignes_paie_qs}

    date_debut_obj = date_cls.fromisoformat(date_debut) if date_debut else None
    date_fin_obj = date_cls.fromisoformat(date_fin) if date_fin else None
    aujourdhui = timezone.localdate()

    resultat = []
    for emp in employes:
        pointages_termines = [p for p in pointages_par_employe.get(emp.id, []) if p.heure_fin]
        absences_emp = absences_par_employe.get(emp.id, [])
        ligne_paie = lignes_paie_par_employe.get(emp.id)

        total_heures = sum((p.heures_travaillees for p in pointages_termines), Decimal("0"))
        total_montant = sum((p.montant_du_jour for p in pointages_termines), Decimal("0"))

        absences_justifiees = []
        for a in absences_emp:
            if a.statut == StatutAbsence.VALIDEE:
                montant = emp.salaire_journalier
                absences_justifiees.append({"id": a.id, "date": a.date, "motif": a.motif, "montant": montant})
                total_montant += montant

        if ligne_paie:
            total_montant += (
                ligne_paie.frais + ligne_paie.primes + ligne_paie.carburant + ligne_paie.appel_internet
                - ligne_paie.avances - ligne_paie.retenues
            )

        jours_absence_injustifiee = []
        jours_repos_dus = 0
        jours_repos_travailles = []
        if date_debut_obj and date_fin_obj and emp.actif:
            jours_pointes = {p.date for p in pointages_termines}
            # Une absence rejetée reste une absence non payée : on ne
            # l'exclut PAS de la détection des trous, pour qu'elle ressorte
            # comme injustifiée (même règle que le JS remplacé).
            jours_absence_declaree = {a.date for a in absences_emp if a.statut != StatutAbsence.REJETEE}
            jour = date_debut_obj
            while jour <= date_fin_obj and jour <= aujourdhui:
                if emp.jour_repos is not None and jour.weekday() == emp.jour_repos:
                    jours_repos_dus += 1
                    if jour in jours_pointes:
                        jours_repos_travailles.append(jour.isoformat())
                elif jour not in jours_pointes and jour not in jours_absence_declaree:
                    jours_absence_injustifiee.append(jour.isoformat())
                jour += timedelta(days=1)

        if not pointages_termines and not absences_justifiees and not jours_absence_injustifiee and not ligne_paie:
            continue

        resultat.append({
            "employeId": emp.id, "nom": emp.nom, "fermeNom": _noms_fermes(emp), "role": _role_employe(emp),
            "telephone": _telephone_employe(emp), "salaireMensuel": emp.salaire_mensuel, "jourRepos": emp.jour_repos,
            "actif": emp.actif,
            "lignesTravaillees": PointageSerializer(pointages_termines, many=True, context={"request": request}).data,
            "absencesJustifiees": absences_justifiees,
            "joursAbsenceInjustifiee": jours_absence_injustifiee,
            "totalHeures": total_heures, "totalMontant": total_montant,
            "lignePaie": LignePaieSerializer(ligne_paie).data if ligne_paie else None,
            "joursReposDus": jours_repos_dus, "joursReposTravailles": jours_repos_travailles,
        })

    resultat.sort(key=lambda g: g["nom"])
    return Response(resultat)


def _appareil_autorise(request):
    """True si aucun AppareilPointage n'est encore configuré (transition en
    douceur), ou si le jeton présenté dans l'en-tête X-Appareil-Token
    correspond à celui du téléphone unique autorisé et que ce jeton n'a pas
    expiré (cf. conversation du 28/07/2026 avec Serge : empêcher qu'un autre
    téléphone valide un pointage à partir d'un QR d'employé photographié/
    partagé — et limiter la fenêtre d'exploitation d'un téléphone volé non
    remarqué)."""
    appareil = AppareilPointage.objects.first()
    if not appareil:
        return True
    if appareil.est_expire():
        return False
    autorise = request.headers.get("X-Appareil-Token") == str(appareil.token)
    if autorise:
        appareil.derniere_utilisation = timezone.now()
        appareil.save(update_fields=["derniere_utilisation"])
    return autorise


# Durée maximale plausible d'une garde de nuit — au-delà, un pointage
# d'hier encore ouvert est traité comme un badge oublié (pas une vraie
# garde en cours) : le scan du jour démarre une nouvelle journée au lieu de
# "fermer" l'ancien pointage avec une durée aberrante (~24h). Sans cette
# borne, un employé de jour qui oublie de débadger le soir et rebadge le
# lendemain matin verrait son arrivée du lendemain interprétée à tort comme
# la fin de la garde de la veille. Cf. conversation du 02/08/2026 avec Serge.
DUREE_MAX_GARDE_HEURES = 16


def _garde_ouverte_hier(employe):
    """Une garde de nuit d'hier encore ouverte (heure_debut posé, heure_fin
    non posé) — le prochain scan doit la clôturer plutôt que de créer un
    nouveau pointage "aujourd'hui" mal étiqueté comme une nouvelle arrivée.
    Bornée à hier (pas n'importe quelle date passée) ET à une durée
    plausible (DUREE_MAX_GARDE_HEURES), pour ne pas réattribuer un pointage
    oublié au scan du jour. Cf. conversation du 02/08/2026 avec Serge."""
    hier = timezone.localdate() - timedelta(days=1)
    limite = timezone.now() - timedelta(hours=DUREE_MAX_GARDE_HEURES)
    return Pointage.objects.filter(
        employe=employe, date=hier, heure_debut__isnull=False, heure_fin__isnull=True, heure_debut__gte=limite,
    ).first()


def _pointage_actuel(employe):
    """Lecture seule (pas de get_or_create) — le pointage à afficher pour
    cet employé maintenant : une garde d'hier encore ouverte, sinon celui
    d'aujourd'hui s'il existe déjà."""
    return _garde_ouverte_hier(employe) or Pointage.objects.filter(employe=employe, date=timezone.localdate()).first()


def _traiter_scan(employe, photo=None, via_secours=False):
    """Résout le pointage concerné par ce scan (garde de nuit d'hier encore
    ouverte, sinon celui d'aujourd'hui) et y applique l'arrivée ou le
    départ. `deja_complet` indique qu'aucune action n'a été faite (journée
    déjà terminée) — un 3e scan ne crée pas de 2e plage, mais le signale au
    lieu d'un no-op silencieux (cf. conversation du 02/08/2026 avec Serge)."""
    pointage = _garde_ouverte_hier(employe)
    if pointage is None:
        pointage, _ = Pointage.objects.get_or_create(employe=employe, date=timezone.localdate())
    if not pointage.heure_debut:
        pointage.valider_debut(photo=photo, via_secours=via_secours)
        return pointage, False
    if not pointage.heure_fin:
        pointage.valider_fin(photo=photo, via_secours=via_secours)
        return pointage, False
    return pointage, True


def _reponse_etat(request, employe, pointage, deja_complet=False):
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
        "deja_complet": deja_complet,
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


# Bornes du selfie anti-fraude accepté aux endpoints publics de pointage —
# sans ça, un appel direct à l'API (hors app) pouvait poster n'importe quel
# fichier (vidéo volumineuse, binaire renommé) sans aucune vérification,
# ces vues n'exigeant ni compte utilisateur ni permission DRF.
TAILLE_MAX_SELFIE_OCTETS = 8 * 1024 * 1024


def _erreur_photo_invalide(photo):
    """Renvoie un message d'erreur si `photo` n'est pas exploitable comme
    selfie, sinon None. Vérifie la taille puis que le contenu est une
    image décodable (pas seulement l'extension/le content-type déclarés,
    facilement falsifiables)."""
    if photo.size > TAILLE_MAX_SELFIE_OCTETS:
        return "Photo trop volumineuse (8 Mo maximum)."
    try:
        image = Image.open(photo)
        image.verify()
    except Exception:
        return "Fichier image invalide."
    finally:
        photo.seek(0)
    return None


@api_view(["GET"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def scan_info(request, token):
    """Public — l'employé n'a pas de compte. Le token du QR (non-devinable)
    joue le rôle d'identifiant/autorisation."""
    employe = get_object_or_404(Employe, qr_token=token, actif=True)
    return Response(_reponse_etat(request, employe, _pointage_actuel(employe)))


@api_view(["POST"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def scan_valider(request, token):
    """Premier scan du jour = heure de début, second = heure de fin (avec
    calcul heures/montant). Un scan supplémentaire une fois la journée
    terminée ne fait rien (idempotent) plutôt que d'écraser les valeurs.

    Un selfie est obligatoire à chaque validation (arrivée et départ) —
    dissuade et permet de vérifier a posteriori qu'un employé n'a pas
    scanné le badge d'un collègue absent, un seul téléphone partagé servant
    maintenant à scanner tout le monde (cf. conversation du 28/07/2026).
    Le jeton d'appareil (X-Appareil-Token) garantit en plus que seul CE
    téléphone peut valider, même si le QR d'un employé a été photographié
    ou partagé."""
    if not _appareil_autorise(request):
        return Response({"detail": "Cet appareil n'est pas autorisé à valider les pointages."}, status=status.HTTP_403_FORBIDDEN)
    photo = request.FILES.get("photo")
    if not photo:
        return Response({"detail": "Une photo est requise pour valider le pointage."}, status=status.HTTP_400_BAD_REQUEST)
    erreur = _erreur_photo_invalide(photo)
    if erreur:
        return Response({"detail": erreur}, status=status.HTTP_400_BAD_REQUEST)
    employe = get_object_or_404(Employe, qr_token=token, actif=True)
    pointage, deja_complet = _traiter_scan(employe, photo=photo)
    return Response(_reponse_etat(request, employe, pointage, deja_complet=deja_complet))


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
@transaction.atomic
def appareil_pointage_qr(request):
    """Image PNG du QR d'activation du téléphone unique autorisé à valider
    les pointages — à faire scanner UNE FOIS par le téléphone désigné (cf.
    conversation du 28/07/2026 avec Serge). Une seule instance
    d'AppareilPointage existe en pratique (créée à la demande si absente) —
    le verrou consultatif ci-dessous évite que deux appels concurrents (page
    ouverte deux fois avant la toute première activation) n'en créent
    chacun une, ce qui désynchroniserait le jeton réellement vérifié partout
    (_appareil_autorise ne regarde que le premier, par pk) de celui imprimé
    sur le QR généré par le second appel (cf. conversation du 01/08/2026
    avec Serge)."""
    _verrou_consultatif(_LOCK_CLASSID_APPAREIL_POINTAGE, 1)
    appareil = AppareilPointage.objects.first() or AppareilPointage.objects.create()
    url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/appareil/{appareil.token}"
    return HttpResponse(_composer_badge(url, "Téléphone de pointage"), content_type="image/png")


@api_view(["POST"])
@permission_classes([EstDirectionOuAdmin])
@transaction.atomic
def appareil_pointage_regenerer(request):
    """Invalide immédiatement le téléphone actuellement autorisé (perte,
    vol, remplacement) en générant un nouveau jeton — l'ancien téléphone ne
    pourra plus valider aucun pointage tant qu'il n'aura pas re-scanné le
    nouveau QR. Même verrou que appareil_pointage_qr : deux régénérations
    concurrentes ne doivent pas pouvoir laisser deux instances vivantes."""
    _verrou_consultatif(_LOCK_CLASSID_APPAREIL_POINTAGE, 1)
    AppareilPointage.objects.all().delete()
    appareil = AppareilPointage.objects.create()
    journaliser(request.user, ActionAudit.MODIFICATION, "AppareilPointage", appareil.pk, str(appareil), details="Régénération du jeton")
    url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/appareil/{appareil.token}"
    return HttpResponse(_composer_badge(url, "Téléphone de pointage"), content_type="image/png")


@api_view(["GET"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def appareil_pointage_verifier(request, token):
    """Public — la page d'activation appelle ceci avant d'enregistrer le
    jeton dans le navigateur du téléphone, pour ne pas stocker un jeton
    invalide/déjà régénéré silencieusement."""
    valide = AppareilPointage.objects.filter(token=token).exists()
    return Response({"valide": valide})


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
def appareil_pointage_statut(request):
    """Indique si la protection « téléphone unique » est actuellement
    activée — sert à afficher un bouton Activer/Désactiver explicite côté
    Direction plutôt que de la déclencher silencieusement en affichant
    juste le QR (cf. conversation du 28/07/2026 avec Serge : le téléphone
    désigné n'était pas encore disponible pour scanner le QR, ce qui
    bloquait tous les pointages dès que la protection était activée)."""
    appareil = AppareilPointage.objects.first()
    if not appareil:
        return Response({"actif": False})
    return Response({
        "actif": True,
        "expire": appareil.est_expire(),
        "derniere_utilisation": appareil.derniere_utilisation,
        "expire_le": appareil.cree_le + timedelta(days=AppareilPointage.VALIDITE_JOURS),
    })


@api_view(["POST"])
@permission_classes([EstDirectionOuAdmin])
def appareil_pointage_desactiver(request):
    """Désactive complètement la protection « téléphone unique » — tant
    qu'aucun AppareilPointage n'existe, _appareil_autorise n'exige plus
    aucun jeton et tous les pointages redeviennent possibles depuis
    n'importe quel appareil (retour à l'état d'avant cette fonctionnalité)."""
    supprimes = AppareilPointage.objects.count()
    AppareilPointage.objects.all().delete()
    if supprimes:
        journaliser(request.user, ActionAudit.MODIFICATION, "AppareilPointage", 0, "Téléphone unique", details="Désactivation de la protection")
    return Response({"actif": False})


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
@transaction.atomic
def badge_temporaire_qr(request):
    """Image PNG du badge de secours (imprimé une seule fois) — réservée à
    Direction/Admin. Une seule instance de BadgeTemporaire existe en
    pratique (créée à la demande si absente) — même verrou consultatif que
    appareil_pointage_qr, même raison (cf. conversation du 01/08/2026 avec
    Serge)."""
    _verrou_consultatif(_LOCK_CLASSID_BADGE_TEMPORAIRE, 1)
    badge = BadgeTemporaire.objects.first() or BadgeTemporaire.objects.create()
    url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/temporaire/{badge.token}"
    return HttpResponse(_composer_badge(url, "Badge temporaire"), content_type="image/png")


@api_view(["GET"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def badge_temporaire_employes(request, token):
    """Public — sert de repli pour un employé qui a oublié/perdu son badge.
    Liste tous les employés actifs avec leur état du jour, pour que le
    superviseur choisisse manuellement la bonne personne."""
    get_object_or_404(BadgeTemporaire, token=token)
    ferme_id = request.query_params.get("ferme")
    employes = Employe.objects.filter(actif=True).prefetch_related("fermes")
    if ferme_id:
        employes = employes.filter(fermes=ferme_id).distinct()
    return Response([_reponse_etat(request, e, _pointage_actuel(e)) for e in employes.order_by("nom")])


@api_view(["POST"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def badge_temporaire_valider(request, token, employe_id):
    """Valide l'arrivée/le départ de l'employé choisi manuellement sur
    l'écran du badge temporaire — même logique idempotente, même selfie
    obligatoire et même vérification d'appareil que scan_valider (ce badge
    partagé n'a même pas de jeton personnel à vérifier, donc ces deux
    garde-fous y sont encore plus indispensables)."""
    if not _appareil_autorise(request):
        return Response({"detail": "Cet appareil n'est pas autorisé à valider les pointages."}, status=status.HTTP_403_FORBIDDEN)
    photo = request.FILES.get("photo")
    if not photo:
        return Response({"detail": "Une photo est requise pour valider le pointage."}, status=status.HTTP_400_BAD_REQUEST)
    erreur = _erreur_photo_invalide(photo)
    if erreur:
        return Response({"detail": erreur}, status=status.HTTP_400_BAD_REQUEST)
    get_object_or_404(BadgeTemporaire, token=token)
    employe = get_object_or_404(Employe, id=employe_id, actif=True)
    pointage, deja_complet = _traiter_scan(employe, photo=photo, via_secours=True)
    return Response(_reponse_etat(request, employe, pointage, deja_complet=deja_complet))


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
@transaction.atomic
def badge_absence_qr(request):
    """Image PNG du badge dédié aux signalements d'absence (distinct du
    badge de secours pointage) — réservée à Direction/Admin. Même verrou
    consultatif que appareil_pointage_qr, même raison (cf. conversation du
    01/08/2026 avec Serge)."""
    _verrou_consultatif(_LOCK_CLASSID_BADGE_ABSENCE, 1)
    badge = BadgeAbsence.objects.first() or BadgeAbsence.objects.create()
    url = f"{settings.FRONTEND_URL.rstrip('/')}/pointage/absence/{badge.token}"
    return HttpResponse(_composer_badge(url, "Badge absence"), content_type="image/png")


@api_view(["GET"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
def badge_absence_employes(request, token):
    """Public — liste des employés actifs pour que le superviseur choisisse
    qui est absent avant de saisir le motif."""
    get_object_or_404(BadgeAbsence, token=token)
    ferme_id = request.query_params.get("ferme")
    employes = Employe.objects.filter(actif=True).prefetch_related("fermes")
    if ferme_id:
        employes = employes.filter(fermes=ferme_id).distinct()
    return Response([
        {"id": e.id, "nom": e.nom, "ferme_nom": ", ".join(e.fermes.values_list("nom", flat=True))}
        for e in employes.order_by("nom")
    ])


@api_view(["POST"])
@permission_classes([])
@throttle_classes([ThrottlePointagePublic])
@transaction.atomic
def badge_absence_declarer(request, token):
    """Public — le superviseur signale l'absence d'un employé avec un
    motif obligatoire. Reste EN_ATTENTE jusqu'à validation par
    Direction/Admin (payée si validée, pas payée sinon) — mêmes règles de
    conflit que la déclaration directe (AbsenceViewSet.create), même verrou
    consultatif contre une double déclaration concurrente (cf. conversation
    du 01/08/2026 avec Serge)."""
    get_object_or_404(BadgeAbsence, token=token)
    employe_id = request.data.get("employe")
    date = request.data.get("date")
    motif = (request.data.get("motif") or "").strip()
    if not employe_id or not date:
        return Response({"detail": "Employé et date requis."}, status=status.HTTP_400_BAD_REQUEST)
    if not motif:
        return Response({"detail": "Le motif est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)
    _verrou_consultatif_texte(_LOCK_CLASSID_ABSENCE_DECLARATION, f"{employe_id}:{date}")
    employe = get_object_or_404(Employe, id=employe_id, actif=True)
    if Pointage.objects.filter(employe=employe, date=date).exists():
        return Response(
            {"detail": "Cet employé a déjà un pointage à cette date — ce n'est pas une absence."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if Absence.objects.filter(employe=employe, date=date).exists():
        return Response(
            {"detail": "Une absence est déjà déclarée à cette date pour cet employé."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    absence = Absence.objects.create(employe=employe, date=date, motif=motif, statut=StatutAbsence.EN_ATTENTE)
    return Response(AbsenceSerializer(absence).data, status=status.HTTP_201_CREATED)


def _mois_bornes(mois_param):
    debut = date_cls.fromisoformat(mois_param) if mois_param else timezone.localdate().replace(day=1)
    debut = debut.replace(day=1)
    dernier_jour = calendar.monthrange(debut.year, debut.month)[1]
    fin = min(debut.replace(day=dernier_jour), timezone.localdate())
    return debut, fin


def _calculer_rentabilite_bruts(fermes, debut, fin):
    """Cœur du calcul de rentabilité (revenus/coût aliment/coût paie, en
    Decimal bruts) — partagé entre /rentabilite et le rapport mensuel
    consolidé (point 11 du backlog). Un employé qui couvre plusieurs fermes
    (ex: un superviseur) voit son coût du mois (pointages + absences
    validées + ajustements LignePaie) réparti à parts égales entre ses
    fermes — cf. conversation du 26/07/2026 avec Serge."""
    fermes_ids = {f.id for f in fermes}
    fermes_par_id = {f.id: f for f in fermes}
    resultats = {
        f.id: {"ferme_id": f.id, "ferme_nom": f.nom, "revenus": Decimal("0"), "cout_aliment": Decimal("0"), "cout_paie": Decimal("0"), "prix_sac": None}
        for f in fermes
    }

    for ligne in (
        LigneFacture.objects.filter(ferme_id__in=fermes_ids, facture__date__gte=debut, facture__date__lte=fin)
        .values("ferme_id").annotate(total=Sum("montant"))
    ):
        resultats[ligne["ferme_id"]]["revenus"] = ligne["total"] or Decimal("0")

    for ligne in (
        PointJournalier.objects.filter(bande__ferme_id__in=fermes_ids, date__gte=debut, date__lte=fin)
        .values("bande__ferme_id").annotate(sacs=Sum("conso_aliment_sacs"))
    ):
        sacs = ligne["sacs"] or Decimal("0")
        magasin = fermes_par_id[ligne["bande__ferme_id"]].magasin
        prix_sac = prix_moyen_sac_aliment(magasin, jusqua_date=fin, defaut=PRIX_ALIMENT_SAC_FCFA)
        resultats[ligne["bande__ferme_id"]]["cout_aliment"] = sacs * prix_sac
        resultats[ligne["bande__ferme_id"]]["prix_sac"] = prix_sac

    for employe in Employe.objects.filter(actif=True).prefetch_related("fermes"):
        fermes_employe = [f for f in employe.fermes.all() if f.id in fermes_ids]
        if not fermes_employe:
            continue
        cout_pointages = Pointage.objects.filter(
            employe=employe, date__gte=debut, date__lte=fin, heure_fin__isnull=False,
        ).aggregate(total=Sum("montant_du_jour"))["total"] or Decimal("0")
        nb_absences_validees = Absence.objects.filter(
            employe=employe, date__gte=debut, date__lte=fin, statut=StatutAbsence.VALIDEE,
        ).count()
        cout_absences = employe.salaire_journalier * nb_absences_validees
        ligne_paie = LignePaie.objects.filter(employe=employe, mois=debut).first()
        cout_ajustements = Decimal("0")
        if ligne_paie:
            cout_ajustements = (
                ligne_paie.frais + ligne_paie.primes + ligne_paie.carburant + ligne_paie.appel_internet
                - ligne_paie.avances - ligne_paie.retenues
            )
        part = (cout_pointages + cout_absences + cout_ajustements) / len(fermes_employe)
        for f in fermes_employe:
            resultats[f.id]["cout_paie"] += part

    return resultats


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
def rentabilite(request):
    """Marge par ferme sur un mois : revenus des ventes moins coût de
    l'aliment (valorisé au prix réel moyen des commandes) moins coût de
    la paie."""
    debut, fin = _mois_bornes(request.query_params.get("mois"))
    fermes = list(Ferme.objects.filter_visibles_par(request.user).select_related("magasin"))
    resultats = _calculer_rentabilite_bruts(fermes, debut, fin)

    donnees = []
    total = {"revenus": Decimal("0"), "cout_aliment": Decimal("0"), "cout_paie": Decimal("0"), "marge": Decimal("0")}
    for r in resultats.values():
        marge = r["revenus"] - r["cout_aliment"] - r["cout_paie"]
        for cle in ("revenus", "cout_aliment", "cout_paie"):
            total[cle] += r[cle]
        total["marge"] += marge
        donnees.append({
            "ferme_id": r["ferme_id"], "ferme_nom": r["ferme_nom"],
            "revenus": str(r["revenus"].quantize(Decimal("1"))),
            "cout_aliment": str(r["cout_aliment"].quantize(Decimal("1"))),
            "cout_paie": str(r["cout_paie"].quantize(Decimal("1"))),
            "marge": str(marge.quantize(Decimal("1"))),
            "prix_sac": str(r["prix_sac"].quantize(Decimal("1"))) if r["prix_sac"] is not None else None,
        })
    donnees.sort(key=lambda d: d["ferme_nom"])
    return Response({
        "mois": debut.isoformat(),
        "prix_aliment_sac_defaut": str(PRIX_ALIMENT_SAC_FCFA),
        "fermes": donnees,
        "total": {k: str(v.quantize(Decimal("1"))) for k, v in total.items()},
    })


@api_view(["GET"])
@permission_classes([EstDirectionOuAdmin])
def rapport_mensuel(request):
    """Rapport mensuel consolidé : synthèse zootechnique (production/
    mortalité/IC/ponte ou poids-GMQ) + financière (revenus/coûts/marge,
    même calcul que /rentabilite) par ferme et globale, pour un mois donné
    — cf. conversation du 27/07/2026 (point 11 du backlog)."""
    debut, fin = _mois_bornes(request.query_params.get("mois"))
    fermes = list(Ferme.objects.filter_visibles_par(request.user).select_related("magasin"))
    fermes_ids = {f.id for f in fermes}
    financier = _calculer_rentabilite_bruts(fermes, debut, fin)

    zoo = {
        ligne["bande__ferme_id"]: ligne
        for ligne in (
            PointJournalier.objects.filter(bande__ferme_id__in=fermes_ids, date__gte=debut, date__lte=fin)
            .values("bande__ferme_id")
            .annotate(
                morts=Sum("morts"), production_oeufs=Sum("production_oeufs"), casse=Sum("casse"), brise=Sum("brise"),
                effectif_jours=Sum("effectif_reste"), aliment_sacs=Sum("conso_aliment_sacs"),
            )
        )
    }

    donnees = []
    total = {
        "revenus": Decimal("0"), "cout_aliment": Decimal("0"), "cout_paie": Decimal("0"), "marge": Decimal("0"),
        "total_morts": 0, "total_production_oeufs": 0,
    }
    for ferme in fermes:
        r = financier[ferme.id]
        z = zoo.get(ferme.id, {})
        marge = r["revenus"] - r["cout_aliment"] - r["cout_paie"]
        for cle in ("revenus", "cout_aliment", "cout_paie"):
            total[cle] += r[cle]
        total["marge"] += marge
        total["total_morts"] += z.get("morts") or 0
        total["total_production_oeufs"] += z.get("production_oeufs") or 0

        entree = {
            "ferme_id": ferme.id, "ferme_nom": ferme.nom, "type_ferme": ferme.type,
            "total_morts": z.get("morts") or 0,
            "total_aliment_sacs": str(z.get("aliment_sacs") or Decimal("0")),
            "revenus": str(r["revenus"].quantize(Decimal("1"))),
            "cout_aliment": str(r["cout_aliment"].quantize(Decimal("1"))),
            "cout_paie": str(r["cout_paie"].quantize(Decimal("1"))),
            "marge": str(marge.quantize(Decimal("1"))),
            "prix_sac": str(r["prix_sac"].quantize(Decimal("1"))) if r["prix_sac"] is not None else None,
        }

        if ferme.type == "PONTE":
            production = z.get("production_oeufs") or 0
            hen_days = z.get("effectif_jours") or 0
            aliment_sacs = z.get("aliment_sacs") or Decimal("0")
            entree.update({
                "total_production_oeufs": production,
                "total_casse": z.get("casse") or 0,
                "total_brise": z.get("brise") or 0,
                "taux_ponte_moyen": round(production / hen_days * 100, 2) if hen_days else 0,
                "ic_g_par_oeuf": round(aliment_sacs * 50 * 1000 / production) if production else None,
            })
        else:
            points_pesee = list(
                PointJournalier.objects.filter(
                    bande__ferme=ferme, date__gte=debut, date__lte=fin, poids_moyen_grammes__isnull=False,
                ).order_by("date")
            )
            poids_debut = points_pesee[0].poids_moyen_grammes if points_pesee else None
            poids_fin = points_pesee[-1].poids_moyen_grammes if points_pesee else None
            gmq = None
            if poids_debut is not None and poids_fin is not None and len(points_pesee) > 1:
                jours = (points_pesee[-1].date - points_pesee[0].date).days
                if jours > 0:
                    gmq = round((poids_fin - poids_debut) / jours, 1)
            entree.update({
                "poids_debut_grammes": str(poids_debut) if poids_debut is not None else None,
                "poids_fin_grammes": str(poids_fin) if poids_fin is not None else None,
                "gmq_moyen_grammes": gmq,
            })

        donnees.append(entree)

    donnees.sort(key=lambda d: d["ferme_nom"])
    return Response({
        "mois": debut.isoformat(),
        "fermes": donnees,
        "total": {
            "revenus": str(total["revenus"].quantize(Decimal("1"))),
            "cout_aliment": str(total["cout_aliment"].quantize(Decimal("1"))),
            "cout_paie": str(total["cout_paie"].quantize(Decimal("1"))),
            "marge": str(total["marge"].quantize(Decimal("1"))),
            "total_morts": total["total_morts"],
            "total_production_oeufs": total["total_production_oeufs"],
        },
    })
