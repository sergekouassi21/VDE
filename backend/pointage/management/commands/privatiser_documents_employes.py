"""Rend privées les pièces administratives déjà téléversées publiquement.

Le correctif de stockage (cf. pointage/stockage.py) ne vaut que pour les
NOUVEAUX téléversements. Les documents déjà en ligne ont été envoyés en
livraison `upload`, c'est-à-dire publique : ils restent téléchargeables par
quiconque connaît leur URL tant que cette commande n'a pas été passée.

Elle ré-téléverse chaque fichier en `authenticated`, met à jour la référence
en base, puis détruit la copie publique.

    python manage.py privatiser_documents_employes --simulation   # n'écrit rien
    python manage.py privatiser_documents_employes                # applique

Sans Cloudinary configuré (développement local), il n'y a rien à faire : le
stockage disque n'expose aucune URL publique.
"""

from django.core.management.base import BaseCommand

from pointage.models import DocumentEmploye


class Command(BaseCommand):
    help = "Repasse en stockage privé les documents d'employés téléversés publiquement."

    def add_arguments(self, parser):
        parser.add_argument(
            "--simulation",
            action="store_true",
            help="Affiche ce qui serait fait sans rien modifier.",
        )

    def handle(self, *args, **options):
        from django.conf import settings

        if not settings.CLOUDINARY_STORAGE.get("CLOUD_NAME"):
            self.stdout.write("Cloudinary n'est pas configuré : stockage disque, rien à privatiser.")
            return

        import cloudinary.uploader

        from pointage.stockage import StockagePriveDocuments

        simulation = options["simulation"]
        documents = list(DocumentEmploye.objects.select_related("employe").all())
        if not documents:
            self.stdout.write("Aucun document à traiter.")
            return

        self.stdout.write(f"{len(documents)} document(s) à examiner." + (" [SIMULATION]" if simulation else ""))
        stockage = StockagePriveDocuments()
        migres, echecs = 0, 0

        for doc in documents:
            if not doc.fichier:
                continue
            ancien_nom = doc.fichier.name
            etiquette = f"{doc.employe.nom} — {doc.get_type_document_display()}"

            if simulation:
                self.stdout.write(f"  à privatiser : {etiquette} ({ancien_nom})")
                migres += 1
                continue

            try:
                # Lecture via l'URL publique actuelle, avant de la supprimer.
                doc.fichier.open("rb")
                contenu = doc.fichier.read()
                doc.fichier.close()

                nouveau_nom = stockage.save(f"documents_employes/{ancien_nom.split('/')[-1]}", _Fichier(contenu))
                DocumentEmploye.objects.filter(pk=doc.pk).update(fichier=nouveau_nom)

                # La copie publique ne doit surtout pas survivre : c'est elle
                # qui était accessible sans authentification.
                cloudinary.uploader.destroy(ancien_nom, invalidate=True, resource_type="raw", type="upload")
                self.stdout.write(self.style.SUCCESS(f"  privatisé : {etiquette}"))
                migres += 1
            except Exception as erreur:  # noqa: BLE001 — on continue sur les suivants
                echecs += 1
                self.stdout.write(self.style.ERROR(f"  ECHEC : {etiquette} — {erreur}"))

        self.stdout.write("")
        self.stdout.write(f"{migres} traité(s), {echecs} en échec.")
        if echecs:
            self.stdout.write(self.style.WARNING(
                "Les documents en échec restent PUBLICS. Reprenez-les à la main dans Cloudinary."
            ))


class _Fichier:
    """Enveloppe minimale pour repasser un contenu déjà lu au stockage Django."""

    def __init__(self, contenu):
        self._contenu = contenu
        self.size = len(contenu)

    def read(self, *args):
        return self._contenu

    def chunks(self, taille=None):
        yield self._contenu

    def seek(self, *args):
        return 0
