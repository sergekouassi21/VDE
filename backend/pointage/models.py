import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from exploitation.models import Ferme

# Base de calcul standard (Côte d'Ivoire) pour convertir un salaire mensuel
# fixe en taux horaire : un mois compte 26 jours ouvrables, une journée de
# travail va de 6h30 à 17h (10,5 h). Ne change que si Serge donne d'autres
# chiffres — cf. conversation du 26/07/2026.
JOURS_OUVRABLES_MOIS = 26
HEURES_JOUR_STANDARD = Decimal("10.5")

JOURS_SEMAINE = [
    (0, "Lundi"), (1, "Mardi"), (2, "Mercredi"), (3, "Jeudi"),
    (4, "Vendredi"), (5, "Samedi"), (6, "Dimanche"),
]


class Employe(models.Model):
    """Une personne suivie par le pointage horaire — un ouvrier sans compte
    (identifié uniquement par son badge QR), ou un chef/sous-chef/
    superviseur/ouvrier/gardien qui a par ailleurs un compte de connexion
    pour l'appli (`user`, optionnel). Le qr_token identifie le badge
    personnel : scanner ce QR (URL /pointage/<token>) suffit pour pointer,
    avec ou sans compte.

    La paie est basée sur un salaire mensuel fixe (pas sur un taux horaire
    saisi à la main) : `taux_horaire` est dérivé automatiquement de
    `salaire_mensuel` à chaque sauvegarde, pour que la somme des jours
    travaillés à taux plein sur un mois complet retombe exactement sur le
    salaire mensuel annoncé."""

    nom = models.CharField(max_length=150)
    fermes = models.ManyToManyField(Ferme, related_name="employes", help_text="Plusieurs fermes possibles (ex: un superviseur qui en supervise plusieurs).")
    salaire_mensuel = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="FCFA par mois")
    taux_horaire = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, editable=False,
        help_text="Calculé automatiquement : salaire_mensuel / (26 jours × 10,5 h)",
    )
    jour_repos = models.IntegerField(choices=JOURS_SEMAINE, null=True, blank=True, help_text="Jour de repos hebdomadaire de cet employé")
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    actif = models.BooleanField(default=True)
    photo = models.ImageField(upload_to="employes/", blank=True, null=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="employe_pointage",
        help_text="Optionnel — si cette personne a aussi un compte de connexion (chef/sous-chef/superviseur/ouvrier/gardien).",
    )

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return f"{self.nom} ({', '.join(self.fermes.values_list('nom', flat=True))})"

    @property
    def salaire_journalier(self):
        return (self.salaire_mensuel / Decimal(JOURS_OUVRABLES_MOIS)).quantize(Decimal("0.01"))

    def save(self, *args, **kwargs):
        self.taux_horaire = (self.salaire_mensuel / (Decimal(JOURS_OUVRABLES_MOIS) * HEURES_JOUR_STANDARD)).quantize(Decimal("0.01"))
        super().save(*args, **kwargs)


class EvaluationEmploye(models.Model):
    """Évaluation du travail d'un employé (ponctualité, qualité du travail,
    comportement — chacun noté 0 à 2) + commentaire libre, faite par un
    technicien/vétérinaire de passage ou la Direction. Tous les employés
    sont concernés, quel que soit leur niveau (ouvrier, sous-chef, chef,
    superviseur) — cf. conversation du 05/08/2026 avec Serge : "il doit
    voir les volaillers, sous chef, chefs et superviseurs font bien leur
    travail"."""

    employe = models.ForeignKey(Employe, on_delete=models.CASCADE, related_name="evaluations")
    date = models.DateField()
    ponctualite = models.PositiveSmallIntegerField(default=0)
    qualite_travail = models.PositiveSmallIntegerField(default=0)
    comportement = models.PositiveSmallIntegerField(default=0)
    commentaire = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]

    CRITERES = ["ponctualite", "qualite_travail", "comportement"]

    @property
    def score(self):
        return sum(getattr(self, c) for c in self.CRITERES)

    @property
    def score_max(self):
        return len(self.CRITERES) * 2

    def __str__(self):
        return f"Évaluation {self.employe.nom} — {self.date}"


class TypeDocumentEmploye(models.TextChoices):
    CNI = "CNI", "Carte Nationale d'Identité"
    CONTRAT = "CONTRAT", "Contrat de travail"
    AUTRE = "AUTRE", "Autre document"


def _storage_documents_employes():
    # PDF/scans quelconques, pas forcément des images — MediaCloudinaryStorage
    # (utilisé pour Employe.photo) refuse les fichiers non-image, il faut le
    # stockage "raw" de Cloudinary pour accepter n'importe quel type.
    #
    # Stockage PRIVÉ : RawMediaCloudinaryStorage téléversait en livraison
    # publique, donc la CNI d'un employé était téléchargeable par quiconque
    # connaissait l'URL, sans authentification. Cf. pointage/stockage.py et
    # l'audit de sécurité du 06/08/2026.
    from django.conf import settings

    if settings.CLOUDINARY_STORAGE.get("CLOUD_NAME"):
        from .stockage import StockagePriveDocuments

        return StockagePriveDocuments()
    from django.core.files.storage import FileSystemStorage

    return FileSystemStorage()


class DocumentEmploye(models.Model):
    """Documents administratifs d'un employé (CNI, contrat...) — accès
    réservé à Direction/Admin comme le reste de la fiche employé, vu la
    sensibilité de ces pièces (point 17 du backlog, cf. conversation du
    27/07/2026 avec Serge)."""

    employe = models.ForeignKey(Employe, on_delete=models.CASCADE, related_name="documents")
    type_document = models.CharField(max_length=10, choices=TypeDocumentEmploye.choices, default=TypeDocumentEmploye.AUTRE)
    nom = models.CharField(max_length=150, blank=True, help_text="Libellé libre (ex: « CNI recto », « Contrat 2026 »)")
    fichier = models.FileField(upload_to="documents_employes/", storage=_storage_documents_employes)
    date_ajout = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date_ajout"]

    def __str__(self):
        return f"{self.get_type_document_display()} — {self.employe.nom}"


class Pointage(models.Model):
    """Un pointage quotidien : heure de début renseignée au premier scan de
    la journée, heure de fin au second. Les heures travaillées et le montant
    du jour ne sont calculés qu'une fois les deux heures connues — jamais
    recalculés à la volée ensuite (même logique d'instantané que
    PointJournalier).

    photo_debut/photo_fin : selfie pris par le téléphone au moment du scan
    (arrivée/départ) — dissuade et permet de vérifier a posteriori qu'un
    employé n'a pas scanné le badge d'un collègue absent, maintenant qu'un
    seul téléphone partagé (plus celui d'un superviseur qui reconnaît
    chacun) scanne le badge de chaque employé (cf. conversation du
    28/07/2026 avec Serge)."""

    employe = models.ForeignKey(Employe, on_delete=models.PROTECT, related_name="pointages")
    date = models.DateField()
    heure_debut = models.DateTimeField(null=True, blank=True)
    heure_fin = models.DateTimeField(null=True, blank=True)
    photo_debut = models.ImageField(upload_to="pointages_selfies/", blank=True, null=True)
    photo_fin = models.ImageField(upload_to="pointages_selfies/", blank=True, null=True)
    # Le badge temporaire de secours n'a aucun jeton personnel à vérifier
    # (n'importe qui choisit n'importe quel nom dans la liste) — signaler
    # quand il a servi, pour l'arrivée et/ou le départ indépendamment (un
    # employé peut arriver avec son badge personnel puis repartir via le
    # secours s'il le perd dans la journée), permet à la Direction de
    # repérer ces pointages plus à risque (cf. conversation du 29/07/2026).
    arrivee_via_secours = models.BooleanField(default=False)
    depart_via_secours = models.BooleanField(default=False)
    heures_travaillees = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant_du_jour = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["employe", "date"], name="un_pointage_par_employe_et_par_jour")
        ]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employe.nom} — {self.date}"

    def valider_debut(self, photo=None, via_secours=False):
        self.heure_debut = timezone.now()
        champs = ["heure_debut"]
        if photo:
            self.photo_debut = photo
            champs.append("photo_debut")
        if via_secours:
            self.arrivee_via_secours = True
            champs.append("arrivee_via_secours")
        self.save(update_fields=champs)

    def valider_fin(self, photo=None, via_secours=False):
        self.heure_fin = timezone.now()
        duree = self.heure_fin - self.heure_debut
        self.heures_travaillees = (Decimal(duree.total_seconds()) / Decimal(3600)).quantize(Decimal("0.01"))
        self.montant_du_jour = (self.heures_travaillees * self.employe.taux_horaire).quantize(Decimal("0.01"))
        champs = ["heure_fin", "heures_travaillees", "montant_du_jour"]
        if photo:
            self.photo_fin = photo
            champs.append("photo_fin")
        if via_secours:
            self.depart_via_secours = True
            champs.append("depart_via_secours")
        self.save(update_fields=champs)


class StatutAbsence(models.TextChoices):
    EN_ATTENTE = "EN_ATTENTE", "En attente de validation"
    VALIDEE = "VALIDEE", "Validée (payée)"
    REJETEE = "REJETEE", "Rejetée (non payée)"


class Absence(models.Model):
    """Une absence pour un employé. Deux façons d'en créer une :

    1. Direction/Admin la déclare directement depuis l'appli — validée
       (payée) immédiatement, pas de revue nécessaire puisqu'ils sont
       eux-mêmes l'autorité de validation.
    2. Un superviseur la signale sur le terrain via le badge dédié (motif
       obligatoire) — reste EN_ATTENTE jusqu'à ce que Direction/Admin la
       valide (payée comme une journée complète, cf.
       Employe.salaire_journalier) ou la rejette (non payée).

    Une journée ouvrée sans Pointage et sans Absence (validée ou en
    attente) n'a besoin d'aucun enregistrement : elle est automatiquement
    considérée comme une absence injustifiée (non payée) au moment de
    générer le résumé/la fiche de paie."""

    employe = models.ForeignKey(Employe, on_delete=models.CASCADE, related_name="absences")
    date = models.DateField()
    motif = models.CharField(max_length=255, blank=True)
    statut = models.CharField(max_length=10, choices=StatutAbsence.choices, default=StatutAbsence.VALIDEE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["employe", "date"], name="une_absence_par_employe_et_par_jour")
        ]
        ordering = ["-date"]

    def __str__(self):
        return f"Absence ({self.get_statut_display()}) — {self.employe.nom} — {self.date}"


class ModePaiementPointage(models.TextChoices):
    WAVE = "WAVE", "Wave"
    ORANGE_MONEY = "ORANGE_MONEY", "Orange Money"
    MTN_MONEY = "MTN_MONEY", "MTN Money"
    MOOV_MONEY = "MOOV_MONEY", "Moov Money"
    ESPECES = "ESPECES", "Main en main"
    VIREMENT = "VIREMENT", "Virement bancaire"


class StatutPaiement(models.TextChoices):
    A_PAYER = "A_PAYER", "À payer"
    PAYE = "PAYE", "Payé"


class LignePaie(models.Model):
    """Les ajustements de paie du mois pour un employé, en plus du montant
    calculé automatiquement à partir du pointage (heures travaillées +
    absences justifiées) — reprend les colonnes du tableau de paie papier
    (frais, primes, avances, retenues, carburant, appel/internet, mode et
    statut de paiement). Une seule ligne par employé et par mois."""

    employe = models.ForeignKey(Employe, on_delete=models.CASCADE, related_name="lignes_paie")
    mois = models.DateField(help_text="Premier jour du mois concerné (ex: 2026-06-01 pour juin 2026)")
    frais = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    primes = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    avances = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    retenues = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    carburant = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    appel_internet = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    mode_paiement = models.CharField(max_length=15, choices=ModePaiementPointage.choices, blank=True)
    reference_transaction = models.CharField(max_length=100, blank=True)
    date_paiement = models.DateField(null=True, blank=True)
    statut = models.CharField(max_length=10, choices=StatutPaiement.choices, default=StatutPaiement.A_PAYER)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["employe", "mois"], name="une_ligne_paie_par_employe_et_par_mois")
        ]
        ordering = ["-mois"]

    def __str__(self):
        return f"Paie {self.employe.nom} — {self.mois:%Y-%m}"


class AppareilPointage(models.Model):
    """Jeton du téléphone unique autorisé à valider les pointages — un seul
    existe en pratique (créé à la demande si absent, même principe que
    BadgeTemporaire/BadgeAbsence). Le téléphone désigné « s'active » en
    scannant le QR encodant ce jeton (page /pointage/appareil/<token>), qui
    reste alors enregistré dans son navigateur (localStorage) et doit être
    présenté à chaque validation. Si aucun AppareilPointage n'existe
    encore, aucune vérification n'est appliquée (transition en douceur —
    ne casse pas l'usage existant tant que la Direction n'a pas activé
    cette protection). Régénérer le jeton (au lieu de le modifier) invalide
    immédiatement l'ancien téléphone, utile en cas de perte/vol/changement
    d'appareil — cf. conversation du 28/07/2026 avec Serge."""

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    cree_le = models.DateTimeField(auto_now_add=True)
    # Un jeton volé/perdu restait valide indéfiniment jusqu'à régénération
    # manuelle par la Direction — une validité bornée dans le temps limite
    # les dégâts d'un vol non remarqué. derniere_utilisation permet à la
    # Direction de repérer un appareil resté inactif (perdu ?) avant même
    # l'expiration.
    VALIDITE_JOURS = 180
    derniere_utilisation = models.DateTimeField(null=True, blank=True)

    def est_expire(self):
        return timezone.now() > self.cree_le + timedelta(days=self.VALIDITE_JOURS)

    def __str__(self):
        return f"Appareil de pointage ({self.token})"


class BadgeTemporaire(models.Model):
    """Badge de secours partagé (imprimé une seule fois, gardé par le
    superviseur/chef de ferme) pour le cas où un employé a oublié ou perdu
    son badge personnel. Scanner ce badge ouvre une liste de tous les
    employés actifs, dans laquelle on choisit manuellement la bonne
    personne au lieu d'identifier directement un seul employé comme pour
    un badge normal. Le token joue le même rôle de clé d'accès non
    devinable que Employe.qr_token."""

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    cree_le = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Badge temporaire ({self.token})"


class BadgeAbsence(models.Model):
    """Badge partagé distinct du badge de secours, pour qu'un superviseur
    signale sur le terrain l'absence d'un employé avec un motif — la
    déclaration reste EN_ATTENTE jusqu'à validation par Direction/Admin
    (cf. Absence.statut)."""

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    cree_le = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Badge absence ({self.token})"
