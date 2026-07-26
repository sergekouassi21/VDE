from rest_framework import serializers

from .models import Employe, Pointage


class EmployeSerializer(serializers.ModelSerializer):
    ferme_nom = serializers.CharField(source="ferme.nom", read_only=True)
    user_nom = serializers.SerializerMethodField()

    class Meta:
        model = Employe
        fields = ["id", "nom", "ferme", "ferme_nom", "taux_horaire", "qr_token", "actif", "photo", "user", "user_nom"]
        read_only_fields = ["qr_token"]

    def get_user_nom(self, obj):
        if not obj.user:
            return None
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username


class PointageSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    ferme_nom = serializers.CharField(source="employe.ferme.nom", read_only=True)

    class Meta:
        model = Pointage
        fields = [
            "id", "employe", "employe_nom", "ferme_nom", "date",
            "heure_debut", "heure_fin", "heures_travaillees", "montant_du_jour",
        ]


class CorrigerPointageSerializer(serializers.Serializer):
    """Ce que Direction/Admin peut corriger sur un pointage existant — les
    heures travaillées/montant sont toujours recalculés côté serveur,
    jamais acceptés en entrée."""

    date = serializers.DateField(required=False)
    heure_debut = serializers.DateTimeField(required=False, allow_null=True)
    heure_fin = serializers.DateTimeField(required=False, allow_null=True)


class ScanEmployeSerializer(serializers.ModelSerializer):
    """Réponse publique renvoyée à l'écran de scan — uniquement ce qui est
    nécessaire pour identifier visuellement l'employé, jamais le taux
    horaire (confidentiel, réservé à Direction/Admin)."""

    ferme_nom = serializers.CharField(source="ferme.nom", read_only=True)

    class Meta:
        model = Employe
        fields = ["nom", "ferme_nom", "photo"]
