"""Notification des erreurs serveur par e-mail, qui dit quand elle échoue.

`AdminEmailHandler` de Django envoie avec `fail_silently=True` codé en dur.
L'intention est saine — un handler de logs ne doit jamais faire tomber la
requête qu'il observe — mais la conséquence l'est moins : quand l'e-mail ne
part pas, l'erreur n'est signalée nulle part, et on croit qu'il n'y a rien à
signaler.

C'est précisément ce qui s'est passé ici. Le suivi d'erreurs a été ajouté le
30/07/2026 ; Brevo n'était pas configuré sur Render ; il n'a donc jamais rien
envoyé, sans que rien ne l'indique. Le détecteur de pannes était en panne, en
silence, depuis sa création.

On garde donc le principe (ne jamais propager), mais on écrit l'échec sur la
sortie d'erreur — que Render conserve dans ses logs. Volontairement en
`sys.stderr` direct plutôt que par le module logging : journaliser depuis un
handler de journalisation invite la récursion.
"""

import sys
import traceback

from django.utils.log import AdminEmailHandler

LONGUEUR_SUJET = 140


class HandlerEmailAdminBavard(AdminEmailHandler):
    def send_mail(self, subject, message, *args, **kwargs):
        try:
            kwargs["fail_silently"] = False
            super().send_mail(subject, message, *args, **kwargs)
        except Exception:
            sys.stderr.write(
                "\n=== L'ALERTE PAR E-MAIL N'A PAS PU ÊTRE ENVOYÉE ===\n"
                f"Sujet non transmis : {subject}\n"
                "Une erreur serveur est survenue ET sa notification a échoué.\n"
                "Vérifiez la configuration e-mail : manage.py diagnostic_email\n"
            )
            traceback.print_exc(file=sys.stderr)


class HandlerErreurFrontend(HandlerEmailAdminBavard):
    """Erreur JavaScript côté client — message court, sans le rapport Django.

    Le rapport d'exception complet décrit le SERVEUR : réglages, applications
    installées, intergiciels. Pour une erreur survenue dans le navigateur d'un
    chef de ferme, il n'apprend rien, noie les trois lignes utiles sous deux
    cents lignes de configuration, et expose au passage l'hôte de la base de
    données dans une boîte mail (07/08/2026, premier e-mail reçu pour de bon).

    Les erreurs SERVEUR, elles, gardent le rapport complet : là, l'état de
    l'application est précisément ce qu'on cherche.
    """

    def emit(self, record):
        message = record.getMessage()
        sujet = message.splitlines()[0][:LONGUEUR_SUJET] if message else "Erreur frontend"
        self.send_mail(f"Erreur frontend — {sujet}", message)
