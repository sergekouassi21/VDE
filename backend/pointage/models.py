import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from exploitation.models import Ferme


class Employe(models.Model):
    """Un ouvrier de ferme rémunéré à l'heure. Le qr_token identifie de
    façon unique et non-devinable son badge personnel — scanner ce
    QR (URL /pointage/<token>) permet de pointer sans compte utilisateur
    ni mot de passe, contrairement aux chefs/sous-chefs/superviseurs."""

    nom = models.CharField(max_length=150)
    ferme = models.ForeignKey(Ferme, on_delete=models.PROTECT, related_name="employes")
    taux_horaire = models.DecimalField(max_digits=10, decimal_places=2, help_text="FCFA par heure travaillée")
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    actif = models.BooleanField(default=True)
    photo = models.ImageField(upload_to="employes/", blank=True, null=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return f"{self.nom} ({self.ferme.nom})"


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
