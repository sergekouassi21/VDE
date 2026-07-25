from django.contrib import admin

from .models import Employe, Pointage


@admin.register(Employe)
class EmployeAdmin(admin.ModelAdmin):
    list_display = ["nom", "ferme", "taux_horaire", "actif", "qr_token"]
    list_filter = ["ferme", "actif"]
    readonly_fields = ["qr_token"]
    search_fields = ["nom"]


@admin.register(Pointage)
class PointageAdmin(admin.ModelAdmin):
    list_display = ["employe", "date", "heure_debut", "heure_fin", "heures_travaillees", "montant_du_jour"]
    list_filter = ["employe__ferme", "date"]
    readonly_fields = ["heures_travaillees", "montant_du_jour"]
