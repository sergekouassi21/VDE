"""Stockage privé pour les pièces administratives des employés (CNI, contrats).

Le stockage Cloudinary fourni par django-cloudinary-storage téléverse sans
préciser de `type`, et Cloudinary applique alors `upload` — c'est-à-dire une
livraison PUBLIQUE. L'API vérifiait bien que seule la Direction pouvait
LISTER les documents, mais le fichier lui-même était servi par Cloudinary
sans aucune authentification : quiconque obtenait l'URL (lien transféré,
historique de navigateur, partage d'écran) téléchargeait la carte d'identité
d'un employé. Cf. audit de sécurité du 06/08/2026.

Ici, les fichiers sont téléversés en `authenticated` : Cloudinary refuse
alors de les livrer sans URL signée par la clé secrète du compte. Cette URL
n'est jamais transmise au navigateur — c'est Django qui la fabrique, récupère
le fichier et le retransmet, après avoir vérifié que l'utilisateur est bien
Direction/Admin (cf. DocumentEmployeViewSet.fichier). Le contrôle d'accès
redevient donc une décision de l'application, à chaque téléchargement.
"""

import os

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from cloudinary_storage.storage import RawMediaCloudinaryStorage


class StockagePriveDocuments(RawMediaCloudinaryStorage):
    TYPE_LIVRAISON = "authenticated"

    def _upload(self, name, content):
        dossier = os.path.dirname(name)
        options = {
            # Nom d'origine volontairement abandonné au profit d'un
            # identifiant aléatoire : un fichier « cni-kouassi.pdf » se
            # devine, et le nom lui-même révèle déjà de quoi il s'agit et
            # de qui.
            "use_filename": False,
            "unique_filename": True,
            "resource_type": self._get_resource_type(name),
            "type": self.TYPE_LIVRAISON,
            "tags": self.TAG,
        }
        if dossier:
            options["folder"] = dossier
        return cloudinary.uploader.upload(content, **options)

    def _get_url(self, name):
        """URL signée, utilisée UNIQUEMENT côté serveur.

        Sans signature, Cloudinary répond 401 sur un asset `authenticated`.
        Cette URL ne doit jamais partir vers le navigateur : elle donne accès
        au fichier à quiconque la détient.
        """
        name = self._prepend_prefix(name)
        url, _ = cloudinary.utils.cloudinary_url(
            name,
            resource_type=self._get_resource_type(name),
            type=self.TYPE_LIVRAISON,
            sign_url=True,
            secure=True,
        )
        return url

    def delete(self, name):
        reponse = cloudinary.uploader.destroy(
            name,
            invalidate=True,
            resource_type=self._get_resource_type(name),
            type=self.TYPE_LIVRAISON,
        )
        return reponse.get("result") == "ok"
