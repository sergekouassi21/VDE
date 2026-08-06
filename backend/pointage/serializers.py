from rest_framework import serializers

from .models import Absence, DocumentEmploye, Employe, EvaluationEmploye, LignePaie, Pointage


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


class EvaluationEmployeSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    created_by_nom = serializers.CharField(source="created_by.username", read_only=True, default=None)
    score = serializers.ReadOnlyField()
    score_max = serializers.ReadOnlyField()

    class Meta:
        model = EvaluationEmploye
        fields = [
            "id", "employe", "employe_nom", "date", "ponctualite", "qualite_travail", "comportement",
            "commentaire", "score", "score_max", "created_by", "created_by_nom", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]


class PointageSerializer(serializers.ModelSerializer):
    employe_nom = serializers.CharField(source="employe.nom", read_only=True)
    ferme_nom = serializers.SerializerMethodField()

    class Meta:
        model = Pointage
        fields = [
            "id", "employe", "employe_nom", "ferme_nom", "date",
            "heure_debut", "heure_fin", "photo_debut", "photo_fin",
            "arrivee_via_secours", "depart_via_secours", "heures_travaillees", "montant_du_jour",
            # Le téléphone n'a pas su se localiser au moment du scan — la
            # Direction le voit en alerte plutôt que de le découvrir en
            # cherchant (cf. pointage/geo.py).
            "sans_position_debut", "sans_position_fin",
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
        fields = ["id", "employe", "employe_nom", "ferme_nom", "date", "motif", "statut"]

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


class DocumentEmployeSerializer(serializers.ModelSerializer):
    # `fichier` reste accepté en écriture (téléversement multipart) mais n'est
    # plus jamais RENVOYÉ : il exposait l'URL du stockage, que le navigateur
    # allait chercher directement, sans que l'API ne puisse vérifier quoi que
    # ce soit. On ne publie plus qu'un chemin d'API, protégé par le rôle.
    # Cf. audit de sécurité du 06/08/2026.
    fichier = serializers.FileField(write_only=True)
    fichier_url = serializers.SerializerMethodField()

    class Meta:
        model = DocumentEmploye
        fields = ["id", "employe", "type_document", "nom", "fichier", "fichier_url", "date_ajout"]
        read_only_fields = ["date_ajout"]

    def get_fichier_url(self, obj):
        if not obj.fichier:
            return None
        return f"/api/pointage/documents-employe/{obj.id}/fichier/"
