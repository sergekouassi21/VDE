import uuid
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


class Pointage(models.Model):
    """Un pointage quotidien : heure de début renseignée au premier scan de
    la journée, heure de fin au second. Les heures travaillées et le montant
    du jour ne sont calculés qu'une fois les deux heures connues — jamais
    recalculés à la volée ensuite (même logique d'instantané que
    PointJournalier)."""

    employe = models.ForeignKey(Employe, on_delete=models.PROTECT, related_name="pointages")
    date = models.DateField()
    heure_debut = models.DateTimeField(null=True, blank=True)
    heure_fin = models.DateTimeField(null=True, blank=True)
    heures_travaillees = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant_du_jour = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["employe", "date"], name="un_pointage_par_employe_et_par_jour")
        ]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employe.nom} — {self.date}"

    def valider_debut(self):
        self.heure_debut = timezone.now()
        self.save(update_fields=["heure_debut"])

    def valider_fin(self):
        self.heure_fin = timezone.now()
        duree = self.heure_fin - self.heure_debut
        self.heures_travaillees = (Decimal(duree.total_seconds()) / Decimal(3600)).quantize(Decimal("0.01"))
        self.montant_du_jour = (self.heures_travaillees * self.employe.taux_horaire).quantize(Decimal("0.01"))
        self.save(update_fields=["heure_fin", "heures_travaillees", "montant_du_jour"])


class Absence(models.Model):
    """Une absence déclarée après coup par Direction/Admin — sert
    uniquement à marquer une absence comme JUSTIFIÉE (payée comme une
    journée complète, cf. Employe.salaire_journalier). Une journée ouvrée
    sans Pointage et sans Absence n'a besoin d'aucun enregistrement : elle
    est automatiquement considérée comme une absence injustifiée (non
    payée) au moment de générer le résumé/la fiche de paie."""

    employe = models.ForeignKey(Employe, on_delete=models.CASCADE, related_name="absences")
    date = models.DateField()
    motif = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["employe", "date"], name="une_absence_par_employe_et_par_jour")
        ]
        ordering = ["-date"]

    def __str__(self):
        return f"Absence justifiée — {self.employe.nom} — {self.date}"


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
