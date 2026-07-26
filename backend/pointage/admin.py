from django.contrib import admin

from .models import Absence, BadgeTemporaire, Employe, LignePaie, Pointage


@admin.register(Employe)
class EmployeAdmin(admin.ModelAdmin):
    list_display = ["nom", "salaire_mensuel", "taux_horaire", "jour_repos", "actif", "qr_token"]
    list_filter = ["fermes", "actif"]
    readonly_fields = ["qr_token", "taux_horaire"]
    search_fields = ["nom"]


@admin.register(Pointage)
class PointageAdmin(admin.ModelAdmin):
    list_display = ["employe", "date", "heure_debut", "heure_fin", "heures_travaillees", "montant_du_jour"]
    list_filter = ["employe__fermes", "date"]
    readonly_fields = ["heures_travaillees", "montant_du_jour"]


@admin.register(Absence)
class AbsenceAdmin(admin.ModelAdmin):
    list_display = ["employe", "date", "motif"]
    list_filter = ["employe__fermes", "date"]


@admin.register(LignePaie)
class LignePaieAdmin(admin.ModelAdmin):
    list_display = ["employe", "mois", "frais", "primes", "avances", "retenues", "carburant", "appel_internet", "statut"]
    list_filter = ["employe__fermes", "mois", "statut", "mode_paiement"]


@admin.register(BadgeTemporaire)
class BadgeTemporaireAdmin(admin.ModelAdmin):
    list_display = ["token", "cree_le"]
    readonly_fields = ["token", "cree_le"]
