from rest_framework import serializers

from .models import Absence, Employe, LignePaie, Pointage


def _noms_fermes(employe):
    return ", ".join(employe.fermes.values_list("nom", flat=True))


def _role_employe(employe):
    if not employe.user:
        return None
    profil = getattr(employe.user, "profil", None)
    return profil.get_role_display() if profil else None


def _telephone_employe(employe):
    if not employe.user:
        return ""
    profil = getattr(employe.user, "profil", None)
    return profil.telephone if profil else ""


class EmployeSerializer(serializers.ModelSerializer):
    fermes_noms = serializers.SerializerMethodField()
    user_nom = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    telephone = serializers.SerializerMethodField()

    class Meta:
        model = Employe
        fields = [
            "id", "nom", "fermes", "fermes_noms", "salaire_mensuel", "taux_horaire",
            "jour_repos", "qr_token", "actif", "photo", "user", "user_nom", "role", "telephone",
        ]
        read_only_fields = ["qr_token", "taux_horaire"]

    def get_fermes_noms(self, obj):
        return _noms_fermes(obj)

    def get_user_nom(self, obj):
        if not obj.user:
            return None
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def get_role(self, obj):
        return _role_employe(obj)

    def get_telephone(self, obj):
        return _telephone_employe(obj)


class PointageSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    ferme_nom = serializers.SerializerMethodField()

    class Meta:
        model = Pointage
        fields = [
            "id", "employe", "employe_nom", "ferme_nom", "date",
            "heure_debut", "heure_fin", "heures_travaillees", "montant_du_jour",
        ]

    def get_ferme_nom(self, obj):
        return _noms_fermes(obj.employe)


class CorrigerPointageSerializer(serializers.Serializer):
    """Ce que Direction/Admin peut corriger sur un pointage existant — les
    heures travaillées/montant sont toujours recalculés côté serveur,
    jamais acceptés en entrée."""

    date = serializers.DateField(required=False)
    heure_debut = serializers.DateTimeField(required=False, allow_null=True)
    heure_fin = serializers.DateTimeField(required=False, allow_null=True)


class AbsenceSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    ferme_nom = serializers.SerializerMethodField()

    class Meta:
        model = Absence
        fields = ["id", "employe", "employe_nom", "ferme_nom", "date", "motif"]

    def get_ferme_nom(self, obj):
        return _noms_fermes(obj.employe)


class LignePaieSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    ferme_nom = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    telephone = serializers.SerializerMethodField()

    class Meta:
        model = LignePaie
        fields = [
            "id", "employe", "employe_nom", "ferme_nom", "role", "telephone", "mois",
            "frais", "primes", "avances", "retenues", "carburant", "appel_internet",
            "mode_paiement", "reference_transaction", "date_paiement", "statut",
        ]

    def get_ferme_nom(self, obj):
        return _noms_fermes(obj.employe)

    def get_role(self, obj):
        return _role_employe(obj.employe)

    def get_telephone(self, obj):
        return _telephone_employe(obj.employe)


class ScanEmployeSerializer(serializers.ModelSerializer):
    """Réponse publique renvoyée à l'écran de scan — uniquement ce qui est
    nécessaire pour identifier visuellement l'employé, jamais le salaire
    (confidentiel, réservé à Direction/Admin)."""

    ferme_nom = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = Employe
        fields = ["nom", "ferme_nom", "photo", "role"]

    def get_ferme_nom(self, obj):
        return _noms_fermes(obj)

    def get_role(self, obj):
        return _role_employe(obj)
