from django.contrib import admin

from .models import Absence, BadgeAbsence, BadgeTemporaire, DocumentEmploye, Employe, EvaluationEmploye, LignePaie, Pointage


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
    list_display = ["employe", "date", "motif", "statut"]
    list_filter = ["employe__fermes", "date", "statut"]


@admin.register(LignePaie)
class LignePaieAdmin(admin.ModelAdmin):
    list_display = ["employe", "mois", "frais", "primes", "avances", "retenues", "carburant", "appel_internet", "statut"]
    list_filter = ["employe__fermes", "mois", "statut", "mode_paiement"]


@admin.register(EvaluationEmploye)
class EvaluationEmployeAdmin(admin.ModelAdmin):
    list_display = ["employe", "date", "score", "score_max", "created_by"]
    list_filter = ["employe__fermes", "date"]
    search_fields = ["employe__nom"]


@admin.register(DocumentEmploye)
class DocumentEmployeAdmin(admin.ModelAdmin):
    list_display = ["employe", "type_document", "nom", "date_ajout"]
    list_filter = ["type_document"]
    search_fields = ["employe__nom", "nom"]


@admin.register(BadgeTemporaire)
class BadgeTemporaireAdmin(admin.ModelAdmin):
    list_display = ["token", "cree_le"]
    readonly_fields = ["token", "cree_le"]


@admin.register(BadgeAbsence)
class BadgeAbsenceAdmin(admin.ModelAdmin):
    list_display = ["token", "cree_le"]
    readonly_fields = ["token", "cree_le"]
